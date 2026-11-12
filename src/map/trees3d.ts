import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MapLibreMap,
} from "maplibre-gl";
import type { ThemeMode } from "@/store/mapStore";
import type { ViewMode } from "./camera";
import { beforeIdFor, ensureLayer } from "./contextLayers";
import { CONTEXT_SOURCE_ID } from "./sources";

export const TREES_3D_ID = "pv-trees-3d";
export const TREES_DOT_ID = "pv-trees-dot";
export const TREES_URL = "/data/trees.surveyed.json";

/** Generic stand-in tree size (metres). Positions are surveyed; the shape is not. */
export const TREE_HEIGHT_M = 9;
export const CANOPY_RADIUS_M = 3;

export interface TreePoints {
  points: [number, number][];
}

let cached: Promise<TreePoints | null> | null = null;

export function loadTreePoints(fetchImpl: typeof fetch = fetch): Promise<TreePoints | null> {
  cached ??= fetchImpl(TREES_URL)
    .then((r) => (r.ok ? (r.json() as Promise<TreePoints>) : null))
    .catch(() => null);
  return cached;
}

/** Small deterministic per-tree variation (no randomness between reloads). */
export function treeScale(i: number): number {
  const h = Math.sin(i * 12.9898) * 43758.5453;
  return 0.75 + (h - Math.floor(h)) * 0.5;
}

/**
 * Instanced low-poly trees placed only at OSM `natural=tree` points.
 * three.js is loaded lazily so the base bundle does not pay for it.
 */
function createTreesLayer(points: [number, number][], theme: ThemeMode): CustomLayerInterface {
  type Three = typeof import("three");
  let THREE: Three | null = null;
  let renderer: import("three").WebGLRenderer | null = null;
  let scene: import("three").Scene | null = null;
  let camera: import("three").Camera | null = null;
  let trunks: import("three").InstancedMesh | null = null;
  let canopies: import("three").InstancedMesh | null = null;
  let map: MapLibreMap | null = null;
  let origin: MercatorCoordinate | null = null;
  let metre = 1;
  let placedWithTerrain = false;

  const place = () => {
    if (!THREE || !trunks || !canopies || !map || !origin) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const terrainOn = Boolean(map.getTerrain());
    for (let i = 0; i < points.length; i++) {
      const [lng, lat] = points[i];
      const elev = terrainOn ? map.queryTerrainElevation([lng, lat]) ?? 0 : 0;
      const mc = MercatorCoordinate.fromLngLat([lng, lat], elev);
      const s = treeScale(i);
      const pos = new THREE.Vector3(
        (mc.x - origin.x) / metre,
        mc.z / metre,
        -(mc.y - origin.y) / metre,
      );
      m.compose(pos, q, new THREE.Vector3(s, s, s));
      trunks.setMatrixAt(i, m);
      canopies.setMatrixAt(i, m);
    }
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    placedWithTerrain = terrainOn;
  };

  const onIdle = () => {
    if (!map) return;
    if (map.getTerrain() || placedWithTerrain) place();
  };

  return {
    id: TREES_3D_ID,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      const center = points.reduce(
        (acc, p) => [acc[0] + p[0] / points.length, acc[1] + p[1] / points.length],
        [0, 0],
      );
      origin = MercatorCoordinate.fromLngLat(center as [number, number], 0);
      metre = origin.meterInMercatorCoordinateUnits();
      void import("three").then((T) => {
        THREE = T;
        camera = new T.Camera();
        scene = new T.Scene();
        scene.add(new T.HemisphereLight(0xffffff, theme === "night" ? 0x111827 : 0x6b7c5a, theme === "night" ? 0.6 : 1.6));
        const sun = new T.DirectionalLight(0xffffff, theme === "night" ? 0.3 : 1.2);
        sun.position.set(-40, 100, 60);
        scene.add(sun);
        const trunkGeom = new T.CylinderGeometry(0.25, 0.35, TREE_HEIGHT_M * 0.45, 5);
        trunkGeom.translate(0, TREE_HEIGHT_M * 0.225, 0);
        const canopyGeom = new T.IcosahedronGeometry(CANOPY_RADIUS_M, 0);
        canopyGeom.scale(1, 1.15, 1);
        canopyGeom.translate(0, TREE_HEIGHT_M - CANOPY_RADIUS_M, 0);
        trunks = new T.InstancedMesh(trunkGeom, new T.MeshLambertMaterial({ color: 0x6b4f35 }), points.length);
        canopies = new T.InstancedMesh(
          canopyGeom,
          new T.MeshLambertMaterial({ color: theme === "night" ? 0x2f5a3a : 0x4f8a3c, flatShading: true }),
          points.length,
        );
        trunks.frustumCulled = false;
        canopies.frustumCulled = false;
        scene.add(trunks, canopies);
        renderer = new T.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
        renderer.autoClear = false;
        place();
        m.on("idle", onIdle);
        m.triggerRepaint();
      });
    },
    onRemove(m) {
      m.off("idle", onIdle);
      trunks?.geometry.dispose();
      canopies?.geometry.dispose();
      renderer = null;
      map = null;
    },
    render(_gl, args: CustomRenderMethodInput) {
      if (!THREE || !renderer || !scene || !camera || !origin) return;
      const world = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as number[]);
      // Local metres (x east, y up, z north) → Mercator (x east, y south, z up).
      const local = new THREE.Matrix4()
        .makeTranslation(origin.x, origin.y, 0)
        .scale(new THREE.Vector3(metre, metre, metre))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      camera.projectionMatrix = world.multiply(local);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };
}

/** Flat-mode / far-zoom marker for the same surveyed points (from the context tiles). */
function treeDotSpec(theme: ThemeMode) {
  return {
    id: TREES_DOT_ID,
    type: "circle" as const,
    source: CONTEXT_SOURCE_ID,
    "source-layer": "tree",
    minzoom: 14,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 1.2, 18, 4] as never,
      "circle-color": theme === "night" ? "#3f7a4f" : "#4f8a3c",
      "circle-opacity": 0.85,
    },
  };
}

export async function ensureTrees(
  map: MapLibreMap,
  state: { enabled: boolean; mode: ViewMode; theme: ThemeMode },
): Promise<void> {
  if (map.getSource(CONTEXT_SOURCE_ID)) {
    ensureLayer(map, treeDotSpec(state.theme), state.enabled && state.mode === "flat");
  }
  if (map.getLayer(TREES_3D_ID)) {
    syncTrees(map, state);
    return;
  }
  const data = await loadTreePoints();
  if (!data || data.points.length === 0 || map.getLayer(TREES_3D_ID)) return;
  map.addLayer(createTreesLayer(data.points, state.theme), beforeIdFor(map, TREES_3D_ID));
  syncTrees(map, state);
}

export function syncTrees(map: MapLibreMap, state: { enabled: boolean; mode: ViewMode }): void {
  const show3d = state.enabled && state.mode === "3d";
  if (map.getLayer(TREES_3D_ID)) {
    map.setLayoutProperty(TREES_3D_ID, "visibility", show3d ? "visible" : "none");
  }
  if (map.getLayer(TREES_DOT_ID)) {
    map.setLayoutProperty(TREES_DOT_ID, "visibility", state.enabled && !show3d ? "visible" : "none");
  }
}
