// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SceneManifest } from "@/scene/types";
import { TIME_PRESETS, useSceneStore } from "@/store/sceneStore";
import { BottomBar } from "./BottomBar";
import { CityCard } from "./CityCard";
import { formatClock, formatLatLon, heightSourceBreakdown } from "./heightBreakdown";
import { LoadingScreen } from "./LoadingScreen";
import { PlaceReadout } from "./PlaceReadout";
import { SceneAbout } from "./SceneAbout";
import { SceneTooltip } from "./SceneTooltip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function render(el: ReactElement): HTMLElement {
  cleanup?.();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(el));
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

function click(el: Element | null) {
  if (!el) throw new Error("element not found");
  act(() => (el as HTMLElement).click());
}

const manifest = {
  version: 1,
  name: "Pune · S0 centre",
  crs: "EPSG:32643",
  origin_lonlat: [73.8553, 18.5195],
  origin_utm: [379172.395, 2048045.967],
  extent: { xmin: -4750, ymin: -5650, xmax: 3600, ymax: 3900 },
  extent_lonlat: [73.81066, 18.46817, 73.88917, 18.55495],
  chunk_size: 1000,
  chunks: [],
  building_names: [],
  stats: {
    buildings: 107135,
    height_sources: { mapped: 118, floors: 1351, satellite: 94763, area: 10874, default: 29 },
    height_source_labels: {
      mapped: "Mapped height",
      floors: "Mapped floors × 3 m",
      satellite: "Satellite estimate (GlobalBuildingAtlas)",
      area: "Area estimate (GHSL 100 m)",
      default: "Default by size and type",
    },
    height_validation_gba: {
      vs_mapped_height: { n: 106, mae_m: 8.33, bias_m: -5.47 },
      vs_mapped_floors_x3: { n: 709, mae_m: 4.74, bias_m: -3.56 },
    },
    trees: 0,
    road_segments: 0,
    street_lights: 0,
    rail_lines: 0,
    water_triangles: 0,
  },
  towers: [],
  places: [],
  landmarks: [],
  stations: [],
  presets: [
    { label: "Shaniwar Wada", x: -64.2, y: -13, z: 556.6, kind: "heritage" },
    { label: "Pune Station", x: 2024.3, y: 1025, z: 557.2, kind: "station" },
    { label: "Parvati", x: -845.9, y: -2461.3, z: 638.3, kind: "heritage" },
  ],
  sources: { terrain: "Copernicus DEM GLO-30", osm: "OpenStreetMap contributors" },
  baked_at: "2026-11-11T20:51:36",
} satisfies SceneManifest;

const initial = useSceneStore.getState();
beforeEach(() => {
  useSceneStore.setState({ ...initial, manifest });
});

