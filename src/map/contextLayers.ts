import type {
  ExpressionSpecification,
  LayerSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import type { LayerId, ThemeMode } from "@/store/mapStore";
import { BUILDINGS_SOURCE_LAYER } from "./buildingsLayers";
import { overlayVisibility } from "./overlays";
import { CONTEXT_SOURCE_ID, labelLayerStartId, readySourceId } from "./sources";

/**
 * Bottom-to-top order of every PuneVerse layer. Ground layers go below the
 * basemap's label block; our own label layers go on top of everything.
 */
export const LAYER_ORDER = [
  "pv-terrain-hillshade",
  "pv-ready-parks-fill",
  "pv-ready-water-fill",
  "pv-ready-water-line",
  "pv-ready-roads-casing",
  "pv-ready-roads-line",
  "pv-ready-transit-rail",
  "pv-ready-transit-metro",
  "pv-ready-roads-bridge-casing",
  "pv-ready-roads-bridge",
  "pv-ready-transit-bridge",
  "pv-ready-buildings-fill",
  "pv-ready-buildings-extrusion",
  "pv-trees-3d",
  "pv-trees-dot",
  "pv-ready-transit-station-dot",
  "pv-ready-water-label",
  "pv-ready-roads-label",
  "pv-ready-transit-station",
  "pv-ready-buildings-label",
  "pv-ready-place-label",
] as const;

const FIRST_LABEL = LAYER_ORDER.indexOf("pv-ready-transit-station-dot");

/** Next existing PuneVerse layer above `id`; else the basemap label block (or top for labels). */
export function beforeIdFor(map: MapLibreMap, id: string): string | undefined {
  const i = (LAYER_ORDER as readonly string[]).indexOf(id);
  for (let j = i + 1; j < LAYER_ORDER.length; j++) {
    if (map.getLayer(LAYER_ORDER[j])) return LAYER_ORDER[j];
  }
  return i >= FIRST_LABEL ? undefined : labelLayerStartId(map);
}

/** Add a layer once (idempotent across `style.load`), else just re-sync visibility. */
export function ensureLayer(
  map: MapLibreMap,
  spec: LayerSpecification,
  visible: boolean,
): void {
  const vis = overlayVisibility(visible);
  if (map.getLayer(spec.id)) {
    map.setLayoutProperty(spec.id, "visibility", vis);
    return;
  }
  const layout = { ...("layout" in spec ? spec.layout : {}), visibility: vis };
  map.addLayer({ ...spec, layout } as LayerSpecification, beforeIdFor(map, spec.id));
}

export function setVisible(map: MapLibreMap, ids: readonly string[], visible: boolean): void {
  for (const id of ids) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", overlayVisibility(visible));
  }
}

interface Colors {
  water: string;
  waterLine: string;
  green: string;
  wood: string;
  road: string;
  roadMajor: string;
  casing: string;
  rail: string;
  metro: string;
  label: string;
  halo: string;
}

export const COLORS: Record<ThemeMode, Colors> = {
  day: {
    water: "#8cc4e0",
    waterLine: "#6aaed3",
    green: "#bcdba5",
    wood: "#9cc98a",
    road: "#ffffff",
    roadMajor: "#fde7b0",
    casing: "#c9c2b6",
    rail: "#7c7c86",
    metro: "#7c3aed",
    label: "#2f3541",
    halo: "#ffffff",
  },
  night: {
    water: "#1d3b55",
    waterLine: "#2b5577",
    green: "#22392c",
    wood: "#1f3a27",
    road: "#4a5263",
    roadMajor: "#77684a",
    casing: "#262b36",
    rail: "#8d93a3",
    metro: "#a78bfa",
    label: "#e2e8f0",
    halo: "#0f172a",
  },
};

const MAJOR = ["motorway", "trunk", "primary", "secondary", "motorway_link", "trunk_link", "primary_link"];
const MINOR = ["tertiary", "secondary_link", "tertiary_link", "unclassified", "residential", "living_street"];
const PATHS = ["footway", "path", "pedestrian", "steps", "cycleway", "track", "bridleway", "corridor"];

/**
 * Road width by OSM class, scaled with zoom; `extra` widens casings. `zoom` must
 * stay the top-level interpolate input, so the extra is added inside each stop.
 */
export function roadWidth(extra = 0): ExpressionSpecification {
  return [
    "interpolate",
    ["exponential", 1.6],
    ["zoom"],
    12,
    ["match", ["get", "highway"], MAJOR, 1.6 + extra / 3, MINOR, 0.8 + extra / 3, PATHS, 0.3, 0.5 + extra / 3],
    17,
    ["match", ["get", "highway"], MAJOR, 16 + extra, MINOR, 9 + extra, PATHS, 2, 5 + extra],
  ];
}

