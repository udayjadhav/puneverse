import type { Map as MapLibreMap, SkySpecification } from "maplibre-gl";
import { getDefaultCityConfig } from "@/config/loadCityConfig";
import type { ThemeMode } from "@/store/mapStore";
import { beforeIdFor } from "./contextLayers";
import { overlayVisibility } from "./overlays";

const city = getDefaultCityConfig();

export const TERRAIN_SOURCE_ID = "pv-terrain-dem";
/** Hillshade gets its own DEM source (MapLibre advice: do not share with terrain). */
export const HILLSHADE_SOURCE_ID = "pv-terrain-hillshade-dem";
export const HILLSHADE_LAYER_ID = "pv-terrain-hillshade";

export const TERRAIN_EXAGGERATION = city.terrain?.exaggeration ?? 1;

export function skyFor(theme: ThemeMode): SkySpecification {
  return theme === "night"
    ? {
        "sky-color": "#0b1220",
        "horizon-color": "#1e293b",
        "fog-color": "#0f172a",
        "sky-horizon-blend": 0.6,
        "horizon-fog-blend": 0.6,
        "fog-ground-blend": 0.4,
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 16, 0.2],
      }
    : {
        "sky-color": "#9cc9ec",
        "horizon-color": "#e9eef2",
        "fog-color": "#eef1f3",
        "sky-horizon-blend": 0.5,
        "horizon-fog-blend": 0.5,
        "fog-ground-blend": 0.35,
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 16, 0.3],
      };
}

function demSource() {
  const t = city.terrain!;
  return {
    type: "raster-dem" as const,
    tiles: [t.tiles],
    encoding: t.encoding,
    tileSize: 256,
    maxzoom: t.maxzoom,
    attribution: t.attribution,
  };
}

/**
 * Real terrain (raster-dem + setTerrain), hillshade and sky. Idempotent; call after
 * every `style.load` because setStyle drops terrain, sky and custom sources.
 */
export function ensureTerrain(map: MapLibreMap, enabled: boolean, theme: ThemeMode): void {
  if (!city.terrain) return;
  if (!map.getSource(TERRAIN_SOURCE_ID)) map.addSource(TERRAIN_SOURCE_ID, demSource());
  if (!map.getSource(HILLSHADE_SOURCE_ID)) map.addSource(HILLSHADE_SOURCE_ID, demSource());
  if (!map.getLayer(HILLSHADE_LAYER_ID)) {
    map.addLayer(
      {
        id: HILLSHADE_LAYER_ID,
        type: "hillshade",
        source: HILLSHADE_SOURCE_ID,
        layout: { visibility: overlayVisibility(enabled) },
        paint: {
          "hillshade-exaggeration": 0.35,
          "hillshade-shadow-color": theme === "night" ? "#000000" : "#5b5346",
          "hillshade-highlight-color": theme === "night" ? "#334155" : "#ffffff",
          "hillshade-accent-color": theme === "night" ? "#0b1220" : "#6b6253",
        },
      },
      beforeIdFor(map, HILLSHADE_LAYER_ID),
    );
  }
  syncTerrain(map, enabled);
  map.setSky?.(skyFor(theme));
}

export function syncTerrain(map: MapLibreMap, enabled: boolean): void {
  if (!city.terrain || !map.getSource(TERRAIN_SOURCE_ID)) return;
  if (map.getLayer(HILLSHADE_LAYER_ID)) {
    map.setLayoutProperty(HILLSHADE_LAYER_ID, "visibility", overlayVisibility(enabled));
  }
  const current = map.getTerrain?.();
  if (enabled && !current) {
    map.setTerrain?.({ source: TERRAIN_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION });
  } else if (!enabled && current) {
    map.setTerrain?.(null);
  }
}
