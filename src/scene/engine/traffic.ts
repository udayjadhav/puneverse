/**
 * Simulated traffic (generated, disclosed): vehicles drive the OSM road graph
 * with keep-left offset, car-following, intersection pauses, and density modes.
 * NEVER claim these as live GPS / congestion unless a free feed exists.
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
const CLASS_WEIGHT = [7, 6, 4.5, 3, 0.7, 0, 0];
const CLASS_SPEED = [12, 11, 9, 8, 6, 4, 3];
const TYPES: VehicleType[] = ["car", "bike", "auto", "bus"];

/** Honest label — always simulated until a verified live feed exists. */
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
}

/** Graph helpers kept pure for tests. */
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
    return CLASS_WEIGHT[this.net.cls[s]] > 0 && !(this.net.flags[s] & FLAG_TUNNEL) && this.len[s] > 1;
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

const DENSITY_SPEED: Record<TrafficDensityMode, number> = {
  free: 1.15,
  moderate: 0.85,
  heavy: 0.45,
  jam: 0.18,
};

const FOLLOW_GAP: Record<TrafficDensityMode, number> = {
  free: 14,
  moderate: 10,
  heavy: 7,
  jam: 4.5,
};

export class TrafficSystem {
  readonly group = new Group();
  readonly graph: RoadGraph;
  private vehicles: Vehicle[] = [];
  private meshes: InstancedMesh[] = [];
  private rnd = rng(1234);
  private hints: number[] = [];
  private speedScale = 1;
  private simSpeed = 1;
  private densityMode: TrafficDensityMode = "moderate";
  private visible = true;
  private paused = false;
  /** Per-segment sorted indices for car-following (rebuilt lightly). */
  private segBuckets = new Map<number, number[]>();