export const ROAD_WIDTH = roadWidth();

const IS_BRIDGE: ExpressionSpecification = ["match", ["get", "bridge"], ["yes", "viaduct"], true, false];
const IS_TUNNEL: ExpressionSpecification = ["match", ["get", "tunnel"], ["yes", "culvert"], true, false];

function roadColor(c: Colors): ExpressionSpecification {
  return ["match", ["get", "highway"], MAJOR, c.roadMajor, c.road];
}

export function roadLayers(theme: ThemeMode): LayerSpecification[] {
  const c = COLORS[theme];
  const src = readySourceId("roads");
  const base = { source: src, "source-layer": "roads" } as const;
  const lineLayout = { "line-cap": "round", "line-join": "round" } as const;
  return [
    {
      id: "pv-ready-roads-casing",
      type: "line",
      ...base,
      filter: ["all", ["!", IS_BRIDGE], ["!", IS_TUNNEL], ["!", ["match", ["get", "highway"], PATHS, true, false]]],
      layout: lineLayout,
      paint: { "line-color": c.casing, "line-width": roadWidth(1.5) },
    },
    {
      id: "pv-ready-roads-line",
      type: "line",
      ...base,
      filter: ["!", IS_BRIDGE],
      layout: lineLayout,
      paint: {
        "line-color": roadColor(c),
        "line-width": ROAD_WIDTH,
        "line-opacity": ["case", IS_TUNNEL, 0.45, 1],
      },
    },
    {
      id: "pv-ready-roads-bridge-casing",
      type: "line",
      ...base,
      filter: IS_BRIDGE,
      layout: lineLayout,
      paint: { "line-color": theme === "day" ? "#6b6457" : "#05070c", "line-width": roadWidth(3) },
    },
    {
      id: "pv-ready-roads-bridge",
      type: "line",
      ...base,
      filter: IS_BRIDGE,
      layout: lineLayout,
      paint: { "line-color": roadColor(c), "line-width": ROAD_WIDTH },
    },
  ];
}

export function waterLayers(theme: ThemeMode): LayerSpecification[] {
  const c = COLORS[theme];
  return [
    {
      id: "pv-ready-water-fill",
      type: "fill",
      source: CONTEXT_SOURCE_ID,
      "source-layer": "water",
      filter: ["!=", ["get", "kind"], "wastewater"],
      paint: { "fill-color": c.water, "fill-opacity": 0.95 },
    },
    {
      id: "pv-ready-water-line",
      type: "line",
      source: CONTEXT_SOURCE_ID,
      "source-layer": "waterway",
      layout: { "line-cap": "round" },
      paint: {
        "line-color": c.waterLine,
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          12, ["match", ["get", "kind"], "river", 2, "canal", 1.2, 0.6],
          17, ["match", ["get", "kind"], "river", 6, "canal", 4, 2],
        ],
      },
    },
  ];
}

export function parkLayers(theme: ThemeMode): LayerSpecification[] {
  const c = COLORS[theme];
  return [
    {
      id: "pv-ready-parks-fill",
      type: "fill",
      source: CONTEXT_SOURCE_ID,
      "source-layer": "green",
      paint: {
        "fill-color": ["match", ["get", "kind"], ["wood", "forest", "scrub", "nature_reserve"], c.wood, c.green],
        "fill-opacity": 0.85,
      },
    },
  ];
}

const IS_METRO: ExpressionSpecification = ["match", ["get", "kind"], ["subway", "light_rail"], true, false];

export function transitLayers(theme: ThemeMode): LayerSpecification[] {
  const c = COLORS[theme];
  const base = { source: CONTEXT_SOURCE_ID, "source-layer": "rail" } as const;
  return [
    {
      id: "pv-ready-transit-rail",
      type: "line",
      ...base,
      filter: ["all", ["!", IS_METRO], ["!", IS_BRIDGE]],
      paint: {
        "line-color": c.rail,
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1, 17, 3],
        "line-dasharray": [3, 2],
      },
    },
    {
      id: "pv-ready-transit-metro",
      type: "line",
      ...base,
      filter: ["all", IS_METRO, ["!", IS_BRIDGE]],
      layout: { "line-cap": "round" },
      paint: { "line-color": c.metro, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1.5, 17, 5] },
    },
    {
      id: "pv-ready-transit-bridge",
      type: "line",
      ...base,
      filter: IS_BRIDGE,
      layout: { "line-cap": "round" },
      paint: {
        "line-color": ["case", IS_METRO, c.metro, c.rail],
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 2, 17, 7],
      },
    },
  ];
}