describe("heightSourceBreakdown", () => {
  it("returns one row per source in order with percents summing to 100", () => {
    const rows = heightSourceBreakdown(manifest);
    expect(rows.map((r) => r.source)).toEqual(["mapped", "floors", "satellite", "area", "default"]);
    expect(rows.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(100, 6);
    const sat = rows.find((r) => r.source === "satellite")!;
    expect(sat.count).toBe(94763);
    expect(sat.label).toBe("Satellite estimate (GlobalBuildingAtlas)");
    expect(sat.pct).toBeCloseTo((94763 / 107135) * 100, 6);
    expect(rows.every((r) => /^#[0-9a-f]{6}$/i.test(r.color))).toBe(true);
  });

  it("gives 0% everywhere when there are no buildings", () => {
    const empty = {
      ...manifest,
      stats: { ...manifest.stats, height_sources: { mapped: 0, floors: 0, satellite: 0, area: 0, default: 0 } },
    };
    expect(heightSourceBreakdown(empty).every((r) => r.pct === 0)).toBe(true);
  });
});

describe("formatters", () => {
  it("formats the clock and wraps near midnight", () => {
    expect(formatClock(16.9)).toBe("16:54");
    expect(formatClock(6.75)).toBe("06:45");
    expect(formatClock(23.999)).toBe("00:00");
  });

  it("formats lat/lon to 4 decimals with hemispheres", () => {
    expect(formatLatLon(18.5195, 73.8553)).toBe("18.5195° N 73.8553° E");
    expect(formatLatLon(-1.5, -0.25)).toBe("1.5000° S 0.2500° W");
  });
});

describe("CityCard", () => {
  it("shows the building count from the manifest in Indian grouping", () => {
    const html = render(<CityCard />).innerHTML;
    expect(html).toContain("PUNE");
    expect(html).toContain("पुणे");
    expect(html).toContain("1,07,135");
  });
});

describe("BottomBar", () => {
  it("renders a chip per preset and clicking requests a fly-to", () => {
    const host = render(<BottomBar />);
    const chips = host.querySelectorAll('[data-testid="preset-chip"]');
    expect(chips).toHaveLength(3);
    click(chips[1]);
    expect(useSceneStore.getState().flyTo?.label).toBe("Pune Station");
  });

  it("time preset buttons set timeOfDay and update the readout", () => {
    const host = render(<BottomBar />);
    const night = TIME_PRESETS.find((t) => t.id === "night")!;
    click(host.querySelector('[data-testid="time-preset-night"]'));
    expect(useSceneStore.getState().timeOfDay).toBe(night.hour);
    expect(host.querySelector('[data-testid="time-readout"]')?.textContent).toBe("20:30 IST");
  });
});

describe("PlaceReadout", () => {
  it("shows place, coordinates, eye height and fps", () => {
    useSceneStore.setState({ readout: { place: "Navi Peth", lat: 18.5195, lon: 73.8553, eye: 812.4 }, fps: 58.2 });
    const text = render(<PlaceReadout />).textContent;
    expect(text).toContain("Navi Peth");
    expect(text).toContain("18.5195° N 73.8553° E · eye 812 m");
    expect(text).toContain("58 fps");
  });
});

describe("SceneAbout", () => {
  it("shows a stacked bar and legend rows whose percents sum to ~100", () => {
    useSceneStore.setState({ aboutOpen: true });
    const host = render(<SceneAbout />);
    const pcts = [...host.querySelectorAll('[data-testid="height-row-pct"]')].map((el) =>
      parseFloat(el.textContent ?? "0"),
    );
    expect(pcts).toHaveLength(5);
    expect(Math.abs(pcts.reduce((a, b) => a + b, 0) - 100)).toBeLessThan(0.3);
    const text = host.textContent ?? "";
    for (const label of Object.values(manifest.stats.height_source_labels)) expect(text).toContain(label);
    expect(host.querySelectorAll('[data-testid^="height-bar-"]')).toHaveLength(5);
    expect(text).toContain("8.3 m");
    expect(text).toContain("Baked 2026-11-11T20:51:36");
    expect(text).not.toContain("Calibrated against");
  });

  it("shows the calibration line when present and closes on backdrop click", () => {
    useSceneStore.setState({
      aboutOpen: true,
      manifest: {
        ...manifest,
        stats: { ...manifest.stats, height_calibration: { a: 1.1, b: 0.5, n: 420, mae_raw_m: 6.2, mae_cal_m: 4.1 } },
      },
    });
    const host = render(<SceneAbout />);
    expect(host.textContent).toContain("Calibrated against 420 OSM-tagged buildings: error 6.2 m → 4.1 m (held-out)");
    click(host.querySelector('[data-testid="scene-about"]'));
    expect(useSceneStore.getState().aboutOpen).toBe(true);
    click(host.querySelector('[data-testid="scene-about-backdrop"]'));
    expect(useSceneStore.getState().aboutOpen).toBe(false);
  });
});

describe("SceneTooltip", () => {
  it("marks satellite heights as estimates", () => {
    useSceneStore.setState({
      hover: { info: { name: null, kind: "Apartments", height: 31.6, source: "satellite", floors: 10 }, x: 100, y: 50 },
    });
    const host = render(<SceneTooltip />);
    const tip = host.querySelector<HTMLElement>('[data-testid="scene-tooltip"]')!;
    expect(tip.textContent).toContain("Apartments");
    expect(tip.textContent).toContain("32 m · ~10 floors");
    expect(tip.textContent).toContain("Height: Satellite estimate (GlobalBuildingAtlas) (estimate)");
    expect(tip.style.left).toBe("114px");
    expect(tip.style.top).toBe("64px");
  });

  it("does not mark mapped heights as estimates", () => {
    useSceneStore.setState({
      hover: { info: { name: "JW Marriott", kind: "Commercial", height: 72, source: "mapped", floors: 24 }, x: 0, y: 0 },
    });
    const text = render(<SceneTooltip />).textContent ?? "";
    expect(text).toContain("JW Marriott");
    expect(text).toContain("Height: Mapped height");
    expect(text).not.toContain("(estimate)");
  });
});

describe("LoadingScreen", () => {
  it("lists stages with a progress bar", () => {
    useSceneStore.setState({
      ready: false,
      loadStages: [
        { id: "manifest", label: "Reading the city plan", done: true },
        { id: "chunks", label: "Placing buildings", done: false },
      ],
    });
    const host = render(<LoadingScreen />);
    expect(host.textContent).toContain("Placing buildings");
    expect(host.querySelector<HTMLElement>('[data-testid="load-progress"]')!.style.width).toBe("50%");
  });

  it("shows the error and a button to open the 2D map", () => {
    useSceneStore.setState({ ready: false, loadError: "WebGL is not available" });
    const host = render(<LoadingScreen />);
    expect(host.querySelector('[data-testid="load-error"]')?.textContent).toContain("WebGL is not available");
    click(host.querySelector('[data-testid="open-map-instead"]'));
    expect(useSceneStore.getState().view).toBe("map");
  });

  it("stops blocking the scene once ready", () => {
    useSceneStore.setState({ ready: false });
    const host = render(<LoadingScreen />);
    act(() => useSceneStore.setState({ ready: true }));
    expect(host.querySelector('[data-testid="loading-screen"]')?.className).toContain("pointer-events-none");
  });
});
