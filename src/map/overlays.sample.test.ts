import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { LAYER_IDS, type LayerId } from "@/store/mapStore";
import {
  SAMPLE_OVERLAY_IDS,
  STUB_OVERLAY_IDS,
  READY_OVERLAY_IDS,
  sampleOverlayUrl,
  isSampleOverlayId,
  overlayVisibility,
  ensureSampleOverlays,
  syncSampleOverlayVisibility,
} from "./overlays";

const OVERLAY_DIR = path.resolve(process.cwd(), "public/data/overlays");

/** Forbidden height / levels keys on any SAMPLE feature (flat footprints only). */
const HEIGHT_KEYS = new Set([
  "height",
  "height_m",
  "levels",
  "building:levels",
  "building_levels",
  "ele",
  "min_height",
  "render_height",
  "height_method",
  "normalized_height_m",
  "normalized_base_height_m",
]);

interface FeatureLike {
  type: string;
  properties?: Record<string, unknown> | null;
  geometry?: { type: string };
}

interface CollectionLike {
  type: string;
  description?: string;
  features: FeatureLike[];
}

function loadSample(id: string): CollectionLike {
  const file = path.join(OVERLAY_DIR, `${id}.sample.geojson`);
  expect(existsSync(file), `missing ${file}`).toBe(true);
  return JSON.parse(readFileSync(file, "utf8")) as CollectionLike;
}

function allEnabled(value: boolean): Record<LayerId, boolean> {
  return Object.fromEntries(LAYER_IDS.map((id) => [id, value])) as Record<LayerId, boolean>;
}

type MockMap = {
  sources: Set<string>;
  layers: Set<string>;
  layout: Map<string, string>;
  addedSources: Array<{ id: string; data: unknown }>;
  addedLayers: Array<{ id: string; type: string; source: string }>;
  asMap: () => MapLibreMap;
};

function createMockMap(seedLayers: string[] = []): MockMap {
  const sources = new Set<string>();
  const layers = new Set(seedLayers);
  const layout = new Map<string, string>();
  const addedSources: MockMap["addedSources"] = [];
  const addedLayers: MockMap["addedLayers"] = [];

  const api = {
    getSource: (id: string) => (sources.has(id) ? ({ type: "geojson" } as object) : undefined),
    addSource: (id: string, spec: { type: string; data: unknown }) => {
      sources.add(id);
      addedSources.push({ id, data: spec.data });
    },
    getLayer: (id: string) => (layers.has(id) ? ({ id } as object) : undefined),
    addLayer: (layer: { id: string; type: string; source: string; layout?: { visibility?: string } }) => {
      layers.add(layer.id);
      addedLayers.push({
        id: layer.id,
        type: layer.type,
        source: layer.source,
      });
      if (layer.layout?.visibility) {
        layout.set(`${layer.id}:visibility`, layer.layout.visibility);
      }
    },
    setLayoutProperty: (id: string, key: string, value: string) => {
      layout.set(`${id}:${key}`, value);
    },
  };

  return {
    sources,
    layers,
    layout,
    addedSources,
    addedLayers,
    asMap: () => api as unknown as MapLibreMap,
  };
}

