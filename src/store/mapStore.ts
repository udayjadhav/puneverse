import { create } from "zustand";
import { getDefaultCityConfig } from "@/config/loadCityConfig";
import type { PlaceRecord } from "@/config/types";
import {
  DEFAULT_VIEW_MODE,
  modeSwitchCamera,
  resetCamera,
  type CameraTarget,
  type ViewMode,
} from "@/map/camera";
import type { BuildingInfo } from "@/map/buildingInfo";
import type { BuildingStats } from "@/map/buildingStats";

export type ThemeMode = "day" | "night";

export type LayerId =
  | "buildings"
  | "roads"
  | "water"
  | "parks"
  | "transit"
  | "labels"
  | "terrain"
  | "trees"
  | "admin";

export const LAYER_IDS: readonly LayerId[] = [
  "buildings",
  "roads",
  "water",
  "parks",
  "transit",
  "labels",
  "terrain",
  "trees",
  "admin",
];

const city = getDefaultCityConfig();

/** Hover / click tooltip: what is under the pointer and where. */
export interface BuildingTooltipState {
  info: BuildingInfo;
  x: number;
  y: number;
  pinned: boolean;
}

function initialLayerVisibility(): Record<LayerId, boolean> {
  const vis = Object.fromEntries(LAYER_IDS.map((id) => [id, false])) as Record<
    LayerId,
    boolean
  >;
  for (const id of Object.keys(vis) as LayerId[]) {
    const status = city.layers[id]?.status;
    // SAMPLE / ready layers on by default; stubs stay off
    vis[id] = status === "sample" || status === "ready";
  }
  return vis;
}

interface MapStore {
  theme: ThemeMode;
  viewMode: ViewMode;
  layersEnabled: Record<LayerId, boolean>;
  aboutOpen: boolean;
  searchQuery: string;
  selectedPlace: PlaceRecord | null;
  selectedBuilding: BuildingInfo | null;
  tooltip: BuildingTooltipState | null;
  /** Advanced "Data" view: show the technical building panel on click. */
  dataView: boolean;
  /** Bake-time coverage; null until loaded, "unavailable" if the file is missing. */
  buildingStats: BuildingStats | "unavailable" | null;
  /** Visible honesty banner for missing/failed ready PMTiles or protocol. */
  tilesBanner: string | null;
  flyToTarget: CameraTarget | null;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  toggleLayer: (id: LayerId) => void;
  setAboutOpen: (open: boolean) => void;
  setSearchQuery: (q: string) => void;
  selectPlace: (place: PlaceRecord | null) => void;
  selectBuilding: (info: BuildingInfo | null) => void;
  setTooltip: (tooltip: BuildingTooltipState | null) => void;
  setDataView: (on: boolean) => void;
  setBuildingStats: (stats: BuildingStats | "unavailable" | null) => void;
  setTilesBanner: (msg: string | null) => void;
  requestFlyTo: (
    center: [number, number],
    zoom?: number,
    extras?: { pitch?: number; bearing?: number },
  ) => void;
  clearFlyTo: () => void;
  /** City center, default zoom, north-up, pitch of the current mode. */
  resetView: () => void;
}

export const useMapStore = create<MapStore>((set, get) => ({
  theme: "day",
  viewMode: DEFAULT_VIEW_MODE,
  layersEnabled: initialLayerVisibility(),
  aboutOpen: false,
  searchQuery: "",
  selectedPlace: null,
  selectedBuilding: null,
  tooltip: null,
  dataView: false,
  buildingStats: null,
  tilesBanner: null,
  flyToTarget: null,
  setTheme: (theme) => set({ theme }),
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === "day" ? "night" : "day" })),
  setViewMode: (mode) =>
    set({ viewMode: mode, flyToTarget: modeSwitchCamera(mode) }),
  toggleViewMode: () =>
    get().setViewMode(get().viewMode === "3d" ? "flat" : "3d"),
  toggleLayer: (id) =>
    set((s) => {
      const on = !s.layersEnabled[id];
      return {
        layersEnabled: { ...s.layersEnabled, [id]: on },
        // A hidden building cannot stay selected.
        ...(id === "buildings" && !on ? { selectedBuilding: null, tooltip: null } : {}),
      };
    }),
  setAboutOpen: (open) => set({ aboutOpen: open }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  selectPlace: (place) => set({ selectedPlace: place }),
  selectBuilding: (info) => set({ selectedBuilding: info }),
  setTooltip: (tooltip) => set({ tooltip }),
  setDataView: (on) => set({ dataView: on }),
  setBuildingStats: (stats) => set({ buildingStats: stats }),
  setTilesBanner: (msg) => set({ tilesBanner: msg }),
  requestFlyTo: (center, zoom, extras) =>
    set({
      flyToTarget: {
        center,
        zoom,
        pitch: extras?.pitch,
        bearing: extras?.bearing,
        animate: "fly",
      },
    }),
  clearFlyTo: () => set({ flyToTarget: null }),
  resetView: () =>
    set((s) => ({
      flyToTarget: resetCamera(s.viewMode),
      selectedPlace: null,
      selectedBuilding: null,
      tooltip: null,
      searchQuery: "",
    })),
}));
