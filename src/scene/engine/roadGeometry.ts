/**
 * Ribbon geometry for roads, bridge decks and rail/metro viaducts. Pure.
 *
 * Per vertex: position f32×3 (world), uv f32×2 (metres along, −1..1 across),
 * rdata u8×4 (class, flags, part, 0); part 0 surface, 1 deck side, 2 deck underside.
 */

import { ELEV_BASE } from "./constants";

export const RAIL_CLASS = 10;
export const METRO_CLASS = 11;

export interface RibbonInput {
  vstart: Uint32Array;
  xyz: Float32Array;
  width: ArrayLike<number>;
  cls: ArrayLike<number>;
  flags: ArrayLike<number>;
  /** Deck thickness per segment; 0 = no deck sides. */
  deck: ArrayLike<number>;
}

export interface Ribbon {
  position: Float32Array;
  uv: Float32Array;
  rdata: Uint8Array;
  index: Uint32Array;
}

const FLAG_TUNNEL = 2;

export function buildRibbons(inp: RibbonInput): Ribbon {
  const nSeg = inp.vstart.length - 1;
  let verts = 0;
  let idx = 0;
  for (let s = 0; s < nSeg; s++) {
    if (inp.flags[s] & FLAG_TUNNEL) continue;
    const n = inp.vstart[s + 1] - inp.vstart[s];
    if (n < 2) continue;
    const sides = inp.deck[s] > 0 ? 3 : 1;
    verts += n * 2 * (sides === 3 ? 4 : 1);
    idx += (n - 1) * 6 * (sides === 3 ? 4 : 1);
  }
  const position = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  const rdata = new Uint8Array(verts * 4);
  const index = new Uint32Array(idx);
  let v = 0;
  let ii = 0;

  const left = new Float32Array(2);
  for (let s = 0; s < nSeg; s++) {
    if (inp.flags[s] & FLAG_TUNNEL) continue;
    const a = inp.vstart[s];
    const n = inp.vstart[s + 1] - a;
    if (n < 2) continue;
    const half = inp.width[s] / 2;
    const cls = inp.cls[s];
    const lift = cls < 10 ? (6 - Math.min(cls, 6)) * 0.035 : 0;
    const deck = inp.deck[s];
    const strips: { off: [number, number]; dz: [number, number]; part: number; flip: boolean }[] = [
      { off: [-1, 1], dz: [0, 0], part: 0, flip: false },
    ];
    if (deck > 0) {
      strips.push({ off: [-1, -1], dz: [0, -deck], part: 1, flip: true });
      strips.push({ off: [1, 1], dz: [0, -deck], part: 1, flip: false });
      strips.push({ off: [-1, 1], dz: [-deck, -deck], part: 2, flip: true });
    }
    for (const st of strips) {
      const first = v;
      let along = 0;
      for (let k = 0; k < n; k++) {
        const p = (a + k) * 3;
        const x = inp.xyz[p];
        const y = inp.xyz[p + 1];
        const z = inp.xyz[p + 2] + lift;
        if (k > 0) {
          const q = (a + k - 1) * 3;
          along += Math.hypot(x - inp.xyz[q], y - inp.xyz[q + 1]);
        }
        miterLeft(inp.xyz, a, n, k, left);
        let mx = left[0];
        let my = left[1];
        for (let e = 0; e < 2; e++) {
          const side = st.off[e];
          const px = x + mx * half * side;
          const py = y + my * half * side;
          const pz = z + st.dz[e];
          const o = v * 3;
          position[o] = px;
          position[o + 1] = pz - ELEV_BASE;
          position[o + 2] = -py;
          uv[v * 2] = along;
          uv[v * 2 + 1] = e === 0 ? -1 : 1;
          const r = v * 4;
          rdata[r] = cls;
          rdata[r + 1] = inp.flags[s];
          rdata[r + 2] = st.part;
          v++;
        }
        mx = 0;
        my = 0;
      }
      for (let k = 0; k < n - 1; k++) {
        const i0 = first + k * 2;
        const i1 = i0 + 1;
        const i2 = i0 + 2;
        const i3 = i0 + 3;
        // Left/right in local (x east, y north) map to a CCW quad seen from above.
        if (!st.flip) {
          index[ii++] = i0; index[ii++] = i2; index[ii++] = i1;
          index[ii++] = i1; index[ii++] = i2; index[ii++] = i3;
        } else {
          index[ii++] = i0; index[ii++] = i1; index[ii++] = i2;
          index[ii++] = i1; index[ii++] = i3; index[ii++] = i2;
        }
      }
    }
  }
  return {
    position: position.subarray(0, v * 3),
    uv: uv.subarray(0, v * 2),
    rdata: rdata.subarray(0, v * 4),
    index: index.subarray(0, ii),
  };
}

/** Unit vector pointing left of travel at vertex k, with a capped miter. */
export function miterLeft(xyz: Float32Array, a: number, n: number, k: number, out: Float32Array): void {
  const get = (i: number) => {
    const j = (a + Math.max(0, Math.min(n - 1, i))) * 3;
    return [xyz[j], xyz[j + 1]] as const;
  };
  const [x0, y0] = get(k - 1);
  const [x1, y1] = get(k);
  const [x2, y2] = get(k + 1);
  let d1x = x1 - x0, d1y = y1 - y0;
  let d2x = x2 - x1, d2y = y2 - y1;
  const l1 = Math.hypot(d1x, d1y);
  const l2 = Math.hypot(d2x, d2y);
  if (l1 < 1e-6) { d1x = d2x; d1y = d2y; } else { d1x /= l1; d1y /= l1; }
  if (l2 < 1e-6) { d2x = d1x; d2y = d1y; } else { d2x /= l2; d2y /= l2; }
  if (l1 < 1e-6 && l2 < 1e-6) { out[0] = 0; out[1] = 1; return; }
  const n1x = -d1y, n1y = d1x;
  const n2x = -d2y, n2y = d2x;
  let mx = n1x + n2x;
  let my = n1y + n2y;
  const ml = Math.hypot(mx, my);
  if (ml < 1e-6) { out[0] = n2x; out[1] = n2y; return; }
  mx /= ml;
  my /= ml;
  const cos = mx * n2x + my * n2y;
  const scale = 1 / Math.max(cos, 0.5);
  out[0] = mx * scale;
  out[1] = my * scale;
}
