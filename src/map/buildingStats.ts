/** Bake-time height coverage for the center area (public/data/buildings.stats.json). */
export interface BuildingStats {
  bbox: [number, number, number, number];
  source_dataset: string;
  floor_height_m: number;
  buildings: number;
  building_parts: number;
  height_explicit: number;
  /** Heights from Overture with a non-OSM source (0 when absent). */
  height_overture?: number;
  height_levels_estimate: number;
  height_unknown: number;
  pct_explicit: number;
  pct_levels_estimate: number;
  pct_with_height: number;
  pct_unknown: number;
  /** Footprint counts per dataset (OpenStreetMap, Google Open Buildings, …). */
  by_footprint_dataset?: Record<string, number>;
}

const NUMERIC_KEYS = [
  "floor_height_m",
  "buildings",
  "building_parts",
  "height_explicit",
  "height_levels_estimate",
  "height_unknown",
  "pct_explicit",
  "pct_levels_estimate",
  "pct_with_height",
  "pct_unknown",
] as const;

/** Validate the JSON shape; null when anything is missing or inconsistent. */
export function parseBuildingStats(raw: unknown): BuildingStats | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  for (const k of NUMERIC_KEYS) {
    if (typeof r[k] !== "number" || !Number.isFinite(r[k])) return null;
  }
  if (typeof r.source_dataset !== "string") return null;
  if (
    !Array.isArray(r.bbox) ||
    r.bbox.length !== 4 ||
    !r.bbox.every((n) => typeof n === "number")
  ) {
    return null;
  }
  const s = r as unknown as BuildingStats;
  const overture = typeof r.height_overture === "number" ? r.height_overture : 0;
  if (s.height_explicit + overture + s.height_levels_estimate + s.height_unknown !== s.buildings) {
    return null;
  }
  return s;
}

export async function fetchBuildingStats(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BuildingStats | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    return parseBuildingStats(await res.json());
  } catch {
    return null;
  }
}

const fmt = (n: number) => n.toLocaleString("en-IN");

function footprintLine(s: BuildingStats): string[] {
  const by = s.by_footprint_dataset;
  if (!by) return [];
  const parts = Object.entries(by)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${fmt(v)}`);
  return [`Footprints: ${parts.join(" · ")}.`];
}

export function heightCoverageLines(s: BuildingStats): string[] {
  const known = s.height_explicit + (s.height_overture ?? 0) + s.height_levels_estimate;
  return [
    `${fmt(known)} of ${fmt(s.buildings)} buildings (${s.pct_with_height}%) have a height and are shown in 3D.`,
    `${fmt(s.height_explicit)} (${s.pct_explicit}%) use an OSM height tag. ${fmt(s.height_levels_estimate)} (${s.pct_levels_estimate}%) are estimates: floors × ${s.floor_height_m} m.`,
    `${fmt(s.height_unknown)} (${s.pct_unknown}%) have no height data and stay flat.`,
    ...footprintLine(s),
    `Center area only (${s.bbox.join(", ")}), not all of PMC/PCMC. Source: ${s.source_dataset}.`,
  ];
}
