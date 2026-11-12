/**
 * Simulated traffic (generated, disclosed): vehicles + pedestrians on the OSM
 * road graph. NEVER claim these as live GPS / congestion.
 */

import { Color, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import { ELEV_BASE } from "./constants";
import type { SharedUniforms } from "./materials";
import { makeVehicleGeometry, type VehicleType } from "./models";
import { makePropMaterial } from "./propMaterial";

export interface RoadNetwork {
  vstart: Uint32Array;
  xyz: Float32Array;
  cls: Uint8Array;
  width: Float32Array;
  flags: Uint8Array;
  na: Uint32Array;
  nb: Uint32Array;
}

export type TrafficDensityMode = "free" | "moderate" | "heavy" | "jam";

const FLAG_TUNNEL = 2;
const FLAG_ONEWAY = 4;
/** Include residential / service so every road class can carry agents. */
const CLASS_WEIGHT = [8, 7, 5.5, 4, 2.5, 1.5, 0.8];
const CLASS_SPEED = [13, 12, 10, 8.5, 6.5, 5, 4];
/** car, bike, auto, bus, ped */
const TYPES: VehicleType[] = ["car", "bike", "auto", "bus", "ped"];
const TYPE_CAR = 0;
const TYPE_BIKE = 1;
const TYPE_AUTO = 2;
const TYPE_BUS = 3;
const TYPE_PED = 4;

export const TRAFFIC_PROVENANCE = "SIMULATED" as const;

interface Vehicle {
  seg: number;
  dir: 1 | -1;
  s: number;
  speed: number;
  baseSpeed: number;
  lane: number;
  type: number;
  slot: number;
  vi: number;
  pause: number;
  sidewalk: boolean;
}

export class RoadGraph {
  readonly len: Float32Array;
  readonly cum: Float32Array;
  readonly adj = new Map<number, number[]>();
  readonly degree = new Map<number, number>();
  readonly net: RoadNetwork;

  constructor(net: RoadNetwork) {
    this.net = net;
    const n = net.cls.length;
    this.len = new Float32Array(n);
    this.cum = new Float32Array(net.xyz.length / 3);
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
      if (!this.drivable(s)) continue;
      for (const node of [net.na[s], net.nb[s]]) {
        let l = this.adj.get(node);
        if (!l) this.adj.set(node, (l = []));
        l.push(s);
      }
    }
    for (const [node, segs] of this.adj) this.degree.set(node, segs.length);
  }

  drivable(s: number): boolean {
    const cls = this.net.cls[s];
    return cls < CLASS_WEIGHT.length && CLASS_WEIGHT[cls] > 0 && !(this.net.flags[s] & FLAG_TUNNEL) && this.len[s] > 1;
  }

  exitDir(s: number, node: number): 1 | -1 | 0 {
    const oneway = (this.net.flags[s] & FLAG_ONEWAY) !== 0;
    if (this.net.na[s] === node) return 1;
    if (this.net.nb[s] === node) return oneway ? 0 : -1;
    return 0;
  }

  next(seg: number, dir: 1 | -1, rnd: () => number): { seg: number; dir: 1 | -1 } {
    const node = dir === 1 ? this.net.nb[seg] : this.net.na[seg];
    const opts = (this.adj.get(node) ?? []).filter((s) => s !== seg && this.exitDir(s, node) !== 0);
    if (!opts.length) {
      const back = this.exitDir(seg, node);
      return { seg, dir: back === 0 ? dir : back };
    }
    let total = 0;
    const w = opts.map((s) => {
      const v = CLASS_WEIGHT[this.net.cls[s]] + (this.net.cls[s] <= this.net.cls[seg] ? 2 : 0);
      total += v;
      return v;
    });
    let r = rnd() * total;
    for (let i = 0; i < opts.length; i++) {
      r -= w[i];
      if (r <= 0) return { seg: opts[i], dir: this.exitDir(opts[i], node) as 1 | -1 };
    }
    const s = opts[opts.length - 1];
    return { seg: s, dir: this.exitDir(s, node) as 1 | -1 };
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

  isIntersection(node: number): boolean {
    return (this.degree.get(node) ?? 0) >= 3;
  }
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const CAR_COLORS = [0xf2f2f2, 0xd8d8d8, 0x9a9da3, 0x2b2d31, 0x8a1c1c, 0x1d3f7a, 0xc9c4b8, 0x5a5f66, 0xe0e0e0];
const BUS_COLORS = [0x2f6db5, 0xc0392b, 0x1f8a5a];
const BIKE_COLORS = [0x202020, 0x8a1c1c, 0x1d3f7a, 0x555555, 0xbbbbbb];
const PED_COLORS = [0x3a5f8a, 0x8a3a3a, 0x3a7a4a, 0x6a4a8a, 0x8a6a2a, 0x2a2a2a, 0xc4a484];

const DENSITY_SPEED: Record<TrafficDensityMode, number> = {
  free: 1.25,
  moderate: 1.0,
  heavy: 0.85,
  jam: 0.35,
};

const FOLLOW_GAP: Record<TrafficDensityMode, number> = {
  free: 14,
  moderate: 10,
  heavy: 7,
  jam: 4.5,
};

/** Oversized vs real metres so agents read at oblique city views (~300–700 m). */
const TYPE_SCALE = [
  new Vector3(2.35, 2.35, 2.35), // car
  new Vector3(2.1, 2.1, 2.1), // bike
  new Vector3(2.25, 2.25, 2.25), // auto
  new Vector3(2.0, 2.0, 2.0), // bus
  new Vector3(2.6, 2.6, 2.6), // ped
];

const PED_BUDGET_FRAC = 0.12;
/** Keep this fraction of agents within LOCAL_R of the camera as you travel. */
const LOCAL_FRACTION = 0.42;
const LOCAL_R = 1100;
const FAR_R = 3200;
const CELL_M = 500;

export class TrafficSystem {
  readonly group = new Group();
  readonly graph: RoadGraph;
  private vehicles: Vehicle[] = [];
  private meshes: InstancedMesh[] = [];
  private rnd = rng(1234);
  private hints: number[] = [];
  private speedScale = 1;
  private simSpeed = 1;
  private densityMode: TrafficDensityMode = "heavy";
  private visible = true;
  private paused = false;
  private segBuckets = new Map<number, number[]>();
  private cellSegs = new Map<string, number[]>();
  /** High so the first camera-aware frame pulls agents near the view. */
  private redistribT = 99;

  constructor(net: RoadNetwork, u: SharedUniforms, count: number) {
    this.graph = new RoadGraph(net);
    this.group.name = "traffic-sim-simulated";
    const mat = makePropMaterial(u, { roughness: 0.45 });
    const caps = [0, 0, 0, 0, 0];
    const segs: number[] = [];
    const weights: number[] = [];
    let total = 0;
    for (let s = 0; s < net.cls.length; s++) {
      if (!this.graph.drivable(s)) continue;
      // City-wide: weight by length × road class only (no launch-area monopoly).
      const w = this.graph.len[s] * CLASS_WEIGHT[net.cls[s]];
      if (w <= 0) continue;
      total += w;
      segs.push(s);
      weights.push(total);
      const a = net.vstart[s];
      const cx = Math.floor(net.xyz[a * 3] / CELL_M);
      const cy = Math.floor(net.xyz[a * 3 + 1] / CELL_M);
      const key = `${cx}:${cy}`;
      let bucket = this.cellSegs.get(key);
      if (!bucket) this.cellSegs.set(key, (bucket = []));
      bucket.push(s);
    }

    const plan: Vehicle[] = [];
    const pedCap = Math.max(40, Math.floor(count * PED_BUDGET_FRAC));
    let pedCount = 0;

    const pickSeg = () => {
      const r = this.rnd() * total;
      let lo = 0,
        hi = weights.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (weights[mid] < r) lo = mid + 1;
        else hi = mid;
      }
      return segs[lo];
    };

    const pushAgent = (seg: number, forcePed: boolean) => {
      const cls = net.cls[seg];
      const r = this.rnd();
      let type: number;
      if (forcePed && pedCount < pedCap) {
        type = TYPE_PED;
      } else if (r < 0.42) type = TYPE_CAR;
      else if (r < 0.58) type = TYPE_BIKE;
      else if (r < 0.82) type = TYPE_AUTO;
      else if (r < 0.94) type = TYPE_BUS;
      else if (pedCount < pedCap) type = TYPE_PED;
      else type = TYPE_CAR;
      // Buses stay on larger roads.
      if (type === TYPE_BUS && cls > 2) type = this.rnd() < 0.5 ? TYPE_CAR : TYPE_AUTO;
      if (type === TYPE_PED) pedCount++;
      const sidewalk = type === TYPE_PED;
      const oneway = (net.flags[seg] & FLAG_ONEWAY) !== 0;
      const dir: 1 | -1 = oneway || this.rnd() < 0.5 ? 1 : -1;
      const w = net.width[seg];
      const lane = sidewalk
        ? w * (0.52 + this.rnd() * 0.12) * (this.rnd() < 0.5 ? 1 : -1)
        : oneway
          ? (this.rnd() - 0.5) * w * 0.55
          : w * (0.12 + this.rnd() * 0.18);
      const base =
        type === TYPE_PED
          ? 1.2 + this.rnd() * 0.6
          : CLASS_SPEED[cls] * (0.85 + this.rnd() * 0.45) * (type === TYPE_BUS ? 0.75 : type === TYPE_BIKE ? 1.15 : 1);
      plan.push({
        seg,
        dir,
        s: this.rnd() * Math.max(1, this.graph.len[seg]),
        speed: base,
        baseSpeed: base,
        lane,
        type,
        slot: caps[type]++,
        vi: plan.length,
        pause: 0,
        sidewalk,
      });
    };

    // 1) Sparse seed across the whole city (every Nth segment, spacing by length).
    const stride = Math.max(1, Math.ceil(segs.length / Math.max(1, count * 0.55)));
    for (let si = 0; si < segs.length; si += stride) {
      const seg = segs[si];
      const len = this.graph.len[seg];
      const vehiclesHere = Math.max(1, Math.min(3, Math.floor(len / 70)));
      for (let k = 0; k < vehiclesHere; k++) pushAgent(seg, false);
      if (pedCount < pedCap && this.rnd() < 0.2) pushAgent(seg, true);
      if (plan.length >= count) break;
    }

    // 2) Top up with length×class weighted sample so arterials stay busier.
    while (plan.length < count && segs.length) {
      pushAgent(pickSeg(), pedCount < pedCap && this.rnd() < 0.08);
    }
    if (plan.length > count) {
      plan.length = count;
      for (let t = 0; t < caps.length; t++) caps[t] = 0;
      for (let i = 0; i < plan.length; i++) {
        plan[i].vi = i;
        plan[i].slot = caps[plan[i].type]++;
      }
    }

    this.vehicles = plan;
    this.hints = new Array(plan.length).fill(-1);

    for (let t = 0; t < TYPES.length; t++) {
      const mesh = new InstancedMesh(makeVehicleGeometry(TYPES[t]), mat, Math.max(1, caps[t]));
      mesh.count = caps[t];
      mesh.frustumCulled = false;
      mesh.castShadow = t !== TYPE_PED;
      mesh.name = `sim-agent-${TYPES[t]}`;
      const pal =
        t === TYPE_BUS
          ? BUS_COLORS
          : t === TYPE_BIKE
            ? BIKE_COLORS
            : t === TYPE_AUTO
              ? [0xffffff]
              : t === TYPE_PED
                ? PED_COLORS
                : CAR_COLORS;
      const c = new Color();
      for (let i = 0; i < caps[t]; i++) mesh.setColorAt(i, c.setHex(pal[Math.floor(this.rnd() * pal.length)]));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    // Place instances even on the first frame (dt=0 used to skip matrix writes).
    this.update(0);
  }

  get count() {
    return this.vehicles.length;
  }

  get provenance() {
    return TRAFFIC_PROVENANCE;
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

  setSpeedScale(s: number) {
    this.speedScale = Math.max(0.05, Math.min(2, s));
  }

  setDensityMode(mode: TrafficDensityMode) {
    this.densityMode = mode;
  }

  getDensityMode() {
    return this.densityMode;
  }

  private rebuildBuckets() {
    this.segBuckets.clear();
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.sidewalk) continue; // peds don't enter vehicle follow buckets
      const key = v.seg * 2 + (v.dir === 1 ? 0 : 1);
      let b = this.segBuckets.get(key);
      if (!b) this.segBuckets.set(key, (b = []));
      b.push(i);
    }
    for (const b of this.segBuckets.values()) {
      b.sort((a, c) => this.vehicles[a].s - this.vehicles[c].s);
    }
  }

  private laneFor(v: Vehicle, seg: number) {
    const w = this.graph.net.width[seg];
    const oneway = (this.graph.net.flags[seg] & FLAG_ONEWAY) !== 0;
    if (v.sidewalk) return w * (0.52 + this.rnd() * 0.12) * (this.rnd() < 0.5 ? 1 : -1);
    return oneway ? (this.rnd() - 0.5) * w * 0.55 : w * (0.12 + this.rnd() * 0.18);
  }

  private segDist2(seg: number, lx: number, ly: number) {
    const a = this.graph.net.vstart[seg];
    const dx = this.graph.net.xyz[a * 3] - lx;
    const dy = this.graph.net.xyz[a * 3 + 1] - ly;
    return dx * dx + dy * dy;
  }

  private segsNear(lx: number, ly: number, radius: number): number[] {
    const rCells = Math.ceil(radius / CELL_M);
    const cx0 = Math.floor(lx / CELL_M);
    const cy0 = Math.floor(ly / CELL_M);
    const out: number[] = [];
    const r2 = radius * radius;
    for (let dx = -rCells; dx <= rCells; dx++) {
      for (let dy = -rCells; dy <= rCells; dy++) {
        const bucket = this.cellSegs.get(`${cx0 + dx}:${cy0 + dy}`);
        if (!bucket) continue;
        for (const s of bucket) {
          if (this.segDist2(s, lx, ly) <= r2) out.push(s);
        }
      }
    }
    return out;
  }

  private teleport(v: Vehicle, seg: number) {
    const net = this.graph.net;
    const oneway = (net.flags[seg] & FLAG_ONEWAY) !== 0;
    v.seg = seg;
    v.dir = oneway || this.rnd() < 0.5 ? 1 : -1;
    v.s = this.rnd() * Math.max(1, this.graph.len[seg]);
    v.lane = this.laneFor(v, seg);
    v.pause = 0;
    v.speed = v.baseSpeed * 0.7;
    this.hints[v.vi] = -1;
  }

  /**
   * As the camera travels, pull far agents onto nearby roads so every
   * neighbourhood stays sparsely populated (not only the launch view).
   */
  private ensureLocalDensity(lx: number, ly: number) {
    const nearSegs = this.segsNear(lx, ly, LOCAL_R);
    if (!nearSegs.length) return;
    const want = Math.max(24, Math.floor(this.vehicles.length * LOCAL_FRACTION));
    const farR2 = FAR_R * FAR_R;
    const localR2 = LOCAL_R * LOCAL_R;
    let near = 0;
    const farIdx: number[] = [];
    for (let i = 0; i < this.vehicles.length; i++) {
      const d2 = this.segDist2(this.vehicles[i].seg, lx, ly);
      if (d2 <= localR2) near++;
      else if (d2 > farR2) farIdx.push(i);
    }
    let need = want - near;
    while (need > 0 && farIdx.length) {
      const i = farIdx[(this.rnd() * farIdx.length) | 0];
      farIdx[farIdx.indexOf(i)] = farIdx[farIdx.length - 1];
      farIdx.pop();
      this.teleport(this.vehicles[i], nearSegs[(this.rnd() * nearSegs.length) | 0]);
      need--;
    }
    this.segBuckets.clear();
  }

  /** @param camWorldX/Z optional — world camera so traffic follows exploration. */
  update(dt: number, camWorldX?: number, camWorldZ?: number) {
    if (!this.visible) return;
    // Always rewrite instance matrices (even when paused / dt=0) so agents are never stuck at origin.
    const step = this.paused ? 0 : Math.max(0, dt * this.simSpeed);

    if (camWorldX !== undefined && camWorldZ !== undefined && step > 0) {
      this.redistribT += dt;
      if (this.redistribT > 0.4) {
        this.redistribT = 0;
        // World (x,z) → local map (x, y) with y = −z.
        this.ensureLocalDensity(camWorldX, -camWorldZ);
      }
    }

    if (step > 0 && ((this.vehicles.length > 0 && Math.random() < 0.06) || this.segBuckets.size === 0)) {
      this.rebuildBuckets();
    } else if (this.segBuckets.size === 0) {
      this.rebuildBuckets();
    }

    const modeMul = DENSITY_SPEED[this.densityMode];
    const gapNeed = FOLLOW_GAP[this.densityMode];
    const m4 = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const up = new Vector3(0, 1, 0);
    const pt = { x: 0, y: 0, z: 0, hx: 1, hy: 0 };
    const g = this.graph;
    const cycle = (performance.now() / 1000) % 24;

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (step > 0) {
        if (v.pause > 0) {
          v.pause -= step;
          v.speed = Math.max(0, v.speed - step * 8);
        } else {
          let leadGap = 1e9;
          if (!v.sidewalk) {
            const key = v.seg * 2 + (v.dir === 1 ? 0 : 1);
            const bucket = this.segBuckets.get(key);
            if (bucket) {
              for (const j of bucket) {
                if (j === i) continue;
                const o = this.vehicles[j];
                const ds = o.s - v.s;
                if (ds > 0.5 && ds < leadGap) leadGap = ds;
              }
            }
          }
          const target = v.baseSpeed * this.speedScale * (v.sidewalk ? 1 : modeMul);
          if (!v.sidewalk && leadGap < gapNeed) {
            const brake = Math.max(0, (leadGap - 1.5) / gapNeed);
            v.speed += (target * brake - v.speed) * Math.min(1, step * 4);
            if (leadGap < 2.2) v.speed = Math.min(v.speed, 0.4);
          } else {
            v.speed += (target - v.speed) * Math.min(1, step * 2);
          }

          if (!v.sidewalk) {
            const remaining = g.len[v.seg] - v.s;
            if (remaining < 8 && remaining > 0) {
              const node = v.dir === 1 ? g.net.nb[v.seg] : g.net.na[v.seg];
              if (g.isIntersection(node)) {
                const phase = (node * 7 + Math.floor(cycle / 3)) % 4;
                if (phase === 0 || phase === 1) {
                  if (remaining < 5 && v.speed > 0.5) {
                    v.speed *= 0.4;
                    if (remaining < 2.5) {
                      v.pause = 0.4 + (node % 5) * 0.15;
                      v.speed = 0;
                    }
                  }
                }
              }
            }
          }
        }

        v.s += v.speed * step;
        let guard = 0;
        while (v.s > g.len[v.seg] && guard++ < 4) {
          v.s -= g.len[v.seg];
          const nx = g.next(v.seg, v.dir, this.rnd);
          v.seg = nx.seg;
          v.dir = nx.dir;
          this.hints[v.vi] = -1;
          v.lane = this.laneFor(v, v.seg);
        }
      }
      const d = v.dir === 1 ? v.s : g.len[v.seg] - v.s;
      this.hints[v.vi] = g.pointAt(v.seg, d, pt, v.dir === 1 ? this.hints[v.vi] : -1);
      let hx = pt.hx * v.dir;
      let hy = pt.hy * v.dir;
      const hl = Math.hypot(hx, hy) || 1;
      hx /= hl;
      hy /= hl;
      const lx = -hy,
        ly = hx;
      const x = pt.x + lx * v.lane;
      const y = pt.y + ly * v.lane;
      p.set(x, pt.z - ELEV_BASE + (v.sidewalk ? 0.08 : 0.06), -y);
      q.setFromAxisAngle(up, Math.atan2(hy, hx));
      m4.compose(p, q, TYPE_SCALE[v.type]);
      this.meshes[v.type].setMatrixAt(v.slot, m4);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}
