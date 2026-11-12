/**
 * CPU building picking without testing every triangle: a 2D grid of building
 * bounding boxes narrows candidates along the ray, then only those buildings'
 * triangles are intersected exactly.
 */

import type { Ray } from "three";

export interface PickChunk {
  position: Float32Array;
  index: Uint32Array;
  triStart: Uint32Array;
  /** Per building: minX, minY(world), minZ, maxX, maxY, maxZ in world coords. */
  aabb: Float32Array;
}

const CELL = 50;

export function computeAabbs(position: Float32Array, index: Uint32Array, triStart: Uint32Array): Float32Array {
  const n = triStart.length - 1;
  const out = new Float32Array(n * 6);
  for (let b = 0; b < n; b++) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let t = triStart[b] * 3; t < triStart[b + 1] * 3; t++) {
      const p = index[t] * 3;
      const x = position[p], y = position[p + 1], z = position[p + 2];
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (z < z0) z0 = z;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      if (z > z1) z1 = z;
    }
    out.set([x0, y0, z0, x1, y1, z1], b * 6);
  }
  return out;
}

export function rayAabb(o: number[], d: number[], box: Float32Array, k: number): number {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (let a = 0; a < 3; a++) {
    const lo = box[k + a];
    const hi = box[k + 3 + a];
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < lo || o[a] > hi) return Infinity;
      continue;
    }
    let t1 = (lo - o[a]) / d[a];
    let t2 = (hi - o[a]) / d[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (tmax < 0) return Infinity;
  return Math.max(tmin, 0);
}

export function rayTriangle(o: number[], d: number[], p: Float32Array, a: number, b: number, c: number): number {
  const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
  const e1x = p[b * 3] - ax, e1y = p[b * 3 + 1] - ay, e1z = p[b * 3 + 2] - az;
  const e2x = p[c * 3] - ax, e2y = p[c * 3 + 1] - ay, e2z = p[c * 3 + 2] - az;
  const px = d[1] * e2z - d[2] * e2y;
  const py = d[2] * e2x - d[0] * e2z;
  const pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-10) return Infinity;
  const inv = 1 / det;
  const tx = o[0] - ax, ty = o[1] - ay, tz = o[2] - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return Infinity;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
  if (v < 0 || u + v > 1) return Infinity;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 0 ? t : Infinity;
}

export class PickIndex {
  private chunks: PickChunk[] = [];
  private grid = new Map<number, number[]>();

  private key(cx: number, cz: number) {
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  clear() {
    this.chunks = [];
    this.grid.clear();
  }

  add(chunk: PickChunk): number {
    const ci = this.chunks.length;
    this.chunks.push(chunk);
    const n = chunk.triStart.length - 1;
    for (let b = 0; b < n; b++) {
      const k = b * 6;
      const cx0 = Math.floor(chunk.aabb[k] / CELL), cx1 = Math.floor(chunk.aabb[k + 3] / CELL);
      const cz0 = Math.floor(chunk.aabb[k + 2] / CELL), cz1 = Math.floor(chunk.aabb[k + 5] / CELL);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const key = this.key(cx, cz);
          let l = this.grid.get(key);
          if (!l) this.grid.set(key, (l = []));
          l.push(ci, b);
        }
      }
    }
    return ci;
  }

  /** Nearest building hit along the ray within ``maxDist``. */
  pick(ray: Ray, maxDist = 8000): { chunk: number; building: number; t: number } | null {
    const o = [ray.origin.x, ray.origin.y, ray.origin.z];
    const d = [ray.direction.x, ray.direction.y, ray.direction.z];
    const seen = new Set<number>();
    const cands: { c: number; b: number; t: number }[] = [];
    const step = CELL * 0.5;
    for (let s = 0; s <= maxDist; s += step) {
      const x = o[0] + d[0] * s;
      const y = o[1] + d[1] * s;
      const z = o[2] + d[2] * s;
      if (y < -200) break;
      const l = this.grid.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (!l) continue;
      for (let i = 0; i < l.length; i += 2) {
        const id = l[i] * 1e6 + l[i + 1];
        if (seen.has(id)) continue;
        seen.add(id);
        const t = rayAabb(o, d, this.chunks[l[i]].aabb, l[i + 1] * 6);
        if (t < Infinity) cands.push({ c: l[i], b: l[i + 1], t });
      }
      if (cands.length && Math.min(...cands.map((c) => c.t)) < s - CELL * 2) break;
    }
    cands.sort((a, b) => a.t - b.t);
    let best: { chunk: number; building: number; t: number } | null = null;
    for (const c of cands) {
      if (best && c.t > best.t) break;
      const ch = this.chunks[c.c];
      for (let t = ch.triStart[c.b]; t < ch.triStart[c.b + 1]; t++) {
        const hit = rayTriangle(o, d, ch.position, ch.index[t * 3], ch.index[t * 3 + 1], ch.index[t * 3 + 2]);
        if (hit < (best?.t ?? Infinity)) best = { chunk: c.c, building: c.b, t: hit };
      }
    }
    return best;
  }
}
