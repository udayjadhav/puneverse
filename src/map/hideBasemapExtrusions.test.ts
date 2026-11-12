import { describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  hideBasemapFillExtrusions,
  isBasemapFillExtrusionLayer,
  listFillExtrusionLayerIds,
} from "./hideBasemapExtrusions";

describe("listFillExtrusionLayerIds (pure)", () => {
  it("returns empty for missing or empty layers", () => {
    expect(listFillExtrusionLayerIds(undefined)).toEqual([]);
    expect(listFillExtrusionLayerIds(null)).toEqual([]);
    expect(listFillExtrusionLayerIds([])).toEqual([]);
  });

  it("filters only basemap fill-extrusion ids (e.g. building-3d)", () => {
    expect(
      listFillExtrusionLayerIds([
        { id: "building", type: "fill" },
        { id: "building-3d", type: "fill-extrusion" },
        { id: "road", type: "line" },
        { id: "other-3d", type: "fill-extrusion" },
      ]),
    ).toEqual(["building-3d", "other-3d"]);
  });

  it("does not include pv-ready-* fill-extrusion layers", () => {
    expect(
      listFillExtrusionLayerIds([
        { id: "building-3d", type: "fill-extrusion" },
        { id: "pv-ready-buildings-extrusion", type: "fill-extrusion" },
        { id: "pv-ready-buildings-fill", type: "fill" },
      ]),
    ).toEqual(["building-3d"]);
  });
});

describe("isBasemapFillExtrusionLayer", () => {
  it("returns false for owned ready overlay extrusions", () => {
    expect(
      isBasemapFillExtrusionLayer({
        id: "pv-ready-buildings-extrusion",
        type: "fill-extrusion",
      }),
    ).toBe(false);
    expect(
      isBasemapFillExtrusionLayer({
        id: "building-3d",
        type: "fill-extrusion",
      }),
    ).toBe(true);
  });
});

describe("hideBasemapFillExtrusions", () => {
  it("sets visibility none on basemap fill-extrusion only — skips pv-ready-*", () => {
    const setLayoutProperty = vi.fn();
    const getLayer = vi.fn((id: string) =>
      id === "building-3d" ||
      id === "ghost-3d" ||
      id === "pv-ready-buildings-extrusion"
        ? { id }
        : undefined,
    );
    const map = {
      getStyle: () => ({
        layers: [
          { id: "building", type: "fill" },
          { id: "building-3d", type: "fill-extrusion" },
          { id: "ghost-3d", type: "fill-extrusion" },
          { id: "pv-ready-buildings-extrusion", type: "fill-extrusion" },
        ],
      }),
      getLayer,
      setLayoutProperty,
    } as unknown as MapLibreMap;

    const hidden = hideBasemapFillExtrusions(map);

    expect(hidden).toEqual(["building-3d", "ghost-3d"]);
    expect(setLayoutProperty).toHaveBeenCalledWith(
      "building-3d",
      "visibility",
      "none",
    );
    expect(setLayoutProperty).toHaveBeenCalledWith(
      "ghost-3d",
      "visibility",
      "none",
    );
    expect(setLayoutProperty).not.toHaveBeenCalledWith(
      "pv-ready-buildings-extrusion",
      "visibility",
      "none",
    );
    expect(setLayoutProperty).not.toHaveBeenCalledWith(
      "building",
      "visibility",
      "none",
    );
  });
});
