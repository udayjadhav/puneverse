/**
 * PuneVerse real-time 3D city scene (Three.js, WebGL2). One local metric grid
 * (UTM 43N around Shaniwar Wada); assets streamed per 1 km chunk from
 * public/scene/s0, geometry built in workers.
 */

import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  Clock,
  Color,
  DepthTexture,
  DirectionalLight,
  FloatType,
  FogExp2,
  Group,
  HalfFloatType,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type Texture,
  LinearMipmapLinearFilter,
  PCFShadowMap,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import type { BuiltBuildings } from "./buildingGeometry";
import { estimateFloors } from "./buildingGeometry";
import { CameraRig, orbitPose } from "./camera";
import { ELEV_BASE, PUNE_LAT, PUNE_LON, SCENE_URL } from "./constants";
import { fromWorld, localToLonLat, toWorld } from "./coords";
import { fetchPVB } from "./format";
import { LabelLayer } from "./labels";
import {
  makeBuildingMaterial,
  makeRoadMaterial,
  makeSharedUniforms,
  makeTerrainMaterial,
  makeWaterMaterial,
  type SharedUniforms,
} from "./materials";
import {
  makeLampGeometry,
  makeLightPoolGeometry,
  makePierGeometry,
  makeStairHeadGeometry,
  makeTankGeometry,
} from "./models";
import { computeAabbs, PickIndex } from "./pick";
import { makeLightPoolMaterial, makePropMaterial } from "./propMaterial";
import { dayFactor, sunPosition } from "./sun";
import { TerrainSampler, type TerrainMeta } from "./terrainSampler";
import { TrafficSystem, type RoadNetwork } from "./traffic";
import { TreeSystem } from "./trees";
import { chunkKey, selectResidentChunks } from "./stream";
import { HEIGHT_SOURCES, KIND_NAMES, type ChunkInfo, type PickedBuilding, type Preset, type SceneManifest } from "../types";

export type Detail = "low" | "medium" | "high" | "ultra";

interface DetailCfg {
  pixelRatio: number;
  shadow: number;
  nearTrees: number;
  traffic: number;
  roofDist: number;
  /** How far from the camera (m) to keep building chunks resident. */
  streamRadius: number;
  /** Hard cap on resident building chunks (GPU budget). */
  maxChunks: number;
}

/** Ultra = richer near-field, not “load all of Pune”. */
export const DETAIL: Record<Detail, DetailCfg> = {
  low: { pixelRatio: 1, shadow: 0, nearTrees: 350, traffic: 400, roofDist: 700, streamRadius: 2800, maxChunks: 48 },
  medium: { pixelRatio: 1.25, shadow: 1024, nearTrees: 650, traffic: 1200, roofDist: 1600, streamRadius: 4200, maxChunks: 90 },
  high: { pixelRatio: 1.5, shadow: 2048, nearTrees: 1000, traffic: 2200, roofDist: 2800, streamRadius: 5600, maxChunks: 130 },
  ultra: { pixelRatio: 1.5, shadow: 2048, nearTrees: 1300, traffic: 2800, roofDist: 3800, streamRadius: 7000, maxChunks: 170 },
};

export interface EngineEvents {
  stage: (id: string) => void;
  manifest: (m: SceneManifest) => void;
  ready: () => void;
  error: (e: string) => void;
  readout: (r: { place: string; lat: number; lon: number; eye: number }) => void;
  hover: (h: { info: PickedBuilding; x: number; y: number } | null) => void;
  fps: (f: number) => void;
}

interface ChunkRecord {
  key: string;
  ix: number;
  iy: number;
  ox: number;
  oy: number;
  mesh: Mesh;
  height: Float32Array;
  src: Uint8Array;
  kind: Uint8Array;
  name: Int32Array;
  props: Group;
  center: Vector3;
  tree: Float32Array | null;
  pickGeom: { position: Float32Array; index: Uint32Array; triStart: Uint32Array; aabb: Float32Array } | null;
}

/** Launch like Mumbai’s opening oblique — low pitch = side skyline, not roof plan. */
export const LAUNCH = { x: -350, y: 150, dist: 2400, pitch: 18, bearing: 38 };

