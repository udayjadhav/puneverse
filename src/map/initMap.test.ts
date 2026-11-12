import { describe, expect, it } from "vitest";
import { getDefaultCityConfig } from "@/config/loadCityConfig";
import { buildMapOptions } from "./initMap";
import { MAX_PITCH, PITCH_3D } from "./camera";

describe("buildMapOptions", () => {
  const city = getDefaultCityConfig();

  it("3D mode opens tilted with the high max pitch", () => {
    const o = buildMapOptions(city, "map", "style.json", "3d");
    expect(o.pitch).toBe(PITCH_3D);
    expect(o.maxPitch).toBe(MAX_PITCH);
    expect(o.center).toEqual(city.center);
    expect(o.maxBounds).toEqual(city.maxBounds);
  });

  it("flat mode opens at pitch 0", () => {
    expect(buildMapOptions(city, "map", "style.json", "flat").pitch).toBe(0);
  });
});
