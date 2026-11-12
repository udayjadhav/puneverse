import { describe, expect, it } from "vitest";
import { buildBuildings, estimateFloors, floorHeightFor, type BuildingChunkArrays } from "./buildingGeometry";

function unitSquare(kind: number, height: number, seed: number): BuildingChunkArrays {
  // One square building: ring 0 has 4 corners; bld_ring [0,1].
  return {
    ring_start: new Uint32Array([0, 4]),
    bld_ring: new Uint32Array([0, 1]),
    xy: new Int16Array([0, 0, 10, 0, 10, 10, 0, 10]),
    height: new Float32Array([height]),
    base: new Float32Array([560]),
    kind: new Uint8Array([kind]),
    roof: new Uint8Array([120, 120, 120]),
    wall: new Uint8Array([180, 170, 160]),
    seed: new Uint16Array([seed]),
  };
}

describe("floorHeightFor / estimateFloors", () => {
  it("uses taller floors for industrial and commercial", () => {
    expect(floorHeightFor(3)).toBe(4.5);
    expect(floorHeightFor(2)).toBe(3.6);
    expect(floorHeightFor(0)).toBe(3.1);
    expect(estimateFloors(31, 0)).toBe(10);
  });
});

describe("buildBuildings seed provenance", () => {
  it("keeps the full 16-bit bake seed in bdata (not truncated to 8 bits)", () => {
    const seed = 0x4a3f; // 19007 — high byte must survive
    const built = buildBuildings(unitSquare(1, 18, seed), 0, 0, { parapets: true });
    expect(built.bdata).toBeInstanceOf(Float32Array);
    // First wall vertex: kind, part, seed, floors
    expect(built.bdata[0]).toBe(1);
    expect(built.bdata[1]).toBe(0);
    expect(built.bdata[2]).toBe(seed);
    expect(built.bdata[3]).toBeGreaterThan(0);
  });

  it("skips parapets when opted out (low-detail path)", () => {
    const withP = buildBuildings(unitSquare(0, 12, 42), 0, 0, { parapets: true });
    const noP = buildBuildings(unitSquare(0, 12, 42), 0, 0, { parapets: false });
    expect(withP.position.length).toBeGreaterThan(noP.position.length);
  });
});
