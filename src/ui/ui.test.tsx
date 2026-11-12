// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildingInfoFromProps } from "@/map/buildingInfo";
import { useMapStore } from "@/store/mapStore";
import { BuildingPanel } from "./BuildingPanel";
import { LayerPanel } from "./LayerPanel";
import { TopBar } from "./TopBar";
import { HeightLegend } from "./HeightLegend";
import { BuildingTooltip } from "./BuildingTooltip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

/** Client render (zustand's server snapshot ignores test state). */
function renderToStaticMarkup(el: ReactElement): string {
  cleanup?.();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(el));
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host.innerHTML;
}

const stats = {
  bbox: [73.8317, 18.4954, 73.8817, 18.5454] as [number, number, number, number],
  source_dataset: "osm-geofabrik-western-zone@2026-11-09",
  floor_height_m: 3,
  buildings: 16772,
  building_parts: 20,
  height_explicit: 85,
  height_levels_estimate: 129,
  height_unknown: 16558,
  pct_explicit: 0.51,
  pct_levels_estimate: 0.77,
  pct_with_height: 1.28,
  pct_unknown: 98.72,
};

describe("TopBar view-mode toggle", () => {
  beforeEach(() => useMapStore.setState({ viewMode: "3d" }));

  it("offers Flat while in 3D and 3D while flat", () => {
    expect(renderToStaticMarkup(<TopBar />)).toMatch(/data-testid="view-mode-toggle"[^>]*>Flat</);
    act(() => useMapStore.getState().toggleViewMode());
    const html = renderToStaticMarkup(<TopBar />);
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="view-mode-toggle"[^>]*>3D</);
  });
});

describe("BuildingPanel", () => {
  beforeEach(() => useMapStore.setState({ selectedBuilding: null, dataView: true }));

  it("renders nothing without a selection", () => {
    expect(renderToStaticMarkup(<BuildingPanel />)).toBe("");
  });

  it("stays hidden in the default view (Data details off)", () => {
    useMapStore.setState({ dataView: false });
    useMapStore.getState().selectBuilding(buildingInfoFromProps({ building_type: "house" }, 1));
    expect(renderToStaticMarkup(<BuildingPanel />)).toBe("");
  });

  it("shows Unknown for a building with no height data", () => {
    useMapStore.getState().selectBuilding(
      buildingInfoFromProps(
        {
          building_type: "yes",
          height_source: "unknown",
          height_confidence: "none",
          source_dataset: "osm-geofabrik-western-zone@2026-11-09",
          source_feature_id: "w52755363",
        },
        105510726,
      ),
    );
    const html = renderToStaticMarkup(<BuildingPanel />);
    expect(html).toContain("Building (type not tagged)");
    expect(html).toMatch(/Height<\/dt><dd[^>]*>Unknown/);
    expect(html).toMatch(/Floors<\/dt><dd[^>]*>Unknown/);
    expect(html).toMatch(/Height source<\/dt><dd[^>]*>Unknown/);
    expect(html).toContain('href="https://www.openstreetmap.org/way/52755363"');
    expect(html).not.toContain("OSM name");
  });
});

describe("BuildingTooltip", () => {
  beforeEach(() => useMapStore.setState({ tooltip: null }));

  it("shows only the name when the building has one", () => {
    const info = buildingInfoFromProps(
      { name: "Shaniwar Wada", building_type: "fort", height_source: "osm_explicit", normalized_height_m: 9 },
      3,
    );
    useMapStore.setState({ tooltip: { info, x: 10, y: 20, pinned: false } });
    const html = renderToStaticMarkup(<BuildingTooltip />);
    expect(html).toContain(">Shaniwar Wada<");
    expect(html).not.toMatch(/height|osm|metre| m</i);
  });

  it("falls back to the building type, never to technical fields", () => {
    const info = buildingInfoFromProps(
      { building_type: "yes", footprint_dataset: "Google Open Buildings", height_source: "unknown" },
      4,
    );
    useMapStore.setState({ tooltip: { info, x: 0, y: 0, pinned: true } });
    const html = renderToStaticMarkup(<BuildingTooltip />);
    expect(html).toContain(">Building<");
    expect(html).not.toContain("Google");
  });

  it("renders nothing without a hover", () => {
    expect(renderToStaticMarkup(<BuildingTooltip />)).toBe("");
  });
});

describe("LayerPanel honesty", () => {
  it("shows real coverage numbers, flat-unknown note and the new real layers", () => {
    useMapStore.setState({ buildingStats: stats });
    const html = renderToStaticMarkup(<LayerPanel />);
    expect(html).toContain("214 of 16,772 buildings (1.28%) have a height and are shown in 3D.");
    expect(html).toContain("floors × 3 m");
    expect(html).toContain("stay flat");
    expect(html).not.toContain("Unavailable — no real geometry loaded.");
    expect(html).toContain("Rail and metro");
    expect(html).toContain("Only trees surveyed in OpenStreetMap");
    expect(html).toContain("SAMPLE");
  });

  it("says so when the stats file is missing", () => {
    useMapStore.setState({ buildingStats: "unavailable" });
    expect(renderToStaticMarkup(<LayerPanel />)).toContain("Height coverage numbers unavailable");
  });
});

describe("HeightLegend", () => {
  it("explains raised vs flat in 3D with the real share, and hides in Flat", () => {
    useMapStore.setState({ viewMode: "3d", buildingStats: stats });
    const html = renderToStaticMarkup(<HeightLegend />);
    expect(html).toContain("height known (1.28% of buildings)");
    expect(html).toContain("no height in the source data yet");
    expect(html).toContain("Why?");
    act(() => useMapStore.setState({ viewMode: "flat" }));
    expect(renderToStaticMarkup(<HeightLegend />)).toBe("");
  });
});
