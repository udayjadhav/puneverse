import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  type MapOptions,
} from "maplibre-gl";
import type { CityConfig } from "@/config/types";
import { MAX_PITCH, pitchForMode, type ViewMode } from "./camera";

/** Constructor options for the main map (pure; unit-tested). */
export function buildMapOptions(
  city: CityConfig,
  container: HTMLElement | string,
  styleUrl: string,
  mode: ViewMode,
): MapOptions {
  return {
    container,
    style: styleUrl,
    center: city.center,
    zoom: city.default_zoom,
    pitch: pitchForMode(mode),
    maxPitch: MAX_PITCH,
    maxBounds: city.maxBounds,
    attributionControl: {
      compact: true,
      customAttribution: `${city.attribution.osm} · PuneVerse (SHIP HOLD)`,
    },
  };
}

export function createMap(options: MapOptions): MapLibreMap {
  const map = new MapLibreMap(options);
  map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
  return map;
}
