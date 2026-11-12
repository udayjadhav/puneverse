/**
 * Turns one decoded building chunk into GPU-ready arrays. Pure: runs in the
 * chunk worker and in unit tests.
 *
 * Per vertex:
 *   position  f32×3  world metres (x, elev − ELEV_BASE, −y)
 *   normal    i8×3   normalised
 *   facade    f32×2  walls: (metres along the perimeter, metres above base)
 *                    roofs: (world x, world z)
 *   color     u8×3   wall tint or roof colour
 *   bdata     u8×4   (kind, part, seed, floors); part 0 wall, 1 roof, 2 parapet inside
 */

import { ShapeUtils, Vector2 } from "three";
import { ELEV_BASE } from "./constants";

export const PART_WALL = 0;
export const PART_ROOF = 1;
export const PART_PARAPET = 2;

const PARAPET_H = 0.95;

export interface BuildingChunkArrays {
  ring_start: Uint32Array;
  bld_ring: Uint32Array;
  xy: Int16Array;
  height: Float32Array;
  base: Float32Array;
  kind: Uint8Array;
  roof: Uint8Array;
  wall: Uint8Array;
  seed: Uint16Array;
}

export interface BuiltBuildings {
  position: Float32Array;
  normal: Int8Array;
  facade: Float32Array;
  color: Uint8Array;
  bdata: Uint8Array;
  index: Uint32Array;
  /** First triangle of each building (length n + 1), for picking. */
  triStart: Uint32Array;
}

export interface BuildOptions {
  parapets: boolean;
}

export function floorHeightFor(kind: number): number {
  if (kind === 3) return 4.5;
  if (kind === 2 || kind === 5) return 3.6;
  return 3.1;
}

export function estimateFloors(height: number, kind: number): number {
  return Math.max(1, Math.round(height / floorHeightFor(kind)));
}

/** Count vertices/indices first so the arrays are allocated once. */
function measure(a: BuildingChunkArrays, opts: BuildOptions) {
  let verts = 0;
  let idx = 0;
  const n = a.height.length;
  for (let b = 0; b < n; b++) {
    const r0 = a.bld_ring[b];
    const r1 = a.bld_ring[b + 1];
    let pts = 0;
    for (let r = r0; r < r1; r++) pts += a.ring_start[r + 1] - a.ring_start[r];
    const walls = pts * (hasParapet(a, b, opts) ? 2 : 1);
    verts += walls * 4 + pts;
    idx += walls * 6 + (pts - 2 + 2 * (r1 - r0 - 1)) * 3;
  }
  return { verts, idx };
}

function hasParapet(a: BuildingChunkArrays, b: number, opts: BuildOptions): boolean {
  const k = a.kind[b];
  return opts.parapets && a.height[b] >= 5.5 && k !== 6 && k !== 4 && k !== 7;
}

