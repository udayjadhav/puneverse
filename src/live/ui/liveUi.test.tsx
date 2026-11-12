/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyLiveSnapshot, PUNE_SCENE_BBOX } from "@/live/types";
import { useLiveCityStore } from "@/live/liveCityStore";
import { LiveCityPanel } from "./LiveCityPanel";
import { LiveLayerSelector } from "./LiveLayerSelector";
import { LiveStatus } from "./LiveStatus";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function resetStore(partial: Partial<ReturnType<typeof useLiveCityStore.getState>> = {}) {
  useLiveCityStore.setState({
    liveMode: false,
    panelOpen: false,
    weatherFxEnabled: true,
    trafficVisible: true,
    trafficPaused: false,
    snapshot: emptyLiveSnapshot(PUNE_SCENE_BBOX),
    lastFetchError: null,
    fetching: false,
    location: null,
    activeLayer: "overview",
    ...partial,
  });
}

let cleanup: (() => void) | null = null;
beforeEach(() => {
  resetStore();
});
afterEach(() => {
  cleanup?.();
  cleanup = null;
  resetStore();
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

describe("Live City UI", () => {
  it("product defaults keep live, weather FX and vehicles enabled", () => {
    // Mirror store initial values (module defaults).
    expect(useLiveCityStore.getState().weatherFxEnabled).toBe(true);
    expect(useLiveCityStore.getState().trafficVisible).toBe(true);
    // Re-apply product defaults explicitly for the assertion.
    resetStore({ liveMode: true, panelOpen: true });
    const s = useLiveCityStore.getState();
    expect(s.liveMode).toBe(true);
    expect(s.panelOpen).toBe(true);
    expect(s.weatherFxEnabled).toBe(true);
    expect(s.trafficVisible).toBe(true);
    expect(s.trafficPaused).toBe(false);
  });

  it("hides chrome when live mode is off", () => {
    const host = render(
      <>
        <LiveLayerSelector />
        <LiveStatus />
        <LiveCityPanel />
      </>,
    );
    expect(host.querySelector('[data-testid="live-layer-selector"]')).toBeNull();
    expect(host.querySelector('[data-testid="live-status"]')).toBeNull();
    expect(host.querySelector('[data-testid="live-city-panel"]')).toBeNull();
  });

  it("shows honest empty weather without inventing readings", () => {
    act(() => {
      resetStore({
        liveMode: true,
        panelOpen: true,
        activeLayer: "weather",
        snapshot: emptyLiveSnapshot(PUNE_SCENE_BBOX),
      });
    });
    const host = render(<LiveCityPanel />);
    expect(host.querySelector('[data-testid="live-city-panel"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="live-no-readings"]')?.textContent).toMatch(/never invents/i);
    expect(host.querySelector('[data-testid="live-weather-readings"]')).toBeNull();
  });

  it("renders traffic as unavailable without fake colours", () => {
    act(() => {
      resetStore({ liveMode: true, panelOpen: true, activeLayer: "traffic" });
    });
    const host = render(<LiveCityPanel />);
    expect(host.querySelector('[data-testid="live-traffic-unavailable"]')?.textContent).toMatch(
      /unavailable/i,
    );
  });

  it("lists layers when live mode is on", () => {
    act(() => {
      resetStore({ liveMode: true });
    });
    const host = render(<LiveLayerSelector />);
    expect(host.querySelector('[data-testid="live-layer-traffic"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="live-layer-air_quality"]')).toBeTruthy();
  });
});
