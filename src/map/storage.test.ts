import { describe, expect, it } from "vitest";
import { createLocalTileStorage, createR2TileStorage } from "./storage";

describe("tile storage (Q7)", () => {
  it("resolves local relative paths", () => {
    const s = createLocalTileStorage();
    expect(s.kind).toBe("local");
    expect(s.resolve("/tiles/buildings.pmtiles")).toBe(
      "/tiles/buildings.pmtiles",
    );
    expect(s.resolve("tiles/roads.pmtiles")).toBe("/tiles/roads.pmtiles");
  });

  it("passes through absolute and pmtiles URLs", () => {
    const s = createLocalTileStorage();
    expect(s.resolve("https://example.com/a.pmtiles")).toBe(
      "https://example.com/a.pmtiles",
    );
    expect(s.resolve("pmtiles://https://example.com/a.pmtiles")).toBe(
      "pmtiles://https://example.com/a.pmtiles",
    );
  });

  it("R2 adapter is reserved and throws until Q7 GO", () => {
    expect(() => createR2TileStorage("https://r2.example")).toThrow(/R2/);
  });
});