export function buildBuildings(
  a: BuildingChunkArrays,
  ox: number,
  oy: number,
  opts: BuildOptions = { parapets: true },
): BuiltBuildings {
  const n = a.height.length;
  const m = measure(a, opts);
  const position = new Float32Array(m.verts * 3);
  const normal = new Int8Array(m.verts * 3);
  const facade = new Float32Array(m.verts * 2);
  const color = new Uint8Array(m.verts * 3);
  const bdata = new Uint8Array(m.verts * 4);
  let index = new Uint32Array(m.idx);
  const triStart = new Uint32Array(n + 1);
  let v = 0;
  let ii = 0;

  const put = (
    x: number, y: number, z: number,
    nx: number, ny: number, nz: number,
    fu: number, fv: number,
    r: number, g: number, bl: number,
    kind: number, part: number, seed: number, floors: number,
  ) => {
    const p = v * 3;
    position[p] = x;
    position[p + 1] = z - ELEV_BASE;
    position[p + 2] = -y;
    // world normal = (nx, nz, -ny)
    normal[p] = Math.round(nx * 127);
    normal[p + 1] = Math.round(nz * 127);
    normal[p + 2] = Math.round(-ny * 127);
    facade[v * 2] = fu;
    facade[v * 2 + 1] = fv;
    color[p] = r;
    color[p + 1] = g;
    color[p + 2] = bl;
    const q = v * 4;
    bdata[q] = kind;
    bdata[q + 1] = part;
    bdata[q + 2] = seed;
    bdata[q + 3] = floors;
    return v++;
  };

  for (let b = 0; b < n; b++) {
    triStart[b] = ii / 3;
    const h = a.height[b];
    const base = a.base[b];
    const kind = a.kind[b];
    const seed = a.seed[b] & 255;
    const floors = Math.min(255, estimateFloors(h, kind));
    const wr = a.wall[b * 3], wg = a.wall[b * 3 + 1], wb = a.wall[b * 3 + 2];
    const rr = a.roof[b * 3], rg = a.roof[b * 3 + 1], rb = a.roof[b * 3 + 2];
    const parapet = hasParapet(a, b, opts);
    const top = base + h;
    const wallTop = parapet ? top + PARAPET_H : top;
    const r0 = a.bld_ring[b];
    const r1 = a.bld_ring[b + 1];

    const contour: Vector2[] = [];
    const holes: Vector2[][] = [];
    let perim = 0;
    for (let r = r0; r < r1; r++) {
      const s = a.ring_start[r];
      const e = a.ring_start[r + 1];
      const ring: Vector2[] = [];
      for (let k = s; k < e; k++) {
        ring.push(new Vector2(ox + a.xy[k * 2] / 10, oy + a.xy[k * 2 + 1] / 10));
      }
      if (r === r0) contour.push(...ring);
      else holes.push(ring);
      const cnt = ring.length;
      for (let k = 0; k < cnt; k++) {
        const p0 = ring[k];
        const p1 = ring[(k + 1) % cnt];
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy) || 1e-6;
        const nx = dy / len;
        const ny = -dx / len;
        const u0 = perim;
        const u1 = perim + len;
        perim = u1;
        const a0 = put(p0.x, p0.y, base, nx, ny, 0, u0, 0, wr, wg, wb, kind, PART_WALL, seed, floors);
        const a1 = put(p1.x, p1.y, base, nx, ny, 0, u1, 0, wr, wg, wb, kind, PART_WALL, seed, floors);
        const a2 = put(p1.x, p1.y, wallTop, nx, ny, 0, u1, wallTop - base, wr, wg, wb, kind, PART_WALL, seed, floors);
        const a3 = put(p0.x, p0.y, wallTop, nx, ny, 0, u0, wallTop - base, wr, wg, wb, kind, PART_WALL, seed, floors);
        index[ii++] = a0; index[ii++] = a1; index[ii++] = a2;
        index[ii++] = a0; index[ii++] = a2; index[ii++] = a3;
        if (parapet) {
          const c0 = put(p0.x, p0.y, top, -nx, -ny, 0, u0, h, wr, wg, wb, kind, PART_PARAPET, seed, floors);
          const c1 = put(p1.x, p1.y, top, -nx, -ny, 0, u1, h, wr, wg, wb, kind, PART_PARAPET, seed, floors);
          const c2 = put(p1.x, p1.y, wallTop, -nx, -ny, 0, u1, h + PARAPET_H, wr, wg, wb, kind, PART_PARAPET, seed, floors);
          const c3 = put(p0.x, p0.y, wallTop, -nx, -ny, 0, u0, h + PARAPET_H, wr, wg, wb, kind, PART_PARAPET, seed, floors);
          index[ii++] = c0; index[ii++] = c2; index[ii++] = c1;
          index[ii++] = c0; index[ii++] = c3; index[ii++] = c2;
        }
      }
    }

    // Roof: earcut over contour + holes.
    const roofBase = v;
    const all = contour.concat(...holes);
    for (const p of all) {
      put(p.x, p.y, top, 0, 0, 1, p.x, -p.y, rr, rg, rb, kind, PART_ROOF, seed, floors);
    }
    let tris: number[][] = [];
    try {
      tris = ShapeUtils.triangulateShape(contour, holes);
    } catch {
      tris = [];
    }
    for (const t of tris) {
      const pa = all[t[0]], pb = all[t[1]], pc = all[t[2]];
      const cross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
      if (ii + 3 > index.length) {
        const grown = new Uint32Array(Math.ceil(index.length * 1.25) + 64);
        grown.set(index);
        index = grown;
      }
      if (cross >= 0) {
        index[ii++] = roofBase + t[0]; index[ii++] = roofBase + t[1]; index[ii++] = roofBase + t[2];
      } else {
        index[ii++] = roofBase + t[0]; index[ii++] = roofBase + t[2]; index[ii++] = roofBase + t[1];
      }
    }
  }
  triStart[n] = ii / 3;
  return {
    position: position.subarray(0, v * 3),
    normal: normal.subarray(0, v * 3),
    facade: facade.subarray(0, v * 2),
    color: color.subarray(0, v * 3),
    bdata: bdata.subarray(0, v * 4),
    index: index.slice(0, ii),
    triStart,
  };
}

/** Binary search: which building owns triangle ``tri``. */
export function buildingForTriangle(triStart: Uint32Array, tri: number): number {
  let lo = 0;
  let hi = triStart.length - 2;
  if (hi < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (triStart[mid] <= tri) lo = mid;
    else hi = mid - 1;
  }
  return tri < triStart[triStart.length - 1] ? lo : -1;
}
