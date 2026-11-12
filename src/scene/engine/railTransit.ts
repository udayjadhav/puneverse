/**
 * Simulated metro + train motion on OSM rail polylines (disclosed SIMULATED).
 * Never claim these as live GPS / timetable vehicles.
 */

import { Color, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import { ELEV_BASE } from "./constants";
import type { SharedUniforms } from "./materials";
import { makeRailVehicleGeometry, type RailVehicleType } from "./models";
import { makePropMaterial } from "./propMaterial";

export interface RailNetwork {
  vstart: Uint32Array;
  xyz: Float32Array;
  /** 1 = metro / light rail, 0 = heavy rail (train). */
  metro: Uint8Array;
  elevated: Uint8Array;
}

export const RAIL_PROVENANCE = "SIMULATED" as const;

const TYPE_METRO = 0;
const TYPE_TRAIN = 1;
const TYPES: RailVehicleType[] = ["metro", "train"];

const METRO_SPEED = 22;
const TRAIN_SPEED = 18;
const SNAP_M = 14;

const TYPE_SCALE = [
  new Vector3(1.0, 1.0, 1.0), // metro — real-ish 1:1 metres
  new Vector3(1.0, 1.0, 1.0), // train
];

/** One metro + one train city-wide; only the nearest metro is drawn in-frame. */
const METRO_COUNT = 1;
const TRAIN_COUNT = 1;
const HIDE = new Vector3(0, 0, 0);

interface Agent {
  seg: number;
  dir: 1 | -1;
  s: number;
  speed: number;
  baseSpeed: number;
  type: number;
  slot: number;
  vi: number;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

class RailGraph {
  readonly len: Float32Array;
  readonly cum: Float32Array;
  readonly adj = new Map<number, { seg: number; end: 0 | 1 }[]>();
  readonly na: Int32Array;
  readonly nb: Int32Array;
  readonly net: RailNetwork;

  constructor(net: RailNetwork) {
    this.net = net;
    const n = net.metro.length;
    this.len = new Float32Array(n);
    this.cum = new Float32Array(net.xyz.length / 3);
    this.na = new Int32Array(n).fill(-1);
    this.nb = new Int32Array(n).fill(-1);
    const nodeOf = new Map<string, number>();
    let nextNode = 0;
    const keyAt = (vi: number) => {
      const x = Math.round(net.xyz[vi * 3] / SNAP_M);
      const y = Math.round(net.xyz[vi * 3 + 1] / SNAP_M);
      return `${x}:${y}`;
    };
    const nodeId = (vi: number) => {
      const k = keyAt(vi);
      let id = nodeOf.get(k);
      if (id === undefined) {
        id = nextNode++;
        nodeOf.set(k, id);
      }
      return id;
    };

    for (let s = 0; s < n; s++) {
      const a = net.vstart[s];
      const b = net.vstart[s + 1];
      let acc = 0;
      this.cum[a] = 0;
      for (let k = a + 1; k < b; k++) {
        acc += Math.hypot(net.xyz[k * 3] - net.xyz[(k - 1) * 3], net.xyz[k * 3 + 1] - net.xyz[(k - 1) * 3 + 1]);
        this.cum[k] = acc;
      }
      this.len[s] = acc;
      if (acc < 8) continue;
      const na = nodeId(a);
      const nb = nodeId(b - 1);
      this.na[s] = na;
      this.nb[s] = nb;
      let la = this.adj.get(na);
      if (!la) this.adj.set(na, (la = []));
      la.push({ seg: s, end: 0 });
      let lb = this.adj.get(nb);
      if (!lb) this.adj.set(nb, (lb = []));
      lb.push({ seg: s, end: 1 });
    }
  }

  next(seg: number, dir: 1 | -1, rnd: () => number, preferMetro: boolean): { seg: number; dir: 1 | -1 } {
    const node = dir === 1 ? this.nb[seg] : this.na[seg];
    if (node < 0) return { seg, dir: dir === 1 ? -1 : 1 };
    const opts = (this.adj.get(node) ?? []).filter((o) => o.seg !== seg);
    const same = opts.filter((o) => !!this.net.metro[o.seg] === preferMetro);
    const pool = same.length ? same : opts;
    if (!pool.length) return { seg, dir: dir === 1 ? -1 : 1 };
    const pick = pool[Math.floor(rnd() * pool.length)];
    // Entering at end 0 → travel dir +1; at end 1 → travel dir -1.
    return { seg: pick.seg, dir: pick.end === 0 ? 1 : -1 };
  }

  pointAt(seg: number, d: number, out: { x: number; y: number; z: number; hx: number; hy: number }, hint = -1) {
    const a = this.net.vstart[seg];
    const b = this.net.vstart[seg + 1];
    let k = hint >= a && hint < b - 1 && this.cum[hint] <= d ? hint : a;
    while (k < b - 2 && this.cum[k + 1] < d) k++;
    const x0 = this.net.xyz[k * 3],
      y0 = this.net.xyz[k * 3 + 1],
      z0 = this.net.xyz[k * 3 + 2];
    const x1 = this.net.xyz[(k + 1) * 3],
      y1 = this.net.xyz[(k + 1) * 3 + 1],
      z1 = this.net.xyz[(k + 1) * 3 + 2];
    const segLen = this.cum[k + 1] - this.cum[k] || 1e-6;
    const t = Math.min(1, Math.max(0, (d - this.cum[k]) / segLen));
    out.x = x0 + (x1 - x0) * t;
    out.y = y0 + (y1 - y0) * t;
    out.z = z0 + (z1 - z0) * t;
    out.hx = (x1 - x0) / segLen;
    out.hy = (y1 - y0) / segLen;
    return k;
  }
}

const RAIL_CELL = 600;
/** Prefer keeping the single metro on elevated track near the camera when possible. */
const METRO_FOLLOW_R = 2200;

export class RailTransitSystem {
  readonly group = new Group();
  readonly graph: RailGraph;
  private agents: Agent[] = [];
  private meshes: InstancedMesh[] = [];
  private rnd = rng(4242);
  private hints: number[] = [];
  private simSpeed = 1;
  private visible = true;
  private paused = false;
  private metroSegs: number[] = [];
  private cellSegs = new Map<string, number[]>();
  private redistribT = 99;
  private camLx = 0;
  private camLy = 0;
  private hasCam = false;

  constructor(net: RailNetwork, u: SharedUniforms, _count: number) {
    this.graph = new RailGraph(net);
    this.group.name = "rail-transit-simulated";
    // Slightly metallic so silver metro shell reads correctly (not chalky/pale).
    const mat = makePropMaterial(u, { roughness: 0.32 });
    mat.metalness = 0.35;

    const scoreSeg = (s: number) => this.graph.len[s] * (net.elevated[s] ? 1.8 : 1);

    const metroSegs: number[] = [];
    const trainSegs: number[] = [];
    for (let s = 0; s < net.metro.length; s++) {
      if (this.graph.len[s] < 12) continue;
      if (net.metro[s]) metroSegs.push(s);
      else trainSegs.push(s);
      const a = net.vstart[s];
      const key = `${Math.floor(net.xyz[a * 3] / RAIL_CELL)}:${Math.floor(net.xyz[a * 3 + 1] / RAIL_CELL)}`;
      let b = this.cellSegs.get(key);
      if (!b) this.cellSegs.set(key, (b = []));
      b.push(s);
    }
    this.metroSegs = metroSegs;

    const caps = [0, 0];
    const plan: Agent[] = [];

    const push = (seg: number, type: number) => {
      const base = (type === TYPE_METRO ? METRO_SPEED : TRAIN_SPEED) * (0.9 + this.rnd() * 0.2);
      plan.push({
        seg,
        dir: this.rnd() < 0.5 ? 1 : -1,
        s: this.rnd() * Math.max(1, this.graph.len[seg]),
        speed: base,
        baseSpeed: base,
        type,
        slot: caps[type]++,
        vi: plan.length,
      });
    };

    const pickBest = (segs: number[]) => {
      if (!segs.length) return -1;
      const ranked = [...segs].sort((a, b) => scoreSeg(b) - scoreSeg(a));
      return ranked[0];
    };

    if (metroSegs.length && METRO_COUNT > 0) push(pickBest(metroSegs), TYPE_METRO);
    if (trainSegs.length && TRAIN_COUNT > 0) push(pickBest(trainSegs), TYPE_TRAIN);

    this.agents = plan;
    this.hints = new Array(plan.length).fill(-1);

    for (let t = 0; t < TYPES.length; t++) {
      const mesh = new InstancedMesh(makeRailVehicleGeometry(TYPES[t]), mat, Math.max(1, caps[t]));
      mesh.count = caps[t];
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.name = `sim-rail-${TYPES[t]}`;
      // Keep vertex colours (silver + purple); white instance tint avoids washed-out look.
      const c = new Color(1, 1, 1);
      for (let i = 0; i < caps[t]; i++) mesh.setColorAt(i, c);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    this.update(0);
  }

  get count() {
    return this.agents.length;
  }

  get provenance() {
    return RAIL_PROVENANCE;
  }

  setVisible(on: boolean) {
    this.visible = on;
    this.group.visible = on;
  }

  setPaused(on: boolean) {
    this.paused = on;
  }

  setSimSpeed(s: number) {
    this.simSpeed = Math.max(0, Math.min(4, s));
  }

  private segDist2(seg: number, lx: number, ly: number) {
    const a = this.graph.net.vstart[seg];
    const dx = this.graph.net.xyz[a * 3] - lx;
    const dy = this.graph.net.xyz[a * 3 + 1] - ly;
    return dx * dx + dy * dy;
  }

  private segsNear(lx: number, ly: number, preferMetro: boolean): number[] {
    const rCells = Math.ceil(METRO_FOLLOW_R / RAIL_CELL);
    const cx0 = Math.floor(lx / RAIL_CELL);
    const cy0 = Math.floor(ly / RAIL_CELL);
    const out: number[] = [];
    const r2 = METRO_FOLLOW_R * METRO_FOLLOW_R;
    for (let dx = -rCells; dx <= rCells; dx++) {
      for (let dy = -rCells; dy <= rCells; dy++) {
        const bucket = this.cellSegs.get(`${cx0 + dx}:${cy0 + dy}`);
        if (!bucket) continue;
        for (const s of bucket) {
          if (this.segDist2(s, lx, ly) > r2) continue;
          if (preferMetro && !this.graph.net.metro[s]) continue;
          if (!preferMetro && this.graph.net.metro[s]) continue;
          out.push(s);
        }
      }
    }
    return out;
  }

  /** If the camera is near metro track, keep the single metro on that corridor. */
  private followMetro(lx: number, ly: number) {
    const metro = this.agents.find((a) => a.type === TYPE_METRO);
    if (!metro || !this.metroSegs.length) return;
    const near = this.segsNear(lx, ly, true);
    if (!near.length) return;
    if (this.segDist2(metro.seg, lx, ly) <= METRO_FOLLOW_R * METRO_FOLLOW_R) return;
    const elevated = near.filter((s) => this.graph.net.elevated[s]);
    const pool = elevated.length ? elevated : near;
    const seg = pool[(this.rnd() * pool.length) | 0];
    metro.seg = seg;
    metro.dir = this.rnd() < 0.5 ? 1 : -1;
    metro.s = this.rnd() * Math.max(1, this.graph.len[seg]);
    metro.speed = metro.baseSpeed * 0.85;
    this.hints[metro.vi] = -1;
  }

  update(dt: number, camWorldX?: number, camWorldZ?: number) {
    if (!this.visible) return;
    const step = this.paused ? 0 : Math.max(0, dt * this.simSpeed);
    if (camWorldX !== undefined && camWorldZ !== undefined) {
      this.camLx = camWorldX;
      this.camLy = -camWorldZ;
      this.hasCam = true;
      if (step > 0) {
        this.redistribT += dt;
        if (this.redistribT > 1.2) {
          this.redistribT = 0;
          this.followMetro(this.camLx, this.camLy);
        }
      }
    }
    const m4 = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const up = new Vector3(0, 1, 0);
    const pt = { x: 0, y: 0, z: 0, hx: 1, hy: 0 };
    const g = this.graph;

    // Pick nearest metro agent to draw (only one in frame even if budget rises later).
    let bestMetro = -1;
    let bestMetroD = Infinity;
    if (this.hasCam) {
      for (let i = 0; i < this.agents.length; i++) {
        if (this.agents[i].type !== TYPE_METRO) continue;
        const d2 = this.segDist2(this.agents[i].seg, this.camLx, this.camLy);
        if (d2 < bestMetroD) {
          bestMetroD = d2;
          bestMetro = i;
        }
      }
    }

    for (let i = 0; i < this.agents.length; i++) {
      const v = this.agents[i];
      if (step > 0) {
        v.speed += (v.baseSpeed - v.speed) * Math.min(1, step * 1.5);
        v.s += v.speed * step;
        let guard = 0;
        while (v.s > g.len[v.seg] && guard++ < 6) {
          v.s -= g.len[v.seg];
          const nx = g.next(v.seg, v.dir, this.rnd, v.type === TYPE_METRO);
          v.seg = nx.seg;
          v.dir = nx.dir;
          this.hints[v.vi] = -1;
        }
      }
      const d = v.dir === 1 ? v.s : g.len[v.seg] - v.s;
      this.hints[v.vi] = g.pointAt(v.seg, d, pt, v.dir === 1 ? this.hints[v.vi] : -1);
      let hx = pt.hx * v.dir;
      let hy = pt.hy * v.dir;
      const hl = Math.hypot(hx, hy) || 1;
      hx /= hl;
      hy /= hl;
      const lift = g.net.elevated[v.seg] ? 1.35 : 0.65;
      p.set(pt.x, pt.z - ELEV_BASE + lift, -pt.y);
      q.setFromAxisAngle(up, Math.atan2(hy, hx));
      const show =
        v.type !== TYPE_METRO || bestMetro < 0 || i === bestMetro;
      m4.compose(p, q, show ? TYPE_SCALE[v.type] : HIDE);
      this.meshes[v.type].setMatrixAt(v.slot, m4);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}