export function stationLayers(theme: ThemeMode): LayerSpecification[] {
  const c = COLORS[theme];
  const metro: ExpressionSpecification = ["==", ["get", "kind"], "metro"];
  return [{
    id: "pv-ready-transit-station-dot",
    type: "circle",
    source: CONTEXT_SOURCE_ID,
    "source-layer": "station",
    minzoom: 12,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3, 17, 6],
      "circle-color": "#ffffff",
      "circle-stroke-color": ["case", metro, c.metro, c.rail],
      "circle-stroke-width": 2.5,
    },
  }, {
    id: "pv-ready-transit-station",
    type: "symbol",
    source: CONTEXT_SOURCE_ID,
    "source-layer": "station",
    minzoom: 13,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 11.5,
      "text-font": ["Noto Sans Regular"],
      "text-anchor": "top",
      "text-offset": [0, 0.4],
    },
    paint: {
      "text-color": ["case", metro, c.metro, c.label],
      "text-halo-color": c.halo,
      "text-halo-width": 1.4,
    },
  }];
}

export function labelLayers(theme: ThemeMode): LayerSpecification[] {
  const c = COLORS[theme];
  const text = {
    "text-color": c.label,
    "text-halo-color": c.halo,
    "text-halo-width": 1.4,
  } as const;
  return [
    {
      id: "pv-ready-water-label",
      type: "symbol",
      source: CONTEXT_SOURCE_ID,
      "source-layer": "waterway",
      minzoom: 13,
      filter: ["all", ["has", "name"], ["match", ["get", "kind"], ["river", "canal"], true, false]],
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-size": 12,
        "text-font": ["Noto Sans Italic"],
        "text-letter-spacing": 0.1,
      },
      paint: { ...text, "text-color": theme === "day" ? "#2a6a99" : "#8cc4e0" },
    },
    {
      id: "pv-ready-roads-label",
      type: "symbol",
      source: readySourceId("roads"),
      "source-layer": "roads",
      minzoom: 14.5,
      filter: ["has", "name"],
      layout: {
        "symbol-placement": "line",
        "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
        "text-size": ["interpolate", ["linear"], ["zoom"], 14.5, 10, 18, 13],
        "text-font": ["Noto Sans Regular"],
      },
      paint: text,
    },
    {
      id: "pv-ready-buildings-label",
      type: "symbol",
      source: readySourceId("buildings"),
      "source-layer": BUILDINGS_SOURCE_LAYER,
      minzoom: 15.5,
      filter: ["has", "name"],
      layout: {
        "text-field": ["get", "name"],
        "text-size": 11,
        "text-font": ["Noto Sans Regular"],
        "text-max-width": 8,
        "symbol-placement": "point",
      },
      paint: { ...text, "text-color": theme === "day" ? "#5b4636" : "#fde68a" },
    },
    {
      id: "pv-ready-place-label",
      type: "symbol",
      source: CONTEXT_SOURCE_ID,
      "source-layer": "place",
      minzoom: 11,
      layout: {
        "text-field": ["get", "name"],
        "text-size": ["match", ["get", "kind"], "suburb", 14, 12],
        "text-font": ["Noto Sans Bold"],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.12,
        "text-max-width": 9,
      },
      paint: { ...text, "text-halo-width": 2 },
    },
  ];
}

/** Layer ids each panel toggle controls. */
export const TOGGLE_LAYERS: Partial<Record<LayerId, readonly string[]>> = {
  roads: ["pv-ready-roads-casing", "pv-ready-roads-line", "pv-ready-roads-bridge-casing", "pv-ready-roads-bridge"],
  water: ["pv-ready-water-fill", "pv-ready-water-line"],
  parks: ["pv-ready-parks-fill"],
  transit: [
    "pv-ready-transit-rail",
    "pv-ready-transit-metro",
    "pv-ready-transit-bridge",
    "pv-ready-transit-station-dot",
    "pv-ready-transit-station",
  ],
  labels: ["pv-ready-water-label", "pv-ready-roads-label", "pv-ready-buildings-label", "pv-ready-place-label"],
};

export function layersFor(id: LayerId, theme: ThemeMode): LayerSpecification[] {
  if (id === "roads") return roadLayers(theme);
  if (id === "water") return waterLayers(theme);
  if (id === "parks") return parkLayers(theme);
  if (id === "transit") return [...transitLayers(theme), ...stationLayers(theme)];
  if (id === "labels") return labelLayers(theme);
  return [];
}

/** Attach (or re-sync) every style layer behind one panel toggle. */
export function ensureToggleLayers(
  map: MapLibreMap,
  id: LayerId,
  theme: ThemeMode,
  visible: boolean,
): void {
  for (const spec of layersFor(id, theme)) {
    if ("source" in spec && typeof spec.source === "string" && !map.getSource(spec.source)) continue;
    ensureLayer(map, spec, visible);
  }
}
