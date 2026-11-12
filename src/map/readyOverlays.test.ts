import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LayerId } from "@/store/mapStore";
import { useMapStore } from "@/store/mapStore";
import { BUILDINGS_EXTRUSION_ID, BUILDINGS_FILL_ID } from "./buildingsLayers";
import { ensureReadyOverlays, TILES_MISSING_BANNER } from "./readyOverlays";
import { LAYER_ORDER } from "./contextLayers";
import { HILLSHADE_LAYER_ID, HILLSHADE_SOURCE_ID, TERRAIN_SOURCE_ID } from "./terrain";
import { syncOverlayVisibility } from "./layerVisibility";
import { createMockMap } from "./testing/mockMap";

vi.mock("./pmtiles", () => ({
  registerPmtilesProtocol: () => true,
  toPmtilesUrl: (p: string) => `pmtiles://http://localhost${p}`,
}));

const enabled: Record<LayerId, boolean> = {
  buildings: true,
  roads: true,
  water: true,
  parks: true,
  transit: true,
  labels: true,
  terrain: true,
  trees: false,
  admin: true,
};

function stubFetch(ok: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, status: ok ? 200 : 404 })),
  );
}

describe("ensureReadyOverlays", () => {
  beforeEach(() => {
    useMapStore.setState({ tilesBanner: null });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds sources and stacks ground < roads < buildings < basemap labels < our labels", async () => {
    stubFetch(true);
    const m = createMockMap();
    await ensureReadyOverlays(m.map, { layersEnabled: enabled, mode: "3d", theme: "day" });
    expect([...m.sources.keys()].sort()).toEqual([
      "pv-ready-buildings",
      "pv-ready-context",
      "pv-ready-roads",
      HILLSHADE_SOURCE_ID,
      TERRAIN_SOURCE_ID,
    ].sort());
    const ids = m.layerIds();
    const at = (id: string) => ids.indexOf(id);
    // Every PuneVerse layer present sits in LAYER_ORDER order.
    const ours = ids.filter((id) => id.startsWith("pv-"));
    const expected = (LAYER_ORDER as readonly string[]).filter((id) => ours.includes(id));
    expect(ours).toEqual(expected);
    expect(at(HILLSHADE_LAYER_ID)).toBeLessThan(at("pv-ready-water-fill"));
    expect(at("pv-ready-roads-line")).toBeLessThan(at("pv-ready-roads-bridge"));
    expect(at("pv-ready-roads-bridge")).toBeLessThan(at(BUILDINGS_FILL_ID));
    expect(at(BUILDINGS_EXTRUSION_ID)).toBeLessThan(at("road-label"));
    expect(at("place-label")).toBeLessThan(at("pv-ready-place-label"));
    expect(m.terrain).toEqual({ source: TERRAIN_SOURCE_ID, exaggeration: 1 });
    expect(m.sky).not.toBeNull();
    expect(useMapStore.getState().tilesBanner).toBeNull();
  });

  it("second call (or style reload) never duplicates layers or sources", async () => {
    stubFetch(true);
    const m = createMockMap();
    const state = { layersEnabled: enabled, mode: "3d" as const, theme: "day" as const };
    await ensureReadyOverlays(m.map, state);
    const first = m.addLayerCalls.length;
    const firstIds = m.layerIds();
    await ensureReadyOverlays(m.map, state);
    expect(m.addLayerCalls).toHaveLength(first);
    m.wipeStyle();
    expect(m.terrain).toBeNull();
    await ensureReadyOverlays(m.map, { ...state, theme: "night" });
    expect(m.layerIds()).toEqual(firstIds);
    expect(m.terrain).not.toBeNull();
  });

  it("terrain toggle off removes terrain and hides hillshade", async () => {
    stubFetch(true);
    const m = createMockMap();
    await ensureReadyOverlays(m.map, { layersEnabled: enabled, mode: "3d", theme: "day" });
    syncOverlayVisibility(m.map, { ...enabled, terrain: false }, "3d");
    expect(m.terrain).toBeNull();
    expect(m.layout.get(HILLSHADE_LAYER_ID)).toBe("none");
  });

  it("flat mode at load: extrusion added hidden", async () => {
    stubFetch(true);
    const m = createMockMap();
    await ensureReadyOverlays(m.map, { layersEnabled: enabled, mode: "flat", theme: "day" });
    expect(m.layout.get(BUILDINGS_EXTRUSION_ID)).toBe("none");
    expect(m.layout.get(BUILDINGS_FILL_ID)).toBe("visible");
  });

  it("bails out without touching the map when the style was replaced during the probe", async () => {
    stubFetch(true);
    const m = createMockMap();
    await ensureReadyOverlays(m.map, {
      layersEnabled: enabled,
      mode: "3d",
      theme: "day",
      isCurrent: () => false,
    });
    expect(m.addLayerCalls).toHaveLength(0);
    expect(m.sources.size).toBe(0);
  });

  it("missing tiles → visible banner, no layers", async () => {
    stubFetch(false);
    const m = createMockMap();
    await ensureReadyOverlays(m.map, { layersEnabled: enabled, mode: "3d", theme: "day" });
    expect(useMapStore.getState().tilesBanner).toBe(TILES_MISSING_BANNER);
    expect(m.layerIds().some((id) => id.startsWith("pv-ready-"))).toBe(false);
  });
});

describe("syncOverlayVisibility", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("applies layer toggles and Flat/3D mode together", async () => {
    stubFetch(true);
    const m = createMockMap();
    await ensureReadyOverlays(m.map, { layersEnabled: enabled, mode: "3d", theme: "day" });
    syncOverlayVisibility(m.map, { ...enabled, roads: false, water: false }, "flat");
    expect(m.layout.get("pv-ready-roads-line")).toBe("none");
    expect(m.layout.get("pv-ready-roads-bridge")).toBe("none");
    expect(m.layout.get("pv-ready-water-fill")).toBe("none");
    expect(m.layout.get("pv-ready-parks-fill")).toBe("visible");
    expect(m.layout.get(BUILDINGS_EXTRUSION_ID)).toBe("none");
    expect(m.layout.get(BUILDINGS_FILL_ID)).toBe("visible");
  });
});
