import { create } from "zustand";
import {
  emptyLiveSnapshot,
  PUNE_SCENE_BBOX,
  type LiveLayerId,
  type LiveLocationContext,
  type LiveSnapshot,
} from "./types";
import { fetchLiveSnapshot } from "./client";
import type { TrafficDensityMode } from "@/scene/engine/traffic";

interface LiveCityStore {
  liveMode: boolean;
  activeLayer: LiveLayerId;
  panelOpen: boolean;
  location: LiveLocationContext | null;
  snapshot: LiveSnapshot;
  lastFetchError: string | null;
  fetching: boolean;
  /** Visual FX driven by live weather. */
  weatherFxEnabled: boolean;
  /**
   * When live precip is ~0, still show light rain particles as SIMULATED preview
   * so the twin is visibly “alive”. Real rain from Open-Meteo always wins.
   */
  previewRain: boolean;
  /** Show simulated OSM vehicles. */
  trafficVisible: boolean;
  simSpeed: number;
  trafficDensity: TrafficDensityMode;
  trafficPaused: boolean;
  setLiveMode: (on: boolean) => void;
  toggleLiveMode: () => void;
  setActiveLayer: (id: LiveLayerId) => void;
  setPanelOpen: (open: boolean) => void;
  setLocation: (loc: LiveLocationContext | null) => void;
  refresh: () => Promise<void>;
  setWeatherFxEnabled: (on: boolean) => void;
  setPreviewRain: (on: boolean) => void;
  setTrafficVisible: (on: boolean) => void;
  setSimSpeed: (s: number) => void;
  setTrafficDensity: (m: TrafficDensityMode) => void;
  setTrafficPaused: (on: boolean) => void;
}

export const useLiveCityStore = create<LiveCityStore>((set, get) => ({
  /** On by default: weather FX + Live UI + Open-Meteo fetch. */
  liveMode: true,
  activeLayer: "overview",
  panelOpen: true,
  location: null,
  snapshot: emptyLiveSnapshot(PUNE_SCENE_BBOX),
  lastFetchError: null,
  fetching: false,
  weatherFxEnabled: true,
  /** Off by default — rain particles only when Open-Meteo reports precip / rain codes. */
  previewRain: false,
  trafficVisible: true,
  simSpeed: 1,
  trafficDensity: "heavy",
  trafficPaused: false,

  setLiveMode: (liveMode) => {
    set({ liveMode, panelOpen: liveMode ? get().panelOpen || true : false });
    if (liveMode) void get().refresh();
  },
  toggleLiveMode: () => {
    get().setLiveMode(!get().liveMode);
  },
  setActiveLayer: (activeLayer) => set({ activeLayer, panelOpen: true }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setLocation: (location) => set({ location, panelOpen: true }),

  refresh: async () => {
    if (get().fetching) return;
    set({ fetching: true, lastFetchError: null });
    try {
      const snap = await fetchLiveSnapshot(PUNE_SCENE_BBOX);
      set({ snapshot: snap, fetching: false });
    } catch (e) {
      set({
        fetching: false,
        lastFetchError: String((e as Error)?.message ?? e).slice(0, 160),
        snapshot: emptyLiveSnapshot(PUNE_SCENE_BBOX),
      });
    }
  },

  setWeatherFxEnabled: (weatherFxEnabled) => set({ weatherFxEnabled }),
  setPreviewRain: (previewRain) => set({ previewRain }),
  setTrafficVisible: (trafficVisible) => set({ trafficVisible }),
  setSimSpeed: (simSpeed) => set({ simSpeed }),
  setTrafficDensity: (trafficDensity) => set({ trafficDensity }),
  setTrafficPaused: (trafficPaused) => set({ trafficPaused }),
}));
