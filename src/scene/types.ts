/** Shapes of the baked scene assets in public/scene/s0/ (see pipeline/bake_scene.py). */

export type HeightSource = "mapped" | "floors" | "satellite" | "area" | "default";

export const HEIGHT_SOURCES: readonly HeightSource[] = [
  "mapped",
  "floors",
  "satellite",
  "area",
  "default",
];

export const KIND_NAMES = [
  "Residential",
  "Apartments",
  "Commercial",
  "Industrial",
  "Religious",
  "Civic",
  "Small structure",
  "Heritage",
] as const;

export interface ChunkInfo {
  ix: number;
  iy: number;
  buildings: number;
  trees: number;
  maxZ: number;
  bytes: number;
}

export interface LabelPoint {
  name: string;
  x: number;
  y: number;
  z: number;
}

export interface PlaceLabel extends LabelPoint {
  rank: number;
}

export interface LandmarkLabel extends LabelPoint {
  kind: string;
  wiki?: boolean;
}

export interface TowerLabel {
  x: number;
  y: number;
  z: number;
  h: number;
  name: string | null;
  src: HeightSource;
}

export interface Preset {
  label: string;
  x: number;
  y: number;
  z: number;
  kind: string;
}

export interface ValidationStats {
  n: number;
  mae_m?: number;
  bias_m?: number;
  median_abs_m?: number;
  within_3m_pct?: number;
}

export interface SceneManifest {
  version: number;
  name: string;
  crs: string;
  origin_lonlat: [number, number];
  origin_utm: [number, number];
  extent: { xmin: number; ymin: number; xmax: number; ymax: number };
  extent_lonlat: [number, number, number, number];
  chunk_size: number;
  chunks: ChunkInfo[];
  building_names: string[];
  stats: {
    buildings: number;
    height_sources: Record<HeightSource, number>;
    height_source_labels: Record<HeightSource, string>;
    height_validation_gba: Record<string, ValidationStats>;
    height_calibration?: { a: number; b: number; n: number; mae_raw_m: number; mae_cal_m: number };
    trees: number;
    road_segments: number;
    street_lights: number;
    rail_lines: number;
    water_triangles: number;
  };
  towers: TowerLabel[];
  places: PlaceLabel[];
  landmarks: LandmarkLabel[];
  stations: { name: string; x: number; y: number; metro: boolean }[];
  presets: Preset[];
  sources: Record<string, string>;
  baked_at: string;
}

/** What the pointer is over; shown in the minimal tooltip. */
export interface PickedBuilding {
  name: string | null;
  kind: string;
  height: number;
  source: HeightSource;
  floors: number;
}
