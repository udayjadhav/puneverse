import { getDefaultCityConfig } from "@/config/loadCityConfig";

export type ViewMode = "3d" | "flat";

const city = getDefaultCityConfig();

export const DEFAULT_VIEW_MODE: ViewMode = "3d";

/** 3D-mode pitch (degrees) from city config. */
export const PITCH_3D: number =
  typeof city.default_pitch === "number" ? city.default_pitch : 58;

export const MAX_PITCH: number =
  typeof city.max_pitch === "number" ? city.max_pitch : 85;

export function pitchForMode(mode: ViewMode): number {
  return mode === "3d" ? PITCH_3D : 0;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true
  );
}

/** Camera animation length; 0 (jump) when the user prefers reduced motion. */
export function cameraDurationMs(base = 800): number {
  return prefersReducedMotion() ? 0 : base;
}

export interface CameraTarget {
  /** Omitted → keep the current center (mode switch). */
  center?: [number, number];
  zoom?: number;
  pitch?: number;
  bearing?: number;
  /** "fly" for search / reset (long hops); "ease" for in-place mode switches. */
  animate?: "fly" | "ease";
}

export function resetCamera(mode: ViewMode): CameraTarget {
  return {
    center: city.center,
    zoom: city.default_zoom,
    pitch: pitchForMode(mode),
    bearing: 0,
    animate: "fly",
  };
}

export function modeSwitchCamera(mode: ViewMode): CameraTarget {
  return { pitch: pitchForMode(mode), animate: "ease" };
}
