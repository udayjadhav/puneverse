import { describe, expect, it, vi } from "vitest";
import {
  applySelectionState,
  attachBuildingInteraction,
  pickBuilding,
} from "./buildingInteraction";
import {
  BUILDINGS_EXTRUSION_ID,
  BUILDINGS_FILL_ID,
  BUILDINGS_SOURCE_ID,
  BUILDINGS_SOURCE_LAYER,
  ensureBuildingLayers,
} from "./buildingsLayers";
import { createMockMap } from "./testing/mockMap";

function setup() {
  const m = createMockMap();
  m.sources.set(BUILDINGS_SOURCE_ID, {});
  ensureBuildingLayers(m.map, BUILDINGS_SOURCE_ID, {
    enabled: true,
    mode: "3d",
    theme: "day",
  });
  return m;
}

describe("pickBuilding", () => {
  it("queries 3D then flat layers and maps the hit", () => {
    const m = setup();
    const query = vi.fn(() => [
      { id: 42, properties: { height_source: "unknown", source_feature_id: "w21" } },
    ]);
    m.api.queryRenderedFeatures = query;
    const info = pickBuilding(m.map, { x: 1, y: 2 } as never);
    expect(query).toHaveBeenCalledWith(
      { x: 1, y: 2 },
      { layers: [BUILDINGS_EXTRUSION_ID, BUILDINGS_FILL_ID] },
    );
    expect(info?.featureId).toBe(42);
    expect(info?.sourceFeatureId).toBe("w21");
  });

  it("returns null on empty map area", () => {
    const m = setup();
    expect(pickBuilding(m.map, { x: 0, y: 0 } as never)).toBeNull();
  });
});

describe("applySelectionState", () => {
  it("sets and clears feature-state on the buildings source-layer", () => {
    const m = setup();
    applySelectionState(m.map, 7, null);
    const key = (id: number) => `${BUILDINGS_SOURCE_ID}/${BUILDINGS_SOURCE_LAYER}/${id}`;
    expect(m.featureState.get(key(7))).toEqual({ selected: true });
    applySelectionState(m.map, 9, 7);
    expect(m.featureState.get(key(7))).toEqual({ selected: false });
    expect(m.featureState.get(key(9))).toEqual({ selected: true });
  });
});

describe("attachBuildingInteraction", () => {
  it("wires click + hover cursor and detaches cleanly", () => {
    const m = setup();
    const onSelect = vi.fn();
    const detach = attachBuildingInteraction(m.map, onSelect);
    const enter = m.handlers.find((h) => h.type === "mouseenter")!.fn as () => void;
    enter();
    expect(m.canvas.style.cursor).toBe("pointer");
    const click = m.handlers.find((h) => h.type === "click")!.fn as (e: unknown) => void;
    click({ point: { x: 0, y: 0 } });
    expect(onSelect).toHaveBeenCalledWith(null, { x: 0, y: 0 });
    detach();
    expect(m.handlers).toHaveLength(0);
  });
});
