/** Bilinear sampling of the baked terrain grid (row 0 = southern edge). */

export interface TerrainMeta {
  x0: number;
  y0: number;
  step: number;
  nx: number;
  ny: number;
}

export class TerrainSampler {
  readonly meta: TerrainMeta;
  readonly h: Float32Array;

  constructor(meta: TerrainMeta, h: Float32Array) {
    this.meta = meta;
    this.h = h;
  }

  /** Elevation (m) at local (x east, y north). Clamps outside the grid. */
  sample(x: number, y: number): number {
    const { x0, y0, step, nx, ny } = this.meta;
    const fx = Math.min(Math.max((x - x0) / step, 0), nx - 1.0001);
    const fy = Math.min(Math.max((y - y0) / step, 0), ny - 1.0001);
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const tx = fx - i;
    const ty = fy - j;
    const h = this.h;
    const a = h[j * nx + i];
    const b = h[j * nx + i + 1];
    const c = h[(j + 1) * nx + i];
    const d = h[(j + 1) * nx + i + 1];
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }
}
