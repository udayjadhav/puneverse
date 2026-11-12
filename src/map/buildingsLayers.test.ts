import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createExpression,
  featureFilter,
  validateStyleMin,
  type FilterSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import { getDefaultCityConfig } from "@/config/loadCityConfig";
import {
  BUILDINGS_EXTRUSION_ID,
  BUILDINGS_EXTRUSION_MINZOOM,
  BUILDINGS_FILL_ID,
  BUILDINGS_SOURCE_ID,
  BUILDINGS_SOURCE_LAYER,
  EXTRUSION_BASE,
  EXTRUSION_FILTER,
  EXTRUSION_HEIGHT,
  ensureBuildingLayers,
  extrusionColor,
  flatFillFilter,
  interactiveBuildingLayerIds,
  syncBuildingLayers,
} from "./buildingsLayers";
import { createMockMap } from "./testing/mockMap";

/**
 * FIXTURE: real features copied from the S0 center bake by
 * pipeline/bake_center.py (15 per height_source). Not full city.
 */
interface FixtureFeature {
  id: number;
  properties: Record<string, unknown>;
  geometry: { type: string };
}
const fixture = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), "public/data/fixtures/buildings.fixture.geojson"),
    "utf8",
  ),
) as { description: string; features: FixtureFeature[] };

/** Vector tiles report MultiPolygon features with geometry-type "Polygon" (type 3). */
function asTileFeature(f: FixtureFeature) {
  return { type: 3 as const, id: f.id, properties: f.properties, geometry: [] };
}

function passes(filter: FilterSpecification, f: FixtureFeature): boolean {
  return featureFilter(filter, "layers[0].filter").filter({ zoom: 16 }, asTileFeature(f) as never);
}

function evaluate(expr: unknown, f: FixtureFeature): unknown {
  const parsed = createExpression(expr, "layers[0].paint.fill-extrusion-height");
  if (parsed.result !== "success") throw new Error(JSON.stringify(parsed.value));
  return parsed.value.evaluate({ zoom: 16 }, asTileFeature(f) as never);
}

const SOURCE_ID = BUILDINGS_SOURCE_ID;
const on3d = { enabled: true, mode: "3d" as const, theme: "day" as const };

