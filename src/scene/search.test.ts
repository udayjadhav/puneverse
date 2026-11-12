import { describe, expect, it } from "vitest";
import type { SceneManifest } from "./types";
import { searchScene, hitToPreset } from "./search";
import { landmarkContentFor } from "./landmarks/content";

const stubManifest = {
  presets: [
    { label: "Shaniwar Wada", x: 0, y: 0, z: 560, kind: "heritage" },
    { label: "Pune Station", x: 100, y: 50, z: 555, kind: "station" },
  ],
  landmarks: [{ name: "Aga Khan Palace", kind: "heritage", x: 200, y: 100, z: 560, wiki: true }],
  places: [{ name: "Koregaon Park", rank: 5, x: 150, y: 80, z: 560 }],
  stations: [{ name: "Shivajinagar", x: -40, y: 20, metro: false }],
} as unknown as SceneManifest;

describe("searchScene", () => {
  it("finds Shaniwar Wada by prefix", () => {
    const hits = searchScene(stubManifest, "shani");
    expect(hits[0]?.label).toBe("Shaniwar Wada");
    expect(hits[0]?.name_mr).toBeTruthy();
  });

  it("finds landmarks and stations", () => {
    expect(searchScene(stubManifest, "aga")[0]?.label).toMatch(/Aga Khan/i);
    expect(searchScene(stubManifest, "shivaji")[0]?.kind).toBe("station");
  });

  it("returns empty for blank query", () => {
    expect(searchScene(stubManifest, "  ")).toEqual([]);
  });

  it("hitToPreset preserves coordinates", () => {
    const hit = searchScene(stubManifest, "pune station")[0]!;
    const p = hitToPreset(hit);
    expect(p.x).toBe(100);
    expect(p.label).toBe("Pune Station");
  });
});

describe("landmarkContentFor", () => {
  it("resolves curated landmarks with sources", () => {
    const c = landmarkContentFor("Shaniwar Wada");
    expect(c?.verification).toBe("verified");
    expect(c?.sources.length).toBeGreaterThan(0);
    expect(c?.name_mr).toBeTruthy();
  });

  it("returns null for unknown places", () => {
    expect(landmarkContentFor("Totally Fake Monument XYZ")).toBeNull();
  });
});