/** Per-place side views (bearing degrees, 0 = look north). Mimics Worli / Sea Link chips. */
const FLY_VIEW: Record<string, { dist: number; pitch: number; bearing: number }> = {
  "Shaniwar Wada": { dist: 900, pitch: 16, bearing: 48 },
  "Dagdusheth Ganpati": { dist: 520, pitch: 14, bearing: 30 },
  "Pune Station": { dist: 1100, pitch: 15, bearing: 200 },
  "Bund Garden": { dist: 1200, pitch: 14, bearing: 220 },
  "Bund Garden Bridge": { dist: 1000, pitch: 12, bearing: 230 },
  "Sambhaji Bridge": { dist: 900, pitch: 12, bearing: 40 },
  "Shivaji Bridge": { dist: 900, pitch: 12, bearing: 50 },
  "Aga Khan Palace": { dist: 1000, pitch: 15, bearing: 240 },
  "Koregaon Park": { dist: 1300, pitch: 14, bearing: 200 },
  "Sinhgad Fort": { dist: 2200, pitch: 16, bearing: 40 },
  "Wagholi": { dist: 1600, pitch: 15, bearing: 240 },
  "Wadgaon Sheri": { dist: 1300, pitch: 14, bearing: 220 },
  Parvati: { dist: 1400, pitch: 16, bearing: 20 },
  Deccan: { dist: 1000, pitch: 15, bearing: 100 },
  Swargate: { dist: 1100, pitch: 15, bearing: 10 },
  "Jawaharlal Nehru Cricket Stadium": { dist: 900, pitch: 14, bearing: 35 },
  Sarasbaug: { dist: 900, pitch: 14, bearing: 40 },
};

