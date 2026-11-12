import { describe, expect, it } from "vitest";
import { toPmtilesUrl } from "./pmtiles";

describe("toPmtilesUrl", () => {
  it("prefixes http(s) and relative paths", () => {
    expect(toPmtilesUrl("pmtiles://https://x/a.pmtiles")).toBe(
      "pmtiles://https://x/a.pmtiles",
    );
    expect(toPmtilesUrl("https://x/a.pmtiles")).toBe(
      "pmtiles://https://x/a.pmtiles",
    );
    expect(toPmtilesUrl("/tiles/buildings.pmtiles")).toMatch(
      /^pmtiles:\/\/https?:\/\/.+\/tiles\/buildings\.pmtiles$/,
    );
  });
});
