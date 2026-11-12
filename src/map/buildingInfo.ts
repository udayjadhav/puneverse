export type HeightSource =
  | "osm_explicit"
  | "overture_height"
  | "osm_levels_estimate"
  | "overture_levels_estimate"
  | "unknown";
export type HeightConfidence = "high" | "medium" | "none";

/** What the building panel shows — read straight from tile properties. */
export interface BuildingInfo {
  featureId: number | null;
  sourceFeatureId: string | null;
  buildingType: string | null;
  isPart: boolean;
  name: string | null;
  heightM: number | null;
  baseHeightM: number | null;
  levels: number | null;
  floorHeightM: number | null;
  heightSource: HeightSource;
  confidence: HeightConfidence;
  sourceDataset: string | null;
  /** Who drew the footprint: OpenStreetMap, Google Open Buildings, Microsoft ML Buildings. */
  footprintDataset: string | null;
  heightRaw: string | null;
  levelsRaw: string | null;
  validationFlags: string[];
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

const SOURCES: readonly HeightSource[] = [
  "osm_explicit",
  "overture_height",
  "osm_levels_estimate",
  "overture_levels_estimate",
  "unknown",
];
const CONFIDENCES: readonly HeightConfidence[] = ["high", "medium", "none"];

export function buildingInfoFromProps(
  props: Record<string, unknown> | null | undefined,
  featureId?: number | string | null,
): BuildingInfo {
  const p = props ?? {};
  const source = SOURCES.includes(p.height_source as HeightSource)
    ? (p.height_source as HeightSource)
    : "unknown";
  const confidence = CONFIDENCES.includes(p.height_confidence as HeightConfidence)
    ? (p.height_confidence as HeightConfidence)
    : "none";
  const height = source === "unknown" ? null : num(p.normalized_height_m);
  const id = num(featureId);
  return {
    featureId: id,
    sourceFeatureId: str(p.source_feature_id) ?? str(p.source_id),
    buildingType: str(p.building_type),
    isPart: p.is_building_part === true,
    name: str(p.name),
    heightM: height !== null && height > 0 ? height : null,
    baseHeightM: num(p.normalized_base_height_m),
    levels: num(p.levels),
    floorHeightM: num(p.floor_height_m),
    heightSource: source,
    confidence,
    sourceDataset: str(p.source_dataset),
    footprintDataset: str(p.footprint_dataset),
    heightRaw: str(p.height_raw),
    levelsRaw: str(p.levels_raw),
    validationFlags: (str(p.validation_flags) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/** OSM browse URL for `w123` / `r456`; null for anything else. */
export function osmUrl(sourceFeatureId: string | null): string | null {
  if (!sourceFeatureId) return null;
  const m = /^([wr])(\d+)$/.exec(sourceFeatureId);
  if (!m) return null;
  const kind = m[1] === "w" ? "way" : "relation";
  return `https://www.openstreetmap.org/${kind}/${m[2]}`;
}

const SOURCE_LABEL: Record<HeightSource, string> = {
  osm_explicit: "OSM height tag",
  overture_height: "Overture Maps height",
  osm_levels_estimate: "Estimate from OSM floor count",
  overture_levels_estimate: "Estimate from Overture floor count",
  unknown: "Unknown",
};

const CONFIDENCE_LABEL: Record<HeightConfidence, string> = {
  high: "High — height as tagged in OpenStreetMap (volunteer data, not surveyed)",
  medium: "Medium — estimated from the floor count",
  none: "None — no height data",
};

function formatMetres(m: number): string {
  return `${Number.isInteger(m) ? m : m.toFixed(1)} m`;
}

export function prettyType(t: string | null, isPart: boolean): string {
  if (!t) return "Unknown";
  const label = t === "yes" ? "Building (type not tagged)" : t.replace(/_/g, " ");
  return isPart ? `${label} — building part` : label;
}

export interface DetailRow {
  label: string;
  value: string;
  href?: string;
}

/** Panel rows. Missing values read "Unknown" — nothing is filled in. */
export function buildingDetailRows(info: BuildingInfo): DetailRow[] {
  const rows: DetailRow[] = [];
  if (info.name) rows.push({ label: "OSM name", value: info.name });
  rows.push({ label: "Building type", value: prettyType(info.buildingType, info.isPart) });

  let height = "Unknown";
  if (info.heightM !== null) {
    height = formatMetres(info.heightM);
    if (info.heightSource.endsWith("_levels_estimate") && info.floorHeightM) {
      height += ` (estimate: floors × ${formatMetres(info.floorHeightM)})`;
    }
  }
  rows.push({ label: "Height", value: height });
  if (info.heightM !== null && info.baseHeightM !== null && info.baseHeightM > 0) {
    rows.push({ label: "Starts at", value: formatMetres(info.baseHeightM) });
  }
  let floors = info.levels !== null && info.levels > 0 ? String(info.levels) : "Unknown";
  if (floors !== "Unknown" && info.heightSource === "osm_explicit") {
    floors += " (tagged separately; height uses the OSM height tag)";
  }
  rows.push({ label: "Floors", value: floors });
  rows.push({ label: "Height source", value: SOURCE_LABEL[info.heightSource] });
  rows.push({ label: "Confidence", value: CONFIDENCE_LABEL[info.confidence] });
  if (info.validationFlags.length > 0) {
    const raw = [
      info.heightRaw ? `height="${info.heightRaw}"` : null,
      info.levelsRaw ? `building:levels="${info.levelsRaw}"` : null,
    ]
      .filter(Boolean)
      .join(", ");
    rows.push({
      label: "Data note",
      value: `${info.validationFlags.join(", ").replace(/_/g, " ")}${raw ? ` (${raw})` : ""}`,
    });
  }
  rows.push({ label: "Footprint from", value: info.footprintDataset ?? "OpenStreetMap" });
  rows.push({ label: "Dataset", value: info.sourceDataset ?? "Unknown" });
  const href = osmUrl(info.sourceFeatureId);
  rows.push({
    label: info.sourceFeatureId && !href ? "Source id" : "OSM id",
    value: info.sourceFeatureId ?? "Unknown",
    ...(href ? { href } : {}),
  });
  return rows;
}

/** Hover tooltip: the building's name, else its type in plain words. Nothing else. */
export function tooltipText(info: BuildingInfo): string {
  if (info.name) return info.name;
  if (!info.buildingType || info.buildingType === "yes") return "Building";
  const t = info.buildingType.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
