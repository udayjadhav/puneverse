export type PlaceSource = "wards" | "gazetteer";

export type LayerStatus = "stub" | "sample" | "ready";

export interface LayerConfig {
  id: string;
  status: LayerStatus;
  label: string;
}

export interface HonestyCopy {
  day_night: string;
  heights: string;
  extent: string;
  search_limits: string;
  ship_hold: string;
  attribution: string;
  /** Q8 — mild pitch vs flat disclosure */
  camera?: string;
  terrain?: string;
  trees?: string;
  /** Live City overlays — real providers only */
  live_city?: string;
}

export interface TerrainConfig {
  /** Raster-DEM tile URL template. */
  tiles: string;
  encoding: "terrarium" | "mapbox";
  maxzoom: number;
  /** 1 = true scale. Anything else must be disclosed in the About panel. */
  exaggeration: number;
  attribution: string;
}

export interface BuildingsConfig {
  /** Vector-tile layer name inside buildings.pmtiles (tippecanoe -l). */
  source_layer: string;
  fill_minzoom: number;
  extrusion_minzoom: number;
  /** Bake-time coverage numbers (public/data/buildings.stats.json). */
  stats_url: string;
  /** [west, south, east, north] of the baked center area. */
  baked_bbox: [number, number, number, number];
}

export interface CityConfig {
  id: string;
  display_name: string;
  scope: string;
  cantonments: boolean | "in" | "out";
  label_language: string;
  place_sources: PlaceSource[];
  center: [number, number];
  default_zoom: number;
  /** 3D-mode pitch in degrees. Flat mode = 0. */
  default_pitch?: number;
  max_pitch?: number;
  /** [west, south, east, north] — placeholder bbox; see docs/GEOGRAPHIC_BOUNDARY.md */
  maxBounds: [number, number, number, number];
  tile_url_env: string;
  basemap: {
    light: string;
    dark: string;
  };
  basemap_fallback: string;
  layers: Record<string, LayerConfig>;
  honesty: HonestyCopy;
  attribution: {
    osm: string;
    osm_url: string;
  };
  /** Real-building rendering settings (Phase 3). */
  buildings?: BuildingsConfig;
  /** Optional PMTiles paths when layer status is ready (local bake). */
  tiles?: {
    buildings?: string;
    roads?: string;
    /** Water, green, rail, stations, places, trees (one archive, several layers). */
    context?: string;
  };
  terrain?: TerrainConfig;
}

export interface PlaceRecord {
  id: string;
  name: string;
  kind: string;
  source: PlaceSource | string;
  center: [number, number];
}

export interface PlacesIndex {
  fixture: boolean;
  version: number;
  city_id: string;
  note: string;
  places: PlaceRecord[];
}