describe("building expressions against fixture features", () => {
  it("fixture is labelled and covers all three height sources", () => {
    expect(fixture.description).toMatch(/FIXTURE/);
    const sources = new Set(fixture.features.map((f) => f.properties.height_source));
    expect(sources).toEqual(new Set(["osm_explicit", "osm_levels_estimate", "unknown"]));
  });

  it("extrusion filter = known positive height only", () => {
    for (const f of fixture.features) {
      const known = f.properties.height_source !== "unknown";
      expect(passes(EXTRUSION_FILTER, f), String(f.id)).toBe(known);
    }
  });

  it("3D flat fill covers exactly the non-extruded, non-part buildings", () => {
    for (const f of fixture.features) {
      const isPart = f.properties.is_building_part === true;
      const extruded = passes(EXTRUSION_FILTER, f);
      expect(passes(flatFillFilter("3d"), f)).toBe(!extruded && !isPart);
    }
  });

  it("flat mode fill covers every non-part building", () => {
    for (const f of fixture.features) {
      const isPart = f.properties.is_building_part === true;
      expect(passes(flatFillFilter("flat"), f)).toBe(!isPart);
    }
  });

  it("an outline whose raised parts carry the shape stays flat; its parts extrude", () => {
    const outline: FixtureFeature = {
      id: 30975535,
      geometry: { type: "MultiPolygon" },
      properties: {
        height_source: "osm_levels_estimate",
        normalized_height_m: 12,
        has_extruded_parts: true,
      },
    };
    const part: FixtureFeature = {
      id: 2300183110,
      geometry: { type: "MultiPolygon" },
      properties: {
        height_source: "osm_explicit",
        normalized_height_m: 18,
        normalized_base_height_m: 15,
        is_building_part: true,
      },
    };
    expect(passes(EXTRUSION_FILTER, outline)).toBe(false);
    expect(passes(flatFillFilter("3d"), outline)).toBe(true);
    expect(passes(EXTRUSION_FILTER, part)).toBe(true);
    expect(passes(flatFillFilter("3d"), part)).toBe(false);
    expect(evaluate(EXTRUSION_BASE, part)).toBe(15);
  });

  it("height / base come from normalized props and base never exceeds height", () => {
    for (const f of fixture.features.filter((x) => passes(EXTRUSION_FILTER, x))) {
      const h = evaluate(EXTRUSION_HEIGHT, f) as number;
      const b = evaluate(EXTRUSION_BASE, f) as number;
      expect(h).toBe(f.properties.normalized_height_m);
      expect(b).toBeLessThanOrEqual(h);
    }
    const bad: FixtureFeature = {
      id: 1,
      geometry: { type: "Polygon" },
      properties: {
        height_source: "osm_explicit",
        normalized_height_m: 5,
        normalized_base_height_m: 9,
      },
    };
    expect(evaluate(EXTRUSION_BASE, bad)).toBe(5);
  });

  it("no constant default height anywhere in the height expression", () => {
    expect(JSON.stringify(EXTRUSION_HEIGHT)).toBe(
      JSON.stringify(["to-number", ["get", "normalized_height_m"], 0]),
    );
    const unknown = fixture.features.find((f) => f.properties.height_source === "unknown")!;
    expect(evaluate(EXTRUSION_HEIGHT, unknown)).toBe(0);
  });

  it("both building layers pass MapLibre style validation (day + night)", () => {
    for (const theme of ["day", "night"] as const) {
      const m = createMockMap([]);
      ensureBuildingLayers(m.map, SOURCE_ID, { ...on3d, theme });
      const style = {
        version: 8,
        sources: { [SOURCE_ID]: { type: "vector", url: "pmtiles://http://localhost/t.pmtiles" } },
        light: m.light,
        layers: m.addLayerCalls.map((c) => c.layer),
      };
      expect(validateStyleMin(style as never)).toEqual([]);
      expect(JSON.stringify(extrusionColor(theme))).toContain("feature-state");
    }
  });
});