describe("SAMPLE overlay GeoJSON fixtures", () => {
  it("exposes convention URLs for sample overlay ids (admin only after bake)", () => {
    expect(SAMPLE_OVERLAY_IDS).toEqual(["admin"]);
    for (const id of SAMPLE_OVERLAY_IDS) {
      expect(isSampleOverlayId(id)).toBe(true);
      expect(sampleOverlayUrl(id)).toBe(`/data/overlays/${id}.sample.geojson`);
    }
    expect(isSampleOverlayId("water")).toBe(false);
    expect(isSampleOverlayId("roads")).toBe(false);
    expect(isSampleOverlayId("buildings")).toBe(false);
  });

  it("lists ready buildings/roads/water/parks and no stub layers", () => {
    expect(READY_OVERLAY_IDS).toEqual(
      expect.arrayContaining(["buildings", "roads", "water", "parks"]),
    );
    expect(STUB_OVERLAY_IDS).toEqual([]);
    expect(existsSync(path.join(OVERLAY_DIR, "roads.sample.geojson"))).toBe(
      false,
    );
  });

  it("ships admin SAMPLE under size budget", () => {
    let total = 0;
    for (const id of SAMPLE_OVERLAY_IDS) {
      const file = path.join(OVERLAY_DIR, `${id}.sample.geojson`);
      const size = statSync(file).size;
      total += size;
      expect(size, `${id} too large`).toBeLessThan(50 * 1024);
    }
    expect(total).toBeLessThan(200 * 1024);
  });

  it("every SAMPLE feature has sample:true and no height/levels keys", () => {
    for (const id of SAMPLE_OVERLAY_IDS) {
      const col = loadSample(id);
      expect(col.type).toBe("FeatureCollection");
      expect(col.description ?? "").toMatch(/SAMPLE/i);
      expect(col.features.length).toBeGreaterThan(0);

      for (const f of col.features) {
        expect(f.type).toBe("Feature");
        expect(f.properties?.sample, `${id} feature missing sample:true`).toBe(
          true,
        );
        const props = f.properties ?? {};
        for (const key of Object.keys(props)) {
          expect(
            HEIGHT_KEYS.has(key),
            `${id} forbidden height key: ${key}`,
          ).toBe(false);
        }
      }
    }
  });

  it("admin SAMPLE has polygons with illustrative note", () => {
    const col = loadSample("admin");
    expect(col.features.length).toBeGreaterThanOrEqual(1);
    expect(col.features.length).toBeLessThanOrEqual(2);
    for (const f of col.features) {
      expect(String(f.properties?.note ?? "")).toMatch(
        /illustrative|not official/i,
      );
      expect(f.geometry?.type).toBe("Polygon");
    }
  });

  it("no buildings or roads SAMPLE file ships (real PMTiles only)", () => {
    expect(existsSync(path.join(OVERLAY_DIR, "buildings.sample.geojson"))).toBe(false);
    expect(existsSync(path.join(OVERLAY_DIR, "roads.sample.geojson"))).toBe(false);
  });
});

describe("overlayVisibility (pure)", () => {
  it("maps enabled toggle to MapLibre visibility", () => {
    expect(overlayVisibility(true)).toBe("visible");
    expect(overlayVisibility(false)).toBe("none");
  });
});

describe("ensureSampleOverlays (admin SAMPLE only)", () => {
  it("adds only SAMPLE sources; never roads/buildings/water/parks", () => {
    const mock = createMockMap();
    ensureSampleOverlays(mock.asMap(), allEnabled(true));

    expect(mock.addedSources).toHaveLength(SAMPLE_OVERLAY_IDS.length);
    for (const id of SAMPLE_OVERLAY_IDS) {
      const entry = mock.addedSources.find((s) => s.id === `pv-sample-${id}`);
      expect(entry, `missing source for ${id}`).toBeDefined();
      expect(entry?.data).toBe(sampleOverlayUrl(id));
    }
    expect(
      mock.addedLayers.some((l) => /water|parks|roads|buildings/.test(l.id)),
    ).toBe(false);
  });

  it("admin gets fill + line", () => {
    const mock = createMockMap();
    ensureSampleOverlays(mock.asMap(), allEnabled(false));

    expect(mock.addedLayers.some((l) => l.id === "pv-sample-admin-fill")).toBe(
      true,
    );
    expect(mock.addedLayers.some((l) => l.id === "pv-sample-admin-line")).toBe(
      true,
    );
    expect(mock.layout.get("pv-sample-admin-fill:visibility")).toBe("none");
  });

  it("is idempotent when sources/layers already exist", () => {
    const mock = createMockMap([
      "pv-sample-admin-fill",
      "pv-sample-admin-line",
    ]);
    mock.sources.add("pv-sample-admin");

    ensureSampleOverlays(mock.asMap(), {
      ...allEnabled(false),
      admin: true,
    });

    expect(mock.addedSources).toHaveLength(0);
    expect(mock.addedLayers).toHaveLength(0);
    expect(mock.layout.get("pv-sample-admin-fill:visibility")).toBe("visible");
  });
});

describe("syncSampleOverlayVisibility", () => {
  it("updates existing SAMPLE layers and no-ops missing ones", () => {
    const mock = createMockMap([
      "pv-sample-admin-fill",
      "pv-sample-admin-line",
    ]);
    const setSpy = vi.spyOn(mock.asMap(), "setLayoutProperty");

    syncSampleOverlayVisibility(mock.asMap(), {
      ...allEnabled(false),
      admin: true,
    });

    expect(mock.layout.get("pv-sample-admin-fill:visibility")).toBe("visible");
    const idsTouched = setSpy.mock.calls.map((c) => c[0] as string);
    expect(idsTouched.some((id) => /water|parks|roads/.test(id))).toBe(false);
  });
});
