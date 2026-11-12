import { create } from "zustand";
import type { PickedBuilding, Preset, SceneManifest } from "@/scene/types";

export type DetailLevel = "low" | "medium" | "high" | "ultra";
export type ViewKind = "scene" | "map";

export interface LoadStage {
  id: string;
  label: string;
  done: boolean;
}

export interface Readout {
  place: string;
  lat: number;
  lon: number;
  eye: number;
}

interface SceneStore {
  view: ViewKind;
  manifest: SceneManifest | null;
  loadStages: LoadStage[];
  loadError: string | null;
  ready: boolean;
  /** Hours in IST, 0..24 (fractional). */
  timeOfDay: number;
  detail: DetailLevel;
  labels: boolean;
  aboutOpen: boolean;
  readout: Readout | null;
  hover: { info: PickedBuilding; x: number; y: number } | null;
  fps: number;
  /** Set by UI, consumed (and cleared) by the engine. */
  flyTo: Preset | null;
  setView: (v: ViewKind) => void;
  setManifest: (m: SceneManifest) => void;
  setStages: (s: LoadStage[]) => void;
  markStage: (id: string) => void;
  setLoadError: (e: string | null) => void;
  setReady: (r: boolean) => void;
  setTimeOfDay: (h: number) => void;
  setDetail: (d: DetailLevel) => void;
  toggleLabels: () => void;
  setAboutOpen: (o: boolean) => void;
  setReadout: (r: Readout) => void;
  setHover: (h: SceneStore["hover"]) => void;
  setFps: (f: number) => void;
  requestFlyTo: (p: Preset | null) => void;
}

export const TIME_PRESETS = [
  { id: "sunrise", label: "Sunrise", hour: 6.75 },
  { id: "midday", label: "Midday", hour: 12.5 },
  { id: "golden", label: "Golden hour", hour: 17.6 },
  { id: "night", label: "Night", hour: 20.5 },
] as const;

export const useSceneStore = create<SceneStore>((set) => ({
  view: "scene",
  manifest: null,
  loadStages: [],
  loadError: null,
  ready: false,
  timeOfDay: 16.9,
  detail: "high",
  labels: true,
  aboutOpen: false,
  readout: null,
  hover: null,
  fps: 0,
  flyTo: null,
  setView: (view) => set({ view }),
  setManifest: (manifest) => set({ manifest }),
  setStages: (loadStages) => set({ loadStages }),
  markStage: (id) =>
    set((s) => ({ loadStages: s.loadStages.map((st) => (st.id === id ? { ...st, done: true } : st)) })),
  setLoadError: (loadError) => set({ loadError }),
  setReady: (ready) => set({ ready }),
  setTimeOfDay: (h) => set({ timeOfDay: ((h % 24) + 24) % 24 }),
  setDetail: (detail) => set({ detail }),
  toggleLabels: () => set((s) => ({ labels: !s.labels })),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setReadout: (readout) => set({ readout }),
  setHover: (hover) => set({ hover }),
  setFps: (fps) => set({ fps }),
  requestFlyTo: (flyTo) => set({ flyTo }),
}));
