import { describe, expect, it } from "vitest";
import { HEIGHT_SOURCES } from "./types";
import { confidenceLabel, provenanceFor, SOURCE_DQ_RGB } from "./provenance";

describe("provenanceFor", () => {
  it("covers every height source", () => {
    for (const src of HEIGHT_SOURCES) {
      const p = provenanceFor(src);
      expect(p.source).toBe(src);
      expect(p.label.length).toBeGreaterThan(3);
      expect(p.methodology.length).toBeGreaterThan(10);
      expect(["high", "medium", "low"]).toContain(p.confidence);
    }
  });

  it("never marks non-mapped sources as non-estimates", () => {
    expect(provenanceFor("mapped").estimate).toBe(false);
    expect(provenanceFor("floors").estimate).toBe(true);
    expect(provenanceFor("satellite").estimate).toBe(true);
    expect(provenanceFor("area").estimate).toBe(true);
    expect(provenanceFor("default").estimate).toBe(true);
  });

  it("labels mapped as high confidence", () => {
    expect(provenanceFor("mapped").confidence).toBe("high");
    expect(confidenceLabel("high")).toMatch(/High/i);
  });

  it("has DQ legend colours for every source", () => {
    for (const src of HEIGHT_SOURCES) {
      const rgb = SOURCE_DQ_RGB[src];
      expect(rgb).toHaveLength(3);
      expect(rgb.every((c) => c >= 0 && c <= 1)).toBe(true);
    }
  });
});
