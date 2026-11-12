import type {
  ExpressionSpecification,
  FilterSpecification,
  LightSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import { getDefaultCityConfig } from "@/config/loadCityConfig";
import type { ThemeMode } from "@/store/mapStore";
import type { ViewMode } from "./camera";
import { overlayVisibility } from "./overlays";
import { labelLayerStartId, sourceLayerFor } from "./sources";

const city = getDefaultCityConfig();

export const BUILDINGS_SOURCE_ID = "pv-ready-buildings";
export const BUILDINGS_FILL_ID = "pv-ready-buildings-fill";
export const BUILDINGS_EXTRUSION_ID = "pv-ready-buildings-extrusion";
export const BUILDINGS_SOURCE_LAYER = sourceLayerFor("buildings");
export const BUILDINGS_FILL_MINZOOM = city.buildings?.fill_minzoom ?? 12;
export const BUILDINGS_EXTRUSION_MINZOOM = city.buildings?.extrusion_minzoom ?? 13;

/**
 * Height sources that carry a real height: OSM tag, Overture height (non-OSM
 * source), or a floors × floor-height estimate. Mirrors pipeline/conflate.py.
 */
export const KNOWN_HEIGHT_SOURCES = [
  "osm_explicit",
  "overture_height",
  "osm_levels_estimate",
  "overture_levels_estimate",
];

const IS_POLYGON: ExpressionSpecification = [
  "match",
  ["geometry-type"],
  ["Polygon", "MultiPolygon"],
  true,
  false,
];

const IS_BUILDING_PART: ExpressionSpecification = [
  "==",
  ["get", "is_building_part"],
  true,
];

/** True when the feature has a positive normalized height from OSM. */
export const HAS_KNOWN_HEIGHT: ExpressionSpecification = [
  "all",
  ["has", "normalized_height_m"],
  ["match", ["get", "height_source"], KNOWN_HEIGHT_SOURCES, true, false],
  [">", ["to-number", ["get", "normalized_height_m"], 0], 0],
];

/**
 * Raised in 3D: known height, unless the building's raised `building:part`s
 * carry the 3D shape (the outline prism would hide them).
 */
export const IS_EXTRUDED: ExpressionSpecification = [
  "all",
  HAS_KNOWN_HEIGHT,
  ["!", ["==", ["get", "has_extruded_parts"], true]],
];

/** fill-extrusion: polygons that are raised in 3D. */
export const EXTRUSION_FILTER: FilterSpecification = [
  "all",
  IS_POLYGON,
  IS_EXTRUDED,
];

/**
 * Flat footprints. Building parts are skipped (their outline building already
 * covers the footprint). In 3D mode the extruded buildings are left out so
 * nothing is drawn twice.
 */
export function flatFillFilter(mode: ViewMode): FilterSpecification {
  if (mode === "flat") {
    return ["all", IS_POLYGON, ["!", IS_BUILDING_PART]];
  }
  return ["all", IS_POLYGON, ["!", IS_BUILDING_PART], ["!", IS_EXTRUDED]];
}

export const EXTRUSION_HEIGHT: ExpressionSpecification = [
  "to-number",
  ["get", "normalized_height_m"],
  0,
];

/** Base never above the top (a base ≥ height would invert the prism). */
export const EXTRUSION_BASE: ExpressionSpecification = [
  "min",
  ["to-number", ["coalesce", ["get", "normalized_base_height_m"], 0], 0],
  EXTRUSION_HEIGHT,
];

const RESIDENTIAL = [
  "apartments",
  "residential",
  "house",
  "detached",
  "semidetached_house",
  "terrace",
  "dormitory",
  "bungalow",
];
const COMMERCIAL = [
  "commercial",
  "office",
  "retail",
  "hotel",
  "supermarket",
  "industrial",
  "warehouse",
];
const CIVIC = [
  "school",
  "college",
  "university",
  "hospital",
  "public",
  "government",
  "civic",
  "train_station",
  "transportation",
  "temple",
  "church",
  "mosque",
  "religious",
  "stadium",
  "grandstand",
];

/** [low, high] colours per building group; interpolated by height. */
interface Palette {
  residential: [string, string];
  commercial: [string, string];
  civic: [string, string];
  other: [string, string];
  selected: string;
  flatKnown: string;
  flatUnknown: string;
  flatOutline: string;
}

export const PALETTES: Record<ThemeMode, Palette> = {
  day: {
    residential: ["#ede6da", "#b8ab98"],
    commercial: ["#e4e8ee", "#97a5b6"],
    civic: ["#ebe5f0", "#a99cbc"],
    other: ["#e8e6e1", "#a4a19a"],
    selected: "#f59e0b",
    flatKnown: "#cfc8bc",
    flatUnknown: "#d0c4b0",
    flatOutline: "#9a8d78",
  },
  night: {
    residential: ["#5a6070", "#8c92a3"],
    commercial: ["#4c586c", "#8191ab"],
    civic: ["#5a5470", "#8d86a9"],
    other: ["#555a66", "#868b98"],
    selected: "#fbbf24",
    flatKnown: "#4f5668",
    flatUnknown: "#3d4454",
    flatOutline: "#5d6679",
  },
};

function byHeight([low, high]: [string, string]): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    EXTRUSION_HEIGHT,
    0,
    low,
    60,
    high,
  ];
}