  constructor(net: RoadNetwork, u: SharedUniforms, count: number) {
    this.graph = new RoadGraph(net);
    this.group.name = "traffic-sim-simulated";
    const mat = makePropMaterial(u, { roughness: 0.45 });
    const caps = [0, 0, 0, 0];
    const segs: number[] = [];
    const cdf: number[] = [];
    let total = 0;
    for (let s = 0; s < net.cls.length; s++) {
      if (!this.graph.drivable(s)) continue;
      total += this.graph.len[s] * CLASS_WEIGHT[net.cls[s]];
      segs.push(s);
      cdf.push(total);
    }
    const plan: Vehicle[] = [];
    for (let i = 0; i < count && segs.length; i++) {
      const r = this.rnd() * total;
      let lo = 0,
        hi = cdf.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] < r) lo = mid + 1;
        else hi = mid;
      }
      // Bias spawn toward city centre so vehicles are visible from the launch camera.
      let seg = segs[lo];
      for (let attempt = 0; attempt < 6; attempt++) {
        const r2 = this.rnd() * total;
        let a = 0,
          b = cdf.length - 1;
        while (a < b) {
          const mid = (a + b) >> 1;
          if (cdf[mid] < r2) a = mid + 1;
          else b = mid;
        }
        const cand = segs[a];
        const mid = this.graph.net.vstart[cand] + ((this.graph.net.vstart[cand + 1] - this.graph.net.vstart[cand]) >> 1);
        const cx = net.xyz[mid * 3];
        const cy = net.xyz[mid * 3 + 1];
        const dist = Math.hypot(cx, cy);
        if (dist < 1800 || attempt === 5) {
          seg = cand;
          break;
        }
      }
      const cls = net.cls[seg];
      const t = this.rnd();
      let type = t < 0.36 ? 0 : t < 0.78 ? 1 : t < 0.94 ? 2 : 3;
      if (type === 3 && cls > 2) type = 0;
      const oneway = (net.flags[seg] & FLAG_ONEWAY) !== 0;
      const dir: 1 | -1 = oneway || this.rnd() < 0.5 ? 1 : -1;
      const w = net.width[seg];
      const lane = oneway ? (this.rnd() - 0.5) * w * 0.6 : w * (0.12 + this.rnd() * 0.16);
      const base = CLASS_SPEED[cls] * (0.85 + this.rnd() * 0.45) * (type === 3 ? 0.75 : 1);
      plan.push({
        seg,
        dir,
        s: this.rnd() * this.graph.len[seg],
        speed: base,
        baseSpeed: base,
        lane,
        type,
        slot: caps[type]++,
        vi: i,
        pause: 0,
      });
    }
    this.vehicles = plan;
    this.hints = new Array(plan.length).fill(-1);
    // Slightly oversized so cars read at city-scale camera distances.
    const scale = new Vector3(1.65, 1.65, 1.65);
    for (let t = 0; t < TYPES.length; t++) {
      const mesh = new InstancedMesh(makeVehicleGeometry(TYPES[t]), mat, Math.max(1, caps[t]));
      mesh.count = caps[t];
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.name = `sim-vehicle-${TYPES[t]}`;
      const pal = t === 3 ? BUS_COLORS : t === 1 ? BIKE_COLORS : t === 2 ? [0xffffff] : CAR_COLORS;
      const c = new Color();
      for (let i = 0; i < caps[t]; i++) mesh.setColorAt(i, c.setHex(pal[Math.floor(this.rnd() * pal.length)]));
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    this.vehicleScale = scale;
    this.update(0);
  }

  private vehicleScale = new Vector3(1.65, 1.65, 1.65);

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
      const key = v.seg * 2 + (v.dir === 1 ? 0 : 1);
      let b = this.segBuckets.get(key);
      if (!b) this.segBuckets.set(key, (b = []));
      b.push(i);
    }
    for (const b of this.segBuckets.values()) {
      b.sort((a, c) => this.vehicles[a].s - this.vehicles[c].s);
    }
  }

  update(dt: number) {
    if (!this.visible || this.paused) return;
    const step = dt * this.simSpeed;
    if (step <= 0) return;

    // Rebuild buckets every few frames for car-following.
    if ((this.vehicles.length > 0 && Math.random() < 0.08) || this.segBuckets.size === 0) {
      this.rebuildBuckets();
    }

    const modeMul = DENSITY_SPEED[this.densityMode];
    const gapNeed = FOLLOW_GAP[this.densityMode];
    const m4 = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const one = this.vehicleScale;
    const up = new Vector3(0, 1, 0);
    const pt = { x: 0, y: 0, z: 0, hx: 1, hy: 0 };
    const g = this.graph;
    const cycle = (performance.now() / 1000) % 24;

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.pause > 0) {
        v.pause -= step;
        v.speed = Math.max(0, v.speed - step * 8);
      } else {
        // Car-following: slow if leader ahead on same seg/dir is close.
        let leadGap = 1e9;
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
        const target = v.baseSpeed * this.speedScale * modeMul;
        if (leadGap < gapNeed) {
          const brake = Math.max(0, (leadGap - 1.5) / gapNeed);
          v.speed += (target * brake - v.speed) * Math.min(1, step * 4);
          if (leadGap < 2.2) v.speed = Math.min(v.speed, 0.4);
        } else {
          v.speed += (target - v.speed) * Math.min(1, step * 2);
        }

        // Intersection traffic-light style pause (time-sliced by node id).
        const remaining = g.len[v.seg] - v.s;
        if (remaining < 8 && remaining > 0) {
          const node = v.dir === 1 ? g.net.nb[v.seg] : g.net.na[v.seg];
          if (g.isIntersection(node)) {
            const phase = (node * 7 + Math.floor(cycle / 3)) % 4;
            // Two of four phases are red for this approach.
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

      v.s += v.speed * step;
      let guard = 0;
      while (v.s > g.len[v.seg] && guard++ < 4) {
        v.s -= g.len[v.seg];
        const nx = g.next(v.seg, v.dir, this.rnd);
        v.seg = nx.seg;
        v.dir = nx.dir;
        this.hints[v.vi] = -1;
        const w = g.net.width[v.seg];
        const oneway = (g.net.flags[v.seg] & FLAG_ONEWAY) !== 0;
        v.lane = oneway ? (this.rnd() - 0.5) * w * 0.6 : w * (0.12 + this.rnd() * 0.16);
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
      p.set(x, pt.z - ELEV_BASE + 0.02, -y);
      q.setFromAxisAngle(up, Math.atan2(hy, hx));
      m4.compose(p, q, one);
      this.meshes[v.type].setMatrixAt(v.slot, m4);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}