export class SceneEngine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly rig: CameraRig;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private sky = new Sky();
  private envSky = new Sky();
  private envScene = new Scene();
  private pmrem: PMREMGenerator;
  private envTarget: WebGLRenderTarget | null = null;
  private sun = new DirectionalLight(0xffffff, 3);
  private hemi = new HemisphereLight(0xdfe8f5, 0x6b5a45, 0.8);
  private u: SharedUniforms = makeSharedUniforms();
  private clock = new Clock();
  private labels: LabelLayer;
  private trees: TreeSystem;
  private traffic: TrafficSystem | null = null;
  private network: RoadNetwork | null = null;
  private chunkMap = new Map<string, ChunkRecord>();
  private builtList: ChunkRecord[] = [];
  private pickIndex = new PickIndex();
  private terrain: TerrainSampler | null = null;
  private workers: Worker[] = [];
  private pending = new Map<number, (d: unknown) => void>();
  private reqId = 0;
  private raf = 0;
  private disposed = false;
  private detail: Detail = "high";
  private hour = 16.9;
  private envHour = -99;
  private lastReadout = 0;
  private frames = 0;
  private fpsT = 0;
  private hoverT = 0;
  private pointer: { x: number; y: number; dirty: boolean } | null = null;
  private manifest: SceneManifest | null = null;
  private chunkCatalog: ChunkInfo[] = [];
  private chunkSize = 1000;
  private loadingKeys = new Set<string>();
  private streamBusy = false;
  private lastStreamCam = new Vector3(1e9, 0, 0);
  private treesDirty = false;
  private buildingMat = makeBuildingMaterial(this.u);
  private propMat = makePropMaterial(this.u, { roughness: 0.6 });
  private resizeObs: ResizeObserver;
  readonly reversedDepth: boolean;

  private container: HTMLElement;
  private ev: EngineEvents;

  constructor(container: HTMLElement, ev: EngineEvents) {
    this.container = container;
    this.ev = ev;
    this.renderer = new WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
      reversedDepthBuffer: true,
      stencil: false,
    });
    this.reversedDepth = this.renderer.capabilities.reversedDepthBuffer === true;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.58;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;";
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(50, 1, this.reversedDepth ? 0.5 : 2, 120000);
    this.rig = new CameraRig(this.camera, this.renderer.domElement);
    this.rig.groundAt = (x, z) => (this.terrain ? this.terrain.sample(x, -z) - ELEV_BASE : 0);

    this.sky.scale.setScalar(100000);
    this.scene.add(this.sky);
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.pmrem = new PMREMGenerator(this.renderer);

    this.scene.fog = new FogExp2(0xc9d3dc, 0.00006);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.5;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    this.trees = new TreeSystem(this.u);
    this.scene.add(this.trees.group);

    const rt = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    rt.depthTexture = new DepthTexture(1, 1, FloatType);
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.2, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.labels = new LabelLayer(container);

    const n = Math.min(4, Math.max(2, (navigator.hardwareConcurrency || 4) - 2));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL("./chunkWorker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e) => {
        const cb = this.pending.get(e.data.id);
        if (cb) {
          this.pending.delete(e.data.id);
          cb(e.data);
        }
      };
      this.workers.push(w);
    }

    this.renderer.domElement.addEventListener("pointermove", this.onPointer);
    this.renderer.domElement.addEventListener("pointerleave", this.onLeave);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.setTime(this.hour);
    const p = orbitPose(toWorld(LAUNCH.x, LAUNCH.y, 560), LAUNCH.dist, LAUNCH.pitch, LAUNCH.bearing);
    this.rig.jumpTo(p);
    this.loop();
  }

  // ------------------------------------------------------------------ loading

  private work<T>(msg: Record<string, unknown>, w: number): Promise<T> {
    const id = ++this.reqId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, (d) => {
        const r = d as { error?: string };
        if (r.error) reject(new Error(r.error));
        else resolve(d as T);
      });
      this.workers[w % this.workers.length].postMessage({ ...msg, id });
    });
  }

  async load(): Promise<void> {
    try {
      const res = await fetch(`${SCENE_URL}/manifest.json`);
      if (!res.ok) throw new Error(`Scene not baked yet (manifest HTTP ${res.status}). Run pipeline/bake_scene.py.`);
      const m = (await res.json()) as SceneManifest;
      this.manifest = m;
      this.ev.manifest(m);
      this.ev.stage("manifest");

      const [terr, outer, ground, outerTex] = await Promise.all([
        fetchPVB<TerrainMeta>(`${SCENE_URL}/terrain.bin`),
        fetchPVB<TerrainMeta>(`${SCENE_URL}/outer.bin`).catch(() => null),
        this.loadTexture(`${SCENE_URL}/ground.jpg`),
        this.loadTexture(`${SCENE_URL}/outer.jpg`).catch(() => null),
      ]);
      this.terrain = new TerrainSampler(terr.meta, terr.arrays.height as Float32Array);
      this.addTerrain(terr.meta, terr.arrays.height as Float32Array, ground, false);
      if (outer && outerTex) this.addTerrain(outer.meta, outer.arrays.height as Float32Array, outerTex, true);
      this.ev.stage("terrain");
      this.ev.stage("imagery");

      const water = await fetchPVB(`${SCENE_URL}/water.bin`);
      this.addWater(water.arrays.position as Float32Array);
      await this.addStadiums();

      const net = await this.work<NetworkResult>({ type: "network", roadsUrl: `${SCENE_URL}/roads.bin`, railUrl: `${SCENE_URL}/rail.bin` }, 0);
      this.addNetwork(net);
      this.ev.stage("network");

      this.chunkCatalog = m.chunks;
      this.chunkSize = m.chunk_size;
      // No hand-built landmark meshes — Mumbai-style look from real footprints + shaders only.
      this.addLabels(m);
      this.applyDetail(this.detail);
      await this.syncChunks(true);
      this.ev.stage("buildings");
      this.ev.stage("trees");
      this.ev.stage("lighting");
      this.ev.ready();
    } catch (e) {
      this.ev.error(String((e as Error).message ?? e));
    }
  }

  /** Load / unload building chunks around the camera within the detail budget. */
  private async syncChunks(force = false) {
    if (!this.manifest || this.disposed || this.streamBusy) return;
    const worldMoved = this.camera.position.distanceTo(this.lastStreamCam) > 220;
    if (!force && !worldMoved) return;
    this.streamBusy = true;
    try {
      const cam = fromWorld(this.camera.position);
      const cfg = DETAIL[this.detail];
      const want = selectResidentChunks(this.chunkCatalog, this.chunkSize, cam.x, cam.y, cfg);
      const wantKeys = new Set(want.map((c) => chunkKey(c.ix, c.iy)));
      for (const [, rec] of [...this.chunkMap.entries()]) {
        if (!wantKeys.has(rec.key)) this.evictChunk(rec);
      }
      const missing = want.filter((c) => {
        const key = chunkKey(c.ix, c.iy);
        return !this.chunkMap.has(key) && !this.loadingKeys.has(key);
      });
      await Promise.all(
        missing.map(async (c, i) => {
          const key = chunkKey(c.ix, c.iy);
          this.loadingKeys.add(key);
          try {
            const r = await this.work<ChunkResult>(
              { type: "chunk", url: `${SCENE_URL}/chunks/c_${c.ix}_${c.iy}.bin`, parapets: true },
              i,
            );
            if (this.disposed || !wantKeys.has(key)) return;
            this.ingestChunk(c.ix, c.iy, r);
          } finally {
            this.loadingKeys.delete(key);
          }
        }),
      );
      if (this.treesDirty) this.rebuildTrees();
      this.rebuildPick();
      this.lastStreamCam.copy(this.camera.position);
    } finally {
      this.streamBusy = false;
    }
  }

  private evictChunk(rec: ChunkRecord) {
    if (rec.mesh.geometry.getAttribute("position")) {
      this.scene.remove(rec.mesh);
      rec.mesh.geometry.dispose();
    }
    this.scene.remove(rec.props);
    rec.props.traverse((o) => {
      const m = o as Mesh;
      if ((m as Mesh).isMesh) m.geometry.dispose();
    });
    this.chunkMap.delete(rec.key);
    this.treesDirty = true;
  }

  private rebuildTrees() {
    this.trees.clear();
    for (const rec of this.chunkMap.values()) {
      if (rec.tree) this.trees.addChunk(rec.tree, rec.ox, rec.oy);
    }
    this.treesDirty = false;
  }

  private rebuildPick() {
    this.pickIndex.clear();
    this.builtList = [];
    for (const rec of this.chunkMap.values()) {
      if (!rec.pickGeom || !rec.height.length) continue;
      this.pickIndex.add(rec.pickGeom);
      this.builtList.push(rec);
    }
  }

  private loadTexture(url: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      new TextureLoader().load(
        url,
        (t) => {
          t.colorSpace = SRGBColorSpace;
          t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
          t.minFilter = LinearMipmapLinearFilter;
          resolve(t);
        },
        undefined,
        () => reject(new Error(`${url} failed`)),
      );
    });
  }

  private addTerrain(meta: TerrainMeta, h: Float32Array, tex: Texture, outer: boolean) {
    const w = (meta.nx - 1) * meta.step;
    const d = (meta.ny - 1) * meta.step;
    const g = new PlaneGeometry(w, d, meta.nx - 1, meta.ny - 1);
    g.rotateX(-Math.PI / 2);
    const pos = g.getAttribute("position") as BufferAttribute;
    // PlaneGeometry rows run from +z (south after rotation? no: top row = −z = north).
    for (let j = 0; j < meta.ny; j++) {
      for (let i = 0; i < meta.nx; i++) {
        const vi = j * meta.nx + i;
        const row = meta.ny - 1 - j;
        pos.setY(vi, h[row * meta.nx + i] - ELEV_BASE);
      }
    }
    g.translate(meta.x0 + w / 2, 0, -(meta.y0 + d / 2));
    g.computeVertexNormals();
    const mesh = new Mesh(g, makeTerrainMaterial(tex));
    mesh.receiveShadow = !outer;
    mesh.name = outer ? "horizon" : "terrain";
    if (outer) (mesh.material as { fog?: boolean }).fog = true;
    this.scene.add(mesh);
  }

  private addWater(pos: Float32Array) {
    const g = new BufferGeometry();
    const p = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      // Keep water slightly below bank berms baked into terrain.
      p[i] = pos[i];
      p[i + 1] = pos[i + 2] - ELEV_BASE - 0.35;
      p[i + 2] = -pos[i + 1];
    }
    // Triangles from the bake are CCW in (x, north); flipping north keeps them CCW from above.
    g.setAttribute("position", new BufferAttribute(p, 3));
    g.computeVertexNormals();
    const mesh = new Mesh(g, makeWaterMaterial(this.u));
    mesh.material.side = 2;
    mesh.receiveShadow = true;
    mesh.name = "water";
    this.scene.add(mesh);
  }

  /** Procedural stadium bowls from OSM leisure=stadium (replaces boxy stand buildings). */
  private async addStadiums() {
    try {
      const st = await fetchPVB<{ kind: string }>(`${SCENE_URL}/stadiums.bin`);
      const pos = st.arrays.position as Float32Array;
      const col = st.arrays.color as Uint8Array;
      const index = st.arrays.index as Uint32Array;
      if (!pos?.length || !index?.length) return;
      const g = new BufferGeometry();
      const p = new Float32Array(pos.length);
      for (let i = 0; i < pos.length; i += 3) {
        p[i] = pos[i];
        p[i + 1] = pos[i + 2] - ELEV_BASE;
        p[i + 2] = -pos[i + 1];
      }
      const c = new Float32Array((col.length / 3) * 3);
      for (let i = 0; i < col.length; i++) c[i] = col[i] / 255;
      g.setAttribute("position", new BufferAttribute(p, 3));
      g.setAttribute("color", new BufferAttribute(c, 3));
      g.setIndex(new BufferAttribute(index, 1));
      g.computeVertexNormals();
      const mesh = new Mesh(
        g,
        new MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02 }),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = "stadiums";
      this.scene.add(mesh);
    } catch {
      /* optional asset until rebake */
    }
  }

  private addNetwork(net: NetworkResult) {
    const mat = makeRoadMaterial(this.u);
    for (const [r, cast] of [[net.roadRibbon, true], [net.railRibbon, true]] as const) {
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(r.position, 3));
      g.setAttribute("uv", new BufferAttribute(r.uv, 2));
      g.setAttribute("rdata", new BufferAttribute(r.rdata, 4));
      g.setIndex(new BufferAttribute(r.index, 1));
      g.computeVertexNormals();
      const mesh = new Mesh(g, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = cast;
      this.scene.add(mesh);
    }
    const m4 = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const addPiers = (arr: Float32Array, round: boolean) => {
      const n = arr.length / 5;
      if (!n) return;
      const mesh = new InstancedMesh(makePierGeometry(round), this.propMat, n);
      for (let i = 0; i < n; i++) {
        const [x, y, top, bottom, w] = arr.subarray(i * 5, i * 5 + 5);
        m4.compose(new Vector3(x, bottom - ELEV_BASE, -y), q.identity(), new Vector3(w, Math.max(0.5, top - bottom), w));
        mesh.setMatrixAt(i, m4);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };
    addPiers(net.roads.pier, false);
    addPiers(net.railPier, true);

    const lamps = net.roads.lamp;
    const ln = lamps.length / 4;
    const lampMesh = new InstancedMesh(makeLampGeometry(), this.propMat, ln);
    const pool = new InstancedMesh(makeLightPoolGeometry(), makeLightPoolMaterial(this.u), ln);
    for (let i = 0; i < ln; i++) {
      const x = lamps[i * 4], y = lamps[i * 4 + 1], z = lamps[i * 4 + 2], a = lamps[i * 4 + 3];
      q.setFromAxisAngle(up, a);
      m4.compose(new Vector3(x, z - ELEV_BASE, -y), q, new Vector3(1, 1, 1));
      lampMesh.setMatrixAt(i, m4);
      const px = x + Math.cos(a) * 3.5, py = y + Math.sin(a) * 3.5;
      m4.compose(new Vector3(px, z - ELEV_BASE + 0.25, -py), q, new Vector3(11, 1, 11));
      pool.setMatrixAt(i, m4);
    }
    lampMesh.frustumCulled = true;
    pool.frustumCulled = true;
    pool.renderOrder = 2;
    lampMesh.name = "lamps";
    pool.name = "lightPools";
    this.scene.add(lampMesh, pool);
    this.network = net.roads;
  }

  private ingestChunk(ix: number, iy: number, r: ChunkResult) {
    const key = chunkKey(ix, iy);
    if (this.chunkMap.has(key)) return;
    const props = new Group();
    const ox = r.meta.ox;
    const oy = r.meta.oy;
    const center = toWorld(ox, oy, 560);
    let mesh = new Mesh();
    let height = new Float32Array(0);
    let src = new Uint8Array(0);
    let kind = new Uint8Array(0);
    let name = new Int32Array(0);
    let pickGeom: ChunkRecord["pickGeom"] = null;
    if (r.built) {
      const b = r.built;
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(b.position, 3));
      g.setAttribute("normal", new BufferAttribute(b.normal, 3, true));
      g.setAttribute("facade", new BufferAttribute(b.facade, 2));
      g.setAttribute("color", new BufferAttribute(b.color, 3, true));
      g.setAttribute("bdata", new BufferAttribute(b.bdata, 4));
      g.setIndex(new BufferAttribute(b.index, 1));
      g.computeBoundingSphere();
      mesh = new Mesh(g, this.buildingMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      height = r.height!;
      src = r.src!;
      kind = r.kind!;
      name = r.name!;
      pickGeom = {
        position: b.position,
        index: b.index,
        triStart: b.triStart,
        aabb: computeAabbs(b.position, b.index, b.triStart),
      };
    }
    const m4 = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const c = new Color();
    if (r.tank && r.tank.length) {
      const n = r.tank.length / 4;
      const tanks = new InstancedMesh(makeTankGeometry(), this.propMat, n);
      for (let i = 0; i < n; i++) {
        const x = r.tank[i * 4],
          y = r.tank[i * 4 + 1],
          z = r.tank[i * 4 + 2],
          s = r.tank[i * 4 + 3];
        q.setFromAxisAngle(up, (i * 2.39) % 6.28);
        m4.compose(new Vector3(x, z - ELEV_BASE, -y), q, new Vector3(s, s, s));
        tanks.setMatrixAt(i, m4);
        const t = (i * 0.618) % 1;
        tanks.setColorAt(
          i,
          t < 0.72
            ? c.setRGB(0.1, 0.1, 0.1, SRGBColorSpace)
            : t < 0.9
              ? c.setRGB(0.18, 0.36, 0.62, SRGBColorSpace)
              : c.setRGB(0.55, 0.52, 0.48, SRGBColorSpace),
        );
      }
      tanks.castShadow = true;
      tanks.receiveShadow = true;
      props.add(tanks);
    }
    if (r.stair && r.stair.length) {
      const n = r.stair.length / 7;
      const st = new InstancedMesh(makeStairHeadGeometry(), this.propMat, n);
      for (let i = 0; i < n; i++) {
        const o = i * 7;
        const [x, y, z, sx, sy, sh, ang] = r.stair.subarray(o, o + 7);
        q.setFromAxisAngle(up, ang);
        m4.compose(new Vector3(x, z - ELEV_BASE, -y), q, new Vector3(sx, sh, sy));
        st.setMatrixAt(i, m4);
        // Concrete / plaster stair heads — not the cream-white patch on every roof.
        const t = (i * 0.37) % 1;
        st.setColorAt(
          i,
          t < 0.45
            ? c.setRGB(0.42 + t * 0.08, 0.4 + t * 0.06, 0.36 + t * 0.05, SRGBColorSpace)
            : t < 0.75
              ? c.setRGB(0.55, 0.52, 0.48, SRGBColorSpace)
              : c.setRGB(0.62, 0.58, 0.52, SRGBColorSpace),
        );
      }
      st.castShadow = true;
      st.receiveShadow = true;
      props.add(st);
    }
    this.scene.add(props);
    const tree = r.tree && r.tree.length ? r.tree : null;
    this.chunkMap.set(key, { key, ix, iy, ox, oy, mesh, height, src, kind, name, props, center, tree, pickGeom });
    this.treesDirty = true;
  }

  private addLabels(m: SceneManifest) {
    for (const p of m.places) {
      this.labels.add({
        text: p.rank <= 1 ? p.name.toUpperCase() : p.name,
        kind: p.rank <= 1 ? "area" : "locality",
        world: toWorld(p.x, p.y, p.z + 25),
        // Rank-2 localities (Dharavi-style mohallas) stay visible from mid altitude.
        priority: p.rank <= 1 ? 6 : p.rank === 2 ? 4 : 3,
        maxDist: p.rank <= 1 ? 18000 : p.rank === 2 ? 9000 : 5500,
      });
    }
    for (const l of m.landmarks) {
      this.labels.add({
        text: l.name,
        kind: l.kind === "hill" ? "hill" : "landmark",
        world: toWorld(l.x, l.y, l.z + 18),
        priority: l.wiki ? 8 : 5,
        maxDist: l.kind === "hill" ? 20000 : l.wiki ? 14000 : 8000,
      });
    }
    for (const p of m.presets) {
      this.labels.add({
        text: p.label,
        kind: p.kind === "bridge" ? "landmark" : p.kind === "heritage" || p.kind === "temple" ? "landmark" : "locality",
        world: toWorld(p.x, p.y, p.z + 22),
        priority: 7,
        maxDist: 16000,
      });
    }
    for (const s of m.stations) {
      this.labels.add({ text: s.name, kind: "station", world: toWorld(s.x, s.y, 575), priority: 4, maxDist: 8000 });
    }
    for (const t of m.towers.slice(0, 40)) {
      this.labels.add({
        text: t.name ?? "Tower",
        sub: `${Math.round(t.h)} m${t.src === "mapped" ? "" : " est."}`,
        kind: "tower",
        world: toWorld(t.x, t.y, t.z + 6),
        priority: 2,
        maxDist: 5000,
      });
    }
  }

  // ------------------------------------------------------------------ controls

  setTime(hour: number) {
    this.hour = hour;
    const s = sunPosition(hour, PUNE_LAT, PUNE_LON);
    const day = dayFactor(s.elevation);
    const night = 1 - dayFactor(s.elevation + 3);
    this.u.uNight.value = night;
    const el = (s.elevation * Math.PI) / 180;
    const az = (s.azimuth * Math.PI) / 180;
    const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    this.sunDir.copy(dir);
    // Mumbai-like: soft haze, muted Midday (never blown-out), warm low sun.
    const noon = Math.max(0, Math.min(1, (s.elevation - 10) / 55));
    for (const sk of [this.sky, this.envSky]) {
      const su = sk.material.uniforms;
      su.sunPosition.value.copy(dir.y < -0.05 ? new Vector3(dir.x, -0.05, dir.z) : dir);
      su.turbidity.value = 8 + noon * 4;
      su.rayleigh.value = 1.1 + (1 - day) * 1.4 + noon * 0.4;
      su.mieCoefficient.value = 0.0045 + noon * 0.003;
      su.mieDirectionalG.value = 0.8;
    }
    const low = Math.max(0, 1 - Math.max(0, s.elevation) / 25);
    const sunCol = new Color(1, 0.94, 0.86).lerp(new Color(1, 0.58, 0.28), low * 0.9);
    this.sun.color.copy(sunCol);
    // Cap Midday hard — Mumbai reference stays muted sand, never blown white.
    this.sun.intensity = (0.95 + 0.45 * day) * (1 - 0.38 * noon);
    this.hemi.intensity = 0.08 + 0.22 * day * (1 - 0.25 * noon);
    this.hemi.color.set(day > 0.3 ? 0xb8c2d0 : 0x3a4a6a);
    this.hemi.groundColor.set(day > 0.3 ? 0x5e5040 : 0x1a1612);
    const fogDay = new Color(0.62, 0.68, 0.74).lerp(new Color(0.88, 0.68, 0.48), low * day * 0.75);
    const fogNight = new Color(0.02, 0.03, 0.05);
    (this.scene.fog as FogExp2).color.copy(fogNight.lerp(fogDay, day));
    (this.scene.fog as FogExp2).density = 0.000085 + noon * 0.00005 + night * 0.000025;
    this.renderer.toneMappingExposure = 0.58 + 0.1 * day * (1 - 0.45 * noon) + 0.28 * night;
    this.envNoon = noon;
    this.bloom.strength = 0.06 + night * 0.85;
    this.bloom.threshold = night > 0.5 ? 0.55 : 1.05;
    this.sky.visible = true;
    (this.sky.material.uniforms as Record<string, { value: number }>).up && void 0;
    if (Math.abs(this.envHour - hour) > 0.2) this.updateEnv();
    else this.applyEnvIntensity();
  }

  private sunDir = new Vector3(0, 1, 0);
  private envNoon = 0;

  private applyEnvIntensity() {
    const night = this.u.uNight.value;
    this.scene.environmentIntensity = (0.14 * (1 - night) + 0.02) * (1 - 0.25 * this.envNoon);
  }

  private updateEnv() {
    this.envHour = this.hour;
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
    this.scene.environment = this.envTarget.texture;
    this.applyEnvIntensity();
  }

  private applyDetail(d: Detail) {
    this.detail = d;
    const cfg = DETAIL[d];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.pixelRatio));
    this.renderer.shadowMap.enabled = cfg.shadow > 0;
    this.sun.castShadow = cfg.shadow > 0;
    if (cfg.shadow > 0 && this.sun.shadow.mapSize.x !== cfg.shadow) {
      this.sun.shadow.mapSize.set(cfg.shadow, cfg.shadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.trees.setNearRadius(cfg.nearTrees);
    this.trees.castShadows = cfg.shadow > 0;
    if (this.network && (!this.traffic || this.traffic.count !== cfg.traffic)) {
      if (this.traffic) this.scene.remove(this.traffic.group);
      this.traffic = new TrafficSystem(this.network, this.u, cfg.traffic);
      this.scene.add(this.traffic.group);
    }
    this.resize();
  }

  setDetail(d: Detail) {
    this.applyDetail(d);
    void this.syncChunks(true);
  }

  setLabels(on: boolean) {
    this.labels.enabled = on;
  }

  flyTo(p: Preset) {
    const target = toWorld(p.x, p.y, p.z);
    const hill =
      p.kind === "hill" ||
      p.label === "Parvati" ||
      p.label === "Taljai" ||
      p.label === "Vetal Tekdi" ||
      p.label === "Sinhgad Fort";
    const preset = FLY_VIEW[p.label];
    const cur = this.camera.position.clone().sub(this.rig.controls.target);
    const fallbackBearing = (Math.atan2(-cur.x, cur.z) * 180) / Math.PI;
    // Low pitch + longer dist = Mumbai Worli-style side view (rooftops no longer fill the frame).
    const dist = preset?.dist ?? (hill ? 1800 : 1100);
    const pitch = preset?.pitch ?? (hill ? 16 : 14);
    const bearing = preset?.bearing ?? fallbackBearing;
    this.rig.flyTo(orbitPose(target, dist, pitch, bearing));
    void this.syncChunks(true);
  }

  // ------------------------------------------------------------------ frame

  private onPointer = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top, dirty: true };
  };

  private onLeave = () => {
    this.pointer = null;
    this.ev.hover(null);
  };

  private pickAt(x: number, y: number): PickedBuilding | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new Raycaster();
    ray.setFromCamera(new Vector2((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1), this.camera);
    const hit = this.pickIndex.pick(ray.ray);
    if (!hit) return null;
    const c = this.builtList[hit.chunk];
    if (!c) return null;
    const b = hit.building;
    const kind = c.kind[b];
    const nameIdx = c.name[b];
    const h = c.height[b];
    return {
      name: nameIdx >= 0 && this.manifest ? this.manifest.building_names[nameIdx] : null,
      kind: KIND_NAMES[kind] ?? "Building",
      height: h,
      source: HEIGHT_SOURCES[c.src[b]] ?? "default",
      floors: estimateFloors(h, kind),
    };
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private updateShadowFrustum() {
    if (!this.sun.castShadow) return;
    const t = this.rig.controls.target;
    const dist = this.camera.position.distanceTo(t);
    const half = Math.min(2600, Math.max(140, dist * 0.85));
    const cam = this.sun.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 10;
    cam.far = 9000;
    cam.updateProjectionMatrix();
    const texel = (2 * half) / this.sun.shadow.mapSize.x;
    const cx = Math.round(t.x / texel) * texel;
    const cz = Math.round(t.z / texel) * texel;
    const dir = this.sunDir.y > 0.02 ? this.sunDir : new Vector3(0.3, 1, 0.2).normalize();
    this.sun.target.position.set(cx, t.y, cz);
    this.sun.position.set(cx + dir.x * 4000, t.y + dir.y * 4000, cz + dir.z * 4000);
    this.sun.shadow.bias = -0.0002 - 0.0000004 * half;
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, this.clock.getDelta());
    this.u.uTime.value += dt;
    this.rig.update(dt);
    this.updateShadowFrustum();
    this.trees.update(this.camera.position);
    this.traffic?.update(dt);
    const roofDist = DETAIL[this.detail].roofDist;
    for (const c of this.chunkMap.values()) c.props.visible = c.center.distanceTo(this.camera.position) < roofDist;
    if (this.frames % 30 === 0) void this.syncChunks(false);
    this.composer.render(dt);
    const now = performance.now();
    this.labels.groundY = this.rig.groundAt(this.camera.position.x, this.camera.position.z);
    if (this.labels.enabled) this.labels.update(this.camera, this.container.clientWidth, this.container.clientHeight);
    else this.labels.update(this.camera, 0, 0);
    this.frames++;
    if (now - this.fpsT > 1000) {
      this.ev.fps(Math.round((this.frames * 1000) / (now - this.fpsT)));
      this.frames = 0;
      this.fpsT = now;
    }
    if (now - this.lastReadout > 300 && this.manifest) {
      this.lastReadout = now;
      this.emitReadout();
    }
    if (this.pointer?.dirty && now - this.hoverT > 90 && !this.rig.flying) {
      this.hoverT = now;
      this.pointer.dirty = false;
      const info = this.pickAt(this.pointer.x, this.pointer.y);
      this.ev.hover(info ? { info, x: this.pointer.x, y: this.pointer.y } : null);
    }
  };

  private emitReadout() {
    const m = this.manifest!;
    const t = fromWorld(this.rig.controls.target);
    let best = "Pune";
    let bd = Infinity;
    for (const p of m.places) {
      const d = Math.hypot(p.x - t.x, p.y - t.y) * (p.rank <= 1 ? 1.3 : 1);
      if (d < bd) {
        bd = d;
        best = p.name;
      }
    }
    const [lon, lat] = localToLonLat(t.x, t.y, m.origin_lonlat);
    const cam = fromWorld(this.camera.position);
    const ground = this.terrain ? this.terrain.sample(cam.x, cam.y) : 560;
    this.ev.readout({ place: `${best} · Pune`, lat, lon, eye: Math.max(0, cam.z - ground) });
  }

  /** Test/debug hook: stats about what is on the GPU. */
  stats() {
    const info = this.renderer.info;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      chunks: this.chunkMap.size,
      trees: this.trees.total,
      vehicles: this.traffic?.count ?? 0,
      reversedDepth: this.reversedDepth,
      streamRadius: DETAIL[this.detail].streamRadius,
      maxChunks: DETAIL[this.detail].maxChunks,
    };
  }

  setView(pose: { x: number; y: number; z?: number; dist: number; pitch: number; bearing: number }) {
    const z = pose.z ?? (this.terrain ? this.terrain.sample(pose.x, pose.y) : 560);
    this.rig.jumpTo(orbitPose(toWorld(pose.x, pose.y, z), pose.dist, pose.pitch, pose.bearing));
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.renderer.domElement.removeEventListener("pointermove", this.onPointer);
    this.renderer.domElement.removeEventListener("pointerleave", this.onLeave);
    for (const w of this.workers) w.terminate();
    this.rig.dispose();
    this.labels.dispose();
    this.composer.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

interface RibbonArrays {
  position: Float32Array;
  uv: Float32Array;
  rdata: Uint8Array;
  index: Uint32Array;
}

interface NetworkResult {
  roadRibbon: RibbonArrays;
  railRibbon: RibbonArrays;
  roads: RoadNetwork & { pier: Float32Array; lamp: Float32Array };
  railPier: Float32Array;
}

interface ChunkResult {
  meta: { ix: number; iy: number; ox: number; oy: number };
  built: BuiltBuildings | null;
  height: Float32Array | null;
  src: Uint8Array | null;
  kind: Uint8Array | null;
  name: Int32Array | null;
  tree: Float32Array | null;
  tank: Float32Array | null;
  stair: Float32Array | null;
}
