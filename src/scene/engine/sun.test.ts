import { describe, expect, it } from "vitest";
import { dayFactor, sunPosition } from "./sun";

describe("sunPosition", () => {
  it("puts the sun above the horizon near midday in Pune (Nov)", () => {
    const s = sunPosition(12.5, 18.52, 73.85);
    expect(s.elevation).toBeGreaterThan(40);
    expect(s.azimuth).toBeGreaterThanOrEqual(0);
    expect(s.azimuth).toBeLessThan(360);
  });

  it("is below the horizon at night", () => {
    expect(sunPosition(21, 18.52, 73.85).elevation).toBeLessThan(0);
  });
});

describe("dayFactor", () => {
  it("is near 1 at high noon elevation and near 0 at night", () => {
    expect(dayFactor(55)).toBeGreaterThan(0.95);
    expect(dayFactor(-20)).toBe(0);
    expect(dayFactor(0)).toBeGreaterThan(0.2);
    expect(dayFactor(0)).toBeLessThan(0.6);
  });
});