const IS_SELECTED: ExpressionSpecification = [
  "boolean",
  ["feature-state", "selected"],
  false,
];

export function extrusionColor(theme: ThemeMode): ExpressionSpecification {
  const p = PALETTES[theme];
  return [
    "case",
    IS_SELECTED,
    p.selected,
    [
      "match",
      ["get", "building_type"],
      RESIDENTIAL,
      byHeight(p.residential),
      COMMERCIAL,
      byHeight(p.commercial),
      CIVIC,
      byHeight(p.civic),
      byHeight(p.other),
    ],
  ];
}

export function flatFillColor(theme: ThemeMode): ExpressionSpecification {
  const p = PALETTES[theme];
  return [
    "case",
    IS_SELECTED,
    p.selected,
    HAS_KNOWN_HEIGHT,
    p.flatKnown,
    p.flatUnknown,
  ];
}

export function buildingsLight(theme: ThemeMode): LightSpecification {
  return theme === "night"
    ? { anchor: "viewport", color: "#c7d2fe", intensity: 0.3, position: [1.2, 210, 40] }
    : { anchor: "viewport", color: "#ffffff", intensity: 0.4, position: [1.2, 210, 35] };
}

export interface BuildingsLayerState {
  enabled: boolean;
  mode: ViewMode;
  theme: ThemeMode;
}

export function fillVisibility(s: Pick<BuildingsLayerState, "enabled">) {
  return overlayVisibility(s.enabled);
}

export function extrusionVisibility(
  s: Pick<BuildingsLayerState, "enabled" | "mode">,
) {
  return overlayVisibility(s.enabled && s.mode === "3d");
}

/**
 * Add the flat-fill and fill-extrusion building layers below labels.
 * Idempotent: safe after every `style.load` (setStyle wipes custom layers);
 * existing layers are only re-synced.
 */
export function ensureBuildingLayers(
  map: MapLibreMap,
  sourceId: string,
  state: BuildingsLayerState,
): void {
  const beforeId = labelLayerStartId(map);

  if (!map.getLayer(BUILDINGS_FILL_ID)) {
    map.addLayer(
      {
        id: BUILDINGS_FILL_ID,
        type: "fill",
        source: sourceId,
        "source-layer": BUILDINGS_SOURCE_LAYER,
        minzoom: BUILDINGS_FILL_MINZOOM,
        layout: { visibility: fillVisibility(state) },
        filter: flatFillFilter(state.mode),
        paint: {
          "fill-color": flatFillColor(state.theme),
          "fill-opacity": 0.92,
          "fill-outline-color": PALETTES[state.theme].flatOutline,
        },
      },
      beforeId,
    );
  }

  if (!map.getLayer(BUILDINGS_EXTRUSION_ID)) {
    map.addLayer(
      {
        id: BUILDINGS_EXTRUSION_ID,
        type: "fill-extrusion",
        source: sourceId,
        "source-layer": BUILDINGS_SOURCE_LAYER,
        minzoom: BUILDINGS_EXTRUSION_MINZOOM,
        layout: { visibility: extrusionVisibility(state) },
        filter: EXTRUSION_FILTER,
        paint: {
          "fill-extrusion-color": extrusionColor(state.theme),
          "fill-extrusion-height": EXTRUSION_HEIGHT,
          "fill-extrusion-base": EXTRUSION_BASE,
          "fill-extrusion-opacity": 0.9,
          "fill-extrusion-vertical-gradient": true,
        },
      },
      beforeId,
    );
  }

  map.setLight(buildingsLight(state.theme));
  syncBuildingLayers(map, state);
}

/** Apply toggle + Flat/3D state to existing building layers (no-op if absent). */
export function syncBuildingLayers(
  map: MapLibreMap,
  state: Pick<BuildingsLayerState, "enabled" | "mode">,
): void {
  if (map.getLayer(BUILDINGS_FILL_ID)) {
    map.setLayoutProperty(BUILDINGS_FILL_ID, "visibility", fillVisibility(state));
    map.setFilter(BUILDINGS_FILL_ID, flatFillFilter(state.mode));
  }
  if (map.getLayer(BUILDINGS_EXTRUSION_ID)) {
    map.setLayoutProperty(
      BUILDINGS_EXTRUSION_ID,
      "visibility",
      extrusionVisibility(state),
    );
  }
}

/** Layers a click / hover can hit, in priority order (3D first). */
export function interactiveBuildingLayerIds(map: MapLibreMap): string[] {
  return [BUILDINGS_EXTRUSION_ID, BUILDINGS_FILL_ID].filter(
    (id) =>
      map.getLayer(id) &&
      map.getLayoutProperty(id, "visibility") !== "none",
  );
}
