import { beforeEach, describe, expect, it } from "vitest";
import { useMapStore, type LayerId } from "./mapStore";
import { DEFAULT_VIEW_MODE, MAX_PITCH, PITCH_3D, pitchForMode } from "@/map/camera";
import { buildingInfoFromProps } from "@/map/buildingInfo";
import { getDefaultCityConfig } from "@/config/loadCityConfig";

const LAYER_IDS: LayerId[] = [
  "buildings",
  "roads",
  "water",
  "parks",
  "admin",
];

describe("useMapStore layer toggles", () => {
  beforeEach(() => {
    const city = getDefaultCityConfig();
    const layersEnabled = {
      buildings: false,
      roads: false,
      water: false,
      parks: false,
      admin: false,
    } as Record<LayerId, boolean>;
    for (const id of LAYER_IDS) {
      const status = city.layers[id]?.status;
      layersEnabled[id] = status === "sample" || status === "ready";
    }
    useMapStore.setState({ layersEnabled, flyToTarget: null });
  });

  it("starts with SAMPLE/ready layers on and stub layers off", () => {
    const city = getDefaultCityConfig();
    const { layersEnabled } = useMapStore.getState();
    for (const id of LAYER_IDS) {
      const status = city.layers[id]?.status;
      const expectOn = status === "sample" || status === "ready";
      expect(layersEnabled[id], id).toBe(expectOn);
    }
  });

  it("roads are ready (real PMTiles) — no spoke SAMPLE; default on", () => {
    const city = getDefaultCityConfig();
    expect(city.layers.roads?.status).toBe("ready");
    expect(useMapStore.getState().layersEnabled.roads).toBe(true);
    expect(city.layers.roads?.label).not.toMatch(/SAMPLE/i);
  });

  it("toggleLayer flips a single layer without affecting others", () => {
    const { toggleLayer } = useMapStore.getState();

    toggleLayer("buildings");
    let state = useMapStore.getState().layersEnabled;
    expect(state.buildings).toBe(false);
    expect(state.admin).toBe(true);

    toggleLayer("buildings");
    state = useMapStore.getState().layersEnabled;
    expect(state.buildings).toBe(true);
  });

  it("toggleLayer can flip each layer key", () => {
    const { toggleLayer } = useMapStore.getState();

    for (const id of LAYER_IDS) {
      const before = useMapStore.getState().layersEnabled[id];
      toggleLayer(id);
      expect(useMapStore.getState().layersEnabled[id]).toBe(!before);
    }
  });

  it("defaults to 3D mode; toggle switches Flat (pitch 0) and back (3D pitch)", () => {
    useMapStore.setState({ viewMode: "3d" });
    expect(DEFAULT_VIEW_MODE).toBe("3d");
    expect(PITCH_3D).toBeGreaterThanOrEqual(55);
    expect(PITCH_3D).toBeLessThanOrEqual(60);
    expect(MAX_PITCH).toBeGreaterThanOrEqual(80);
    expect(MAX_PITCH).toBeLessThanOrEqual(85);

    useMapStore.getState().toggleViewMode();
    let s = useMapStore.getState();
    expect(s.viewMode).toBe("flat");
    expect(s.flyToTarget).toEqual({ pitch: 0, animate: "ease" });

    useMapStore.getState().toggleViewMode();
    s = useMapStore.getState();
    expect(s.viewMode).toBe("3d");
    expect(s.flyToTarget).toEqual({ pitch: PITCH_3D, animate: "ease" });
  });

  it("resetView returns to the city default for the current mode", () => {
    const city = getDefaultCityConfig();
    useMapStore.setState({ viewMode: "3d", selectedBuilding: null });
    useMapStore.getState().resetView();
    expect(useMapStore.getState().flyToTarget).toEqual({
      center: city.center,
      zoom: city.default_zoom,
      pitch: PITCH_3D,
      bearing: 0,
      animate: "fly",
    });

    useMapStore.getState().setViewMode("flat");
    useMapStore.getState().resetView();
    expect(useMapStore.getState().viewMode).toBe("flat");
    expect(useMapStore.getState().flyToTarget?.pitch).toBe(0);
    expect(pitchForMode("flat")).toBe(0);
  });

  it("turning the Buildings layer off clears the selected building", () => {
    useMapStore.getState().selectBuilding(buildingInfoFromProps({ height_source: "unknown" }, 1));
    useMapStore.getState().toggleLayer("roads");
    expect(useMapStore.getState().selectedBuilding).not.toBeNull();
    useMapStore.getState().toggleLayer("buildings");
    expect(useMapStore.getState().layersEnabled.buildings).toBe(false);
    expect(useMapStore.getState().selectedBuilding).toBeNull();
    useMapStore.getState().toggleLayer("buildings");
    useMapStore.getState().toggleLayer("roads");
  });

  it("resetView clears the selected building", () => {
    useMapStore.getState().selectBuilding(buildingInfoFromProps({ height_source: "unknown" }, 1));
    expect(useMapStore.getState().selectedBuilding).not.toBeNull();
    useMapStore.getState().resetView();
    expect(useMapStore.getState().selectedBuilding).toBeNull();
  });

  it("setTilesBanner stores honesty message", () => {
    useMapStore.getState().setTilesBanner("Tiles missing — run pipeline bake");
    expect(useMapStore.getState().tilesBanner).toBe(
      "Tiles missing — run pipeline bake",
    );
    useMapStore.getState().setTilesBanner(null);
    expect(useMapStore.getState().tilesBanner).toBeNull();
  });
});
