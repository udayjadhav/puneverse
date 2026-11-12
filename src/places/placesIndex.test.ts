import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { PlacesIndex } from "@/config/types";

const INDEX_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public/data/places.index.json",
);

/** Names that would look like a marketing neighbourhood list — must not appear. */
const MARKETING_NAME_PATTERN =
  /\b(koregaon\s*park|baner|hinjewadi|kothrud|aundh|viman\s*nagar|hadapsar|wakad|magarpatta|shivaji\s*nagar)\b/i;

function loadPlacesIndexFixture(): PlacesIndex {
  const raw = readFileSync(INDEX_PATH, "utf8");
  return JSON.parse(raw) as PlacesIndex;
}

describe("places.index.json fixture", () => {
  it("is parseable and marked fixture:true", () => {
    const index = loadPlacesIndexFixture();

    expect(index.fixture).toBe(true);
    expect(index.city_id).toBe("pune");
    expect(Array.isArray(index.places)).toBe(true);
    expect(index.places.length).toBeGreaterThan(0);
  });

  it("entries have id/name/source/center with ward|gazetteer sources only", () => {
    const { places } = loadPlacesIndexFixture();

    for (const place of places) {
      expect(place.id, "place.id").toBeTruthy();
      expect(typeof place.id).toBe("string");
      expect(place.name, "place.name").toBeTruthy();
      expect(typeof place.name).toBe("string");
      expect(["wards", "gazetteer"]).toContain(place.source);
      expect(place.center).toHaveLength(2);
      expect(typeof place.center[0]).toBe("number");
      expect(typeof place.center[1]).toBe("number");
    }
  });

  it("names look fixture-like, not a marketing neighbourhood list", () => {
    const { places } = loadPlacesIndexFixture();

    for (const place of places) {
      expect(place.name).toMatch(/fixture/i);
      expect(place.name).not.toMatch(MARKETING_NAME_PATTERN);
      expect(place.id).toMatch(/fixture/i);
    }
  });
});
