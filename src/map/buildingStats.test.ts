import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  fetchBuildingStats,
  heightCoverageLines,
  parseBuildingStats,
  type BuildingStats,
} from "./buildingStats";

const valid: BuildingStats = {
  bbox: [73.8317, 18.4954, 73.8817, 18.5454],
  source_dataset: "osm-geofabrik-western-zone@2026-11-09",
  floor_height_m: 3,
  buildings: 100,
  building_parts: 2,
  height_explicit: 1,
  height_levels_estimate: 2,
  height_unknown: 97,
  pct_explicit: 1,
  pct_levels_estimate: 2,
  pct_with_height: 3,
  pct_unknown: 97,
};

describe("parseBuildingStats", () => {
  it("accepts a consistent stats file", () => {
    expect(parseBuildingStats(valid)).toEqual(valid);
  });

  it("rejects missing keys or counts that do not add up", () => {
    expect(parseBuildingStats(null)).toBeNull();
    expect(parseBuildingStats({ ...valid, buildings: undefined })).toBeNull();
    expect(parseBuildingStats({ ...valid, height_unknown: 1 })).toBeNull();
    expect(parseBuildingStats({ ...valid, bbox: [1, 2] })).toBeNull();
  });

  it("the baked public stats file (if present) is valid", () => {
    const file = path.resolve(process.cwd(), "public/data/buildings.stats.json");
    if (!existsSync(file)) return;
    const stats = parseBuildingStats(JSON.parse(readFileSync(file, "utf8")));
    expect(stats).not.toBeNull();
    expect(stats!.pct_with_height).toBeLessThan(100);
  });
});

describe("heightCoverageLines", () => {
  it("states real counts, the floor-height assumption and the center-only scope", () => {
    const lines = heightCoverageLines(valid);
    expect(lines[0]).toBe("3 of 100 buildings (3%) have a height and are shown in 3D.");
    expect(lines[1]).toMatch(/floors × 3 m/);
    expect(lines[2]).toMatch(/97 \(97%\) have no height data and stay flat/);
    expect(lines[3]).toMatch(/Center area only/);
    expect(lines[3]).toMatch(/not all of PMC\/PCMC/);
  });
});

describe("fetchBuildingStats", () => {
  it("returns null on HTTP error or bad JSON", async () => {
    const notFound = vi.fn(async () => ({ ok: false })) as unknown as typeof fetch;
    expect(await fetchBuildingStats("/x", notFound)).toBeNull();
    const bad = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await fetchBuildingStats("/x", bad)).toBeNull();
    const good = vi.fn(async () => ({ ok: true, json: async () => valid })) as unknown as typeof fetch;
    expect(await fetchBuildingStats("/x", good)).toEqual(valid);
  });
});
