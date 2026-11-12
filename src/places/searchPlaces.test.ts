import { afterEach, describe, expect, it, vi } from "vitest";
import { filterPlaces, loadPlacesIndex } from "./searchPlaces";
import type { PlaceRecord } from "@/config/types";

const sample: PlaceRecord[] = [
  {
    id: "ward-fixture-a",
    name: "Fixture Ward A",
    kind: "ward",
    source: "wards",
    center: [73.8567, 18.5204],
  },
  {
    id: "gaz-fixture-1",
    name: "Fixture Gazetteer Place 1",
    kind: "gazetteer",
    source: "gazetteer",
    center: [73.8478, 18.529],
  },
];

describe("filterPlaces", () => {
  it("returns empty for blank query", () => {
    expect(filterPlaces(sample, "  ")).toEqual([]);
  });

  it("matches fixture ward names", () => {
    const hits = filterPlaces(sample, "ward a");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe("ward-fixture-a");
  });
});

describe("loadPlacesIndex", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts fixture:true index", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fixture: true,
          version: 1,
          city_id: "pune",
          note: "test",
          places: sample,
        }),
      }),
    );
    const index = await loadPlacesIndex("/test.json");
    expect(index.fixture).toBe(true);
    expect(index.places).toHaveLength(2);
  });

  it("fails closed when fixture is not true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fixture: false,
          version: 1,
          city_id: "pune",
          note: "bad",
          places: sample,
        }),
      }),
    );
    await expect(loadPlacesIndex("/test.json")).rejects.toThrow(/fixture/);
  });
});
