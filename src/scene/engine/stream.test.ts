import { describe, expect, it } from "vitest";
import { chunkKey, selectResidentChunks } from "./stream";

describe("selectResidentChunks", () => {
  const grid: { ix: number; iy: number }[] = [];
  for (let ix = -5; ix <= 5; ix++) for (let iy = -5; iy <= 5; iy++) grid.push({ ix, iy });

  it("keeps only chunks inside the radius", () => {
    const got = selectResidentChunks(grid, 1000, 0, 0, { streamRadius: 1500, maxChunks: 200 });
    expect(got.every((c) => Math.hypot((c.ix + 0.5) * 1000, (c.iy + 0.5) * 1000) <= 1500)).toBe(true);
    expect(got.length).toBeGreaterThan(0);
  });

  it("caps at maxChunks nearest to camera", () => {
    const got = selectResidentChunks(grid, 1000, 0, 0, { streamRadius: 20000, maxChunks: 7 });
    expect(got).toHaveLength(7);
    const d0 = Math.hypot((got[0].ix + 0.5) * 1000, (got[0].iy + 0.5) * 1000);
    const dLast = Math.hypot((got[6].ix + 0.5) * 1000, (got[6].iy + 0.5) * 1000);
    expect(d0).toBeLessThanOrEqual(dLast);
    expect(chunkKey(got[0].ix, got[0].iy)).toMatch(/^-?\d+_-?\d+$/);
  });
});
