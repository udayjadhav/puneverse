import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it } from "vitest";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { LAYER_IDS } from "@/store/mapStore";
import { extrusionColor, flatFillColor, KNOWN_HEIGHT_SOURCES } from "./buildingsLayers";
import { parseBuildingStats } from "./buildingStats";
import { LAYER_ORDER, layersFor, TOGGLE_LAYERS } from "./contextLayers";
import { listBasemapPoiLayerIds } from "./hideBasemapExtrusions";
import { skyFor } from "./terrain";
import { syncTrees, treeScale, TREES_3D_ID, TREES_DOT_ID } from "./trees3d";
import { createMockMap } from "./testing/mockMap";

function styleWith(layers: LayerSpecification[]): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://example.com/{fontstack}/{range}.pbf",
    sources: {
      "pv-ready-context": { type: "vector", url: "pmtiles://x" },
      "pv-ready-roads": { type: "vector", url: "pmtiles://x" },
      "pv-ready-buildings": { type: "vector", url: "pmtiles://x" },
    },
    layers,
  };
}

describe("context layer specs", () => {
  for (const theme of ["day", "night"] as const) {
    it(`every ${theme} layer passes the MapLibre style spec`, () => {
      const layers = LAYER_IDS.flatMap((id) => layersFor(id, theme));
      expect(layers.length).toBeGreaterThan(10);
      expect(validateStyleMin(styleWith(layers))).toEqual([]);
    });
  }

  it("sky spec validates for both themes", () => {
    for (const theme of ["day", "night"] as const) {
      const style = { ...styleWith([]), sky: skyFor(theme) };
      expect(validateStyleMin(style)).toEqual([]);
    }
  });

  it("each toggle id controls only layers that are in LAYER_ORDER", () => {
    for (const ids of Object.values(TOGGLE_LAYERS)) {
      for (const id of ids ?? []) expect(LAYER_ORDER as readonly string[]).toContain(id);
    }
    for (const id of LAYER_IDS) {
      for (const spec of layersFor(id, "day")) {
        expect(LAYER_ORDER as readonly string[]).toContain(spec.id);
        expect(TOGGLE_LAYERS[id]).toContain(spec.id);
      }
    }
  });

  it("bridges are drawn above normal roads and rail", () => {
    const order = LAYER_ORDER as readonly string[];
    expect(order.indexOf("pv-ready-roads-bridge")).toBeGreaterThan(order.indexOf("pv-ready-roads-line"));
    expect(order.indexOf("pv-ready-roads-bridge")).toBeGreaterThan(order.indexOf("pv-ready-transit-rail"));
  });
});

describe("height precedence mirror (pipeline/conflate.py)", () => {
  it("treats Overture heights and floor estimates as known heights", () => {
    expect(KNOWN_HEIGHT_SOURCES).toEqual([
      "osm_explicit",
      "overture_height",
      "osm_levels_estimate",
      "overture_levels_estimate",
    ]);
    expect(KNOWN_HEIGHT_SOURCES).not.toContain("unknown");
  });

  it("colour expressions validate inside a fill-extrusion and fill layer", () => {
    const layers = [
      {
        id: "e",
        type: "fill-extrusion",
        source: "pv-ready-buildings",
        "source-layer": "buildings",
        paint: { "fill-extrusion-color": extrusionColor("day") },
      },
      {
        id: "f",
        type: "fill",
        source: "pv-ready-buildings",
        "source-layer": "buildings",
        paint: { "fill-color": flatFillColor("night") },
      },
    ] as LayerSpecification[];
    expect(validateStyleMin(styleWith(layers))).toEqual([]);
  });
});

describe("building stats with Overture", () => {
  it("accepts the Stage 2 shape and requires the counts to add up", () => {
    const base = {
      bbox: [73.8317, 18.4954, 73.8817, 18.5454],
      source_dataset: "osm + overture",
      floor_height_m: 3,
      buildings: 44272,
      building_parts: 20,
      height_explicit: 85,
      height_overture: 0,
      height_levels_estimate: 129,
      height_unknown: 44058,
      pct_explicit: 0.19,
      pct_levels_estimate: 0.29,
      pct_with_height: 0.48,
      pct_unknown: 99.52,
      by_footprint_dataset: { OpenStreetMap: 16772, "Google Open Buildings": 23888 },
    };
    expect(parseBuildingStats(base)).not.toBeNull();
    expect(parseBuildingStats({ ...base, height_overture: 5 })).toBeNull();
  });
});

describe("basemap POI hiding", () => {
  it("lists only basemap poi symbol layers", () => {
    expect(
      listBasemapPoiLayerIds([
        { id: "poi_r1", type: "symbol" },
        { id: "poi_transit", type: "symbol" },
        { id: "place_city", type: "symbol" },
        { id: "pv-ready-place-label", type: "symbol" },
        { id: "poi_fill", type: "fill" },
      ]),
    ).toEqual(["poi_r1", "poi_transit"]);
  });
});

describe("trees", () => {
  it("per-tree size variation is deterministic and bounded", () => {
    for (let i = 0; i < 200; i++) {
      expect(treeScale(i)).toBe(treeScale(i));
      expect(treeScale(i)).toBeGreaterThanOrEqual(0.75);
      expect(treeScale(i)).toBeLessThanOrEqual(1.25);
    }
  });

  it("3D trees in 3D mode, dots in Flat mode, nothing when off", () => {
    const m = createMockMap();
    m.api.addLayer({ id: TREES_3D_ID, type: "custom" });
    m.api.addLayer({ id: TREES_DOT_ID, type: "circle" });
    syncTrees(m.map, { enabled: true, mode: "3d" });
    expect([m.layout.get(TREES_3D_ID), m.layout.get(TREES_DOT_ID)]).toEqual(["visible", "none"]);
    syncTrees(m.map, { enabled: true, mode: "flat" });
    expect([m.layout.get(TREES_3D_ID), m.layout.get(TREES_DOT_ID)]).toEqual(["none", "visible"]);
    syncTrees(m.map, { enabled: false, mode: "3d" });
    expect([m.layout.get(TREES_3D_ID), m.layout.get(TREES_DOT_ID)]).toEqual(["none", "none"]);
  });
});
