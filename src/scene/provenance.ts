/**
 * Building height provenance — maps bake height sources to confidence and
 * plain-language methodology. Estimates are never labelled as measured.
 */

import type { HeightSource } from "./types";

export type HeightConfidence = "high" | "medium" | "low";

export interface ProvenanceInfo {
  source: HeightSource;
  confidence: HeightConfidence;
  /** Short label for tooltips */
  label: string;
  /** Whether this is an estimate (not a mapped measurement) */
  estimate: boolean;
  /** Methodology sentence for data-quality mode */
  methodology: string;
}

const TABLE: Record<HeightSource, Omit<ProvenanceInfo, "source">> = {
  mapped: {
    confidence: "high",
    label: "Mapped height",
    estimate: false,
    methodology: "Explicit height tag from OpenStreetMap or Overture (contributor-mapped).",
  },
  floors: {
    confidence: "medium",
    label: "Mapped floors × 3 m",
    estimate: true,
    methodology: "Floor count from OSM/Overture × 3.0 m per floor — an estimate, not a surveyed height.",
  },
  satellite: {
    confidence: "medium",
    label: "Satellite estimate",
    estimate: true,
    methodology:
      "GlobalBuildingAtlas ML height, affine-calibrated against mapped buildings in this bake. Not a field survey.",
  },
  area: {
    confidence: "low",
    label: "Area estimate (GHSL 100 m)",
    estimate: true,
    methodology: "Neighbourhood-scale GHSL Built-H raster (~100 m cells). Nearby buildings often share similar values.",
  },
  default: {
    confidence: "low",
    label: "Default by size and type",
    estimate: true,
    methodology: "Conservative default from footprint area and building type when no other signal exists.",
  },
};

export function provenanceFor(source: HeightSource): ProvenanceInfo {
  const row = TABLE[source] ?? TABLE.default;
  return { source, ...row };
}

export function confidenceLabel(c: HeightConfidence): string {
  return c === "high" ? "High confidence" : c === "medium" ? "Medium confidence" : "Low confidence";
}

/** Legend colours for data-quality overlay (sRGB 0–1). */
export const SOURCE_DQ_RGB: Record<HeightSource, [number, number, number]> = {
  mapped: [0.15, 0.72, 0.35],
  floors: [0.35, 0.65, 0.9],
  satellite: [0.95, 0.7, 0.2],
  area: [0.9, 0.45, 0.2],
  default: [0.65, 0.35, 0.75],
};