describe("ensureBuildingLayers (mock map)", () => {
  it("uses the configured source-layer and inserts both layers below labels", () => {
    const m = createMockMap();
    ensureBuildingLayers(m.map, SOURCE_ID, on3d);
    expect(BUILDINGS_SOURCE_LAYER).toBe(getDefaultCityConfig().buildings?.source_layer);
    for (const id of [BUILDINGS_FILL_ID, BUILDINGS_EXTRUSION_ID]) {
      const layer = m.layer(id)!;
      expect(layer["source-layer"]).toBe(BUILDINGS_SOURCE_LAYER);
      expect(layer.source).toBe(SOURCE_ID);
    }
    expect(m.layerIds()).toEqual([
      "background",
      "water",
      BUILDINGS_FILL_ID,
      BUILDINGS_EXTRUSION_ID,
      "road-label",
      "place-label",
    ]);
    const ext = m.layer(BUILDINGS_EXTRUSION_ID)!;
    expect(ext.type).toBe("fill-extrusion");
    expect(ext.minzoom).toBe(BUILDINGS_EXTRUSION_MINZOOM);
    expect(ext.filter).toEqual(EXTRUSION_FILTER);
    expect(ext.paint?.["fill-extrusion-vertical-gradient"]).toBe(true);
    expect(ext.paint?.["fill-extrusion-opacity"]).toBe(0.9);
    expect(ext.paint?.["fill-extrusion-base"]).toEqual(EXTRUSION_BASE);
    expect(m.light).toMatchObject({ anchor: "viewport" });
  });

  it("goes above basemap buildings when the style interleaves early symbols (Liberty order)", () => {
    const m = createMockMap([
      { id: "background", type: "background" },
      { id: "road_one_way_arrow", type: "symbol" },
      { id: "bridge_street", type: "line" },
      { id: "building", type: "fill" },
      { id: "building-3d", type: "fill-extrusion" },
      { id: "water_name", type: "symbol" },
      { id: "label_city", type: "symbol" },
      { id: "pv-sample-admin-fill", type: "fill" },
    ]);
    ensureBuildingLayers(m.map, SOURCE_ID, on3d);
    expect(m.layerIds()).toEqual([
      "background",
      "road_one_way_arrow",
      "bridge_street",
      "building",
      "building-3d",
      BUILDINGS_FILL_ID,
      BUILDINGS_EXTRUSION_ID,
      "water_name",
      "label_city",
      "pv-sample-admin-fill",
    ]);
  });

  it("is idempotent: a second call adds nothing", () => {
    const m = createMockMap();
    ensureBuildingLayers(m.map, SOURCE_ID, on3d);
    ensureBuildingLayers(m.map, SOURCE_ID, on3d);
    expect(m.addLayerCalls).toHaveLength(2);
    expect(m.layerIds().filter((id) => id.startsWith("pv-ready-buildings"))).toHaveLength(2);
  });

  it("re-adds after a style reload (setStyle wipes layers) without duplicates", () => {
    const m = createMockMap();
    ensureBuildingLayers(m.map, SOURCE_ID, on3d);
    m.wipeStyle();
    expect(m.layer(BUILDINGS_FILL_ID)).toBeUndefined();
    ensureBuildingLayers(m.map, SOURCE_ID, { ...on3d, theme: "night" });
    expect(m.layerIds().filter((id) => id.startsWith("pv-ready-buildings"))).toEqual([
      BUILDINGS_FILL_ID,
      BUILDINGS_EXTRUSION_ID,
    ]);
    expect(m.layerIds().indexOf(BUILDINGS_EXTRUSION_ID)).toBeLessThan(
      m.layerIds().indexOf("road-label"),
    );
  });

  it("3D: extrusion visible, fill limited to unknown heights", () => {
    const m = createMockMap();
    ensureBuildingLayers(m.map, SOURCE_ID, on3d);
    expect(m.layout.get(BUILDINGS_EXTRUSION_ID)).toBe("visible");
    expect(m.layout.get(BUILDINGS_FILL_ID)).toBe("visible");
    expect(m.filters.get(BUILDINGS_FILL_ID)).toEqual(flatFillFilter("3d"));
  });

  it("Flat: extrusion hidden, fill shows every footprint; back to 3D restores", () => {
    const m = createMockMap();
    ensureBuildingLayers(m.map, SOURCE_ID, on3d);
    syncBuildingLayers(m.map, { enabled: true, mode: "flat" });
    expect(m.layout.get(BUILDINGS_EXTRUSION_ID)).toBe("none");
    expect(m.layout.get(BUILDINGS_FILL_ID)).toBe("visible");
    expect(m.filters.get(BUILDINGS_FILL_ID)).toEqual(flatFillFilter("flat"));
    syncBuildingLayers(m.map, { enabled: true, mode: "3d" });
    expect(m.layout.get(BUILDINGS_EXTRUSION_ID)).toBe("visible");
    expect(m.filters.get(BUILDINGS_FILL_ID)).toEqual(flatFillFilter("3d"));
  });

  it("layer toggle off hides both layers in either mode", () => {
    const m = createMockMap();
    ensureBuildingLayers(m.map, SOURCE_ID, { ...on3d, enabled: false });
    expect(m.layout.get(BUILDINGS_EXTRUSION_ID)).toBe("none");
    expect(m.layout.get(BUILDINGS_FILL_ID)).toBe("none");
    expect(interactiveBuildingLayerIds(m.map)).toEqual([]);
  });

  it("interactive layers: 3D first, flat mode only the fill", () => {
    const m = createMockMap();
    ensureBuildingLayers(m.map, SOURCE_ID, on3d);
    expect(interactiveBuildingLayerIds(m.map)).toEqual([
      BUILDINGS_EXTRUSION_ID,
      BUILDINGS_FILL_ID,
    ]);
    syncBuildingLayers(m.map, { enabled: true, mode: "flat" });
    expect(interactiveBuildingLayerIds(m.map)).toEqual([BUILDINGS_FILL_ID]);
  });

  it("sync is a no-op before layers exist", () => {
    const m = createMockMap();
    syncBuildingLayers(m.map, { enabled: true, mode: "flat" });
    expect(m.layout.size).toBe(0);
  });
});
