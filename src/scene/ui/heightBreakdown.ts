import { HEIGHT_SOURCES, type HeightSource, type SceneManifest } from "@/scene/types";

export const HEIGHT_SOURCE_COLORS: Record<HeightSource, string> = {
  mapped: "#22c55e",
  floors: "#2dd4bf",
  satellite: "#f5a524",
  area: "#a78bfa",
  default: "#64748b",
};

export interface HeightSourceRow {
  source: HeightSource;
  label: string;
  count: number;
  /** Percent of all buildings, 0..100. */
  pct: number;
  color: string;
}

/** One row per HEIGHT_SOURCES entry, in that order. Missing counts read as 0. */
export function heightSourceBreakdown(manifest: SceneManifest): HeightSourceRow[] {
  const counts = manifest.stats.height_sources;
  const labels = manifest.stats.height_source_labels;
  const total = HEIGHT_SOURCES.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  return HEIGHT_SOURCES.map((source) => {
    const count = counts[source] ?? 0;
    return {
      source,
      label: labels[source] ?? source,
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
      color: HEIGHT_SOURCE_COLORS[source],
    };
  });
}

/** "16:54" from fractional hours. */
export function formatClock(hours: number): string {
  const totalMin = Math.round((((hours % 24) + 24) % 24) * 60) % (24 * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "18.5195° N 73.8553° E" */
export function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${ns} ${Math.abs(lon).toFixed(4)}° ${ew}`;
}
