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
  new Vector3(1.15, 1.15, 1.15), // metro
  new Vector3(1.05, 1.05, 1.05), // train
];

const METRO_COLORS = [0x7a1f2b, 0xc0392b, 0x1a5276, 0x117a65];
const TRAIN_COLORS = [0x1b4f72, 0x5d6d7e, 0x784212, 0x1c2833];

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

const RAIL_LOCAL_R = 1800;
const RAIL_FAR_R = 4500;
const RAIL_LOCAL_FRAC = 0.45;
const RAIL_CELL = 600;

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
  private trainSegs: number[] = [];
  private cellSegs = new Map<string, number[]>();
  private redistribT = 99;

  constructor(net: RailNetwork, u: SharedUniforms, count: number) {
    this.graph = new RailGraph(net);
    this.group.name = "rail-transit-simulated";
    const mat = makePropMaterial(u, { roughness: 0.4 });

    const scoreSeg = (s: number) => this.graph.len[s] * (net.elevated[s] ? 1.4 : 1);

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
    this.trainSegs = trainSegs;

    const metroBudget = metroSegs.length ? Math.max(8, Math.floor(count * 0.55)) : 0;
    const trainBudget = trainSegs.length ? Math.max(6, count - metroBudget) : 0;
    const caps = [0, 0];
    const plan: Agent[] = [];

    const push = (seg: number, type: number) => {
      const base = (type === TYPE_METRO ? METRO_SPEED : TRAIN_SPEED) * (0.85 + this.rnd() * 0.3);
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

    const seed = (segs: number[], type: number, budget: number) => {
      if (!segs.length || budget <= 0) return;
      // City-wide: longer (and elevated) lines first, but cover the whole network.
      const ranked = [...segs].sort((a, b) => scoreSeg(b) - scoreSeg(a));
      let placed = 0;
      for (const seg of ranked) {
        const spacing = type === TYPE_METRO ? 220 : 380;
        const n = Math.max(1, Math.min(3, Math.floor(this.graph.len[seg] / spacing)));
        for (let k = 0; k < n && placed < budget; k++) {
          push(seg, type);
          placed++;
        }
        if (placed >= budget) break;
      }
      while (placed < budget) {
        push(ranked[Math.floor(this.rnd() * ranked.length)], type);
        placed++;
      }
    };

    seed(metroSegs, TYPE_METRO, metroBudget);
    seed(trainSegs, TYPE_TRAIN, trainBudget);

    this.agents = plan;
    this.hints = new Array(plan.length).fill(-1);

    for (let t = 0; t < TYPES.length; t++) {
      const mesh = new InstancedMesh(makeRailVehicleGeometry(TYPES[t]), mat, Math.max(1, caps[t]));
      mesh.count = caps[t];
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.name = `sim-rail-${TYPES[t]}`;
      const pal = t === TYPE_METRO ? METRO_COLORS : TRAIN_COLORS;
      const c = new Color();
      for (let i = 0; i < caps[t]; i++) mesh.setColorAt(i, c.setHex(pal[Math.floor(this.rnd() * pal.length)]));
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

  private segsNear(lx: number, ly: number, preferMetro: boolean | null): number[] {
    const rCells = Math.ceil(RAIL_LOCAL_R / RAIL_CELL);
    const cx0 = Math.floor(lx / RAIL_CELL);
    const cy0 = Math.floor(ly / RAIL_CELL);
    const out: number[] = [];
    const r2 = RAIL_LOCAL_R * RAIL_LOCAL_R;
    for (let dx = -rCells; dx <= rCells; dx++) {
      for (let dy = -rCells; dy <= rCells; dy++) {
        const bucket = this.cellSegs.get(`${cx0 + dx}:${cy0 + dy}`);
        if (!bucket) continue;
        for (const s of bucket) {
          if (this.segDist2(s, lx, ly) > r2) continue;
          if (preferMetro === true && !this.graph.net.metro[s]) continue;
          if (preferMetro === false && this.graph.net.metro[s]) continue;
          out.push(s);
        }
      }
    }
    return out;
  }

  private ensureLocalDensity(lx: number, ly: number) {
    const want = Math.max(8, Math.floor(this.agents.length * RAIL_LOCAL_FRAC));
    const localR2 = RAIL_LOCAL_R * RAIL_LOCAL_R;
    const farR2 = RAIL_FAR_R * RAIL_FAR_R;
    let near = 0;
    const farIdx: number[] = [];
    for (let i = 0; i < this.agents.length; i++) {
      const d2 = this.segDist2(this.agents[i].seg, lx, ly);
      if (d2 <= localR2) near++;
      else if (d2 > farR2) farIdx.push(i);
    }
    let need = want - near;
    while (need > 0 && farIdx.length) {
      const ii = (this.rnd() * farIdx.length) | 0;
      const i = farIdx[ii];
      farIdx[ii] = farIdx[farIdx.length - 1];
      farIdx.pop();
      const v = this.agents[i];
      const pool = this.segsNear(lx, ly, v.type === TYPE_METRO);
      const fallback = v.type === TYPE_METRO ? this.metroSegs : this.trainSegs;
      const segs = pool.length ? pool : fallback;
      if (!segs.length) continue;
      const seg = segs[(this.rnd() * segs.length) | 0];
      v.seg = seg;
      v.dir = this.rnd() < 0.5 ? 1 : -1;
      v.s = this.rnd() * Math.max(1, this.graph.len[seg]);
      v.speed = v.baseSpeed * 0.8;
      this.hints[v.vi] = -1;
      need--;
    }
  }

  update(dt: number, camWorldX?: number, camWorldZ?: number) {
    if (!this.visible) return;
    const step = this.paused ? 0 : Math.max(0, dt * this.simSpeed);
    if (camWorldX !== undefined && camWorldZ !== undefined && step > 0) {
      this.redistribT += dt;
      if (this.redistribT > 0.5) {
        this.redistribT = 0;
        this.ensureLocalDensity(camWorldX, -camWorldZ);
      }
    }
    const m4 = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const up = new Vector3(0, 1, 0);
    const pt = { x: 0, y: 0, z: 0, hx: 1, hy: 0 };
    const g = this.graph;

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
      // Sit slightly above the rail ribbon deck.
      const lift = g.net.elevated[v.seg] ? 1.2 : 0.55;
      p.set(pt.x, pt.z - ELEV_BASE + lift, -pt.y);
      q.setFromAxisAngle(up, Math.atan2(hy, hx));
      m4.compose(p, q, TYPE_SCALE[v.type]);
      this.meshes[v.type].setMatrixAt(v.slot, m4);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}
