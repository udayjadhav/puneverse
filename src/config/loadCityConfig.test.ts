import { describe, expect, it } from "vitest";
import { getDefaultCityConfig, loadCityConfig } from "./loadCityConfig";

describe("loadCityConfig", () => {
  it("loads pune with G0 locked fields", () => {
    const config = loadCityConfig("pune");

    expect(config.id).toBe("pune");
    expect(config.scope).toBe("B");
    expect(config.cantonments === true || config.cantonments === "in").toBe(
      true,
    );
    expect(config.label_language).toBe("en");
    expect(config.place_sources).toEqual(
      expect.arrayContaining(["wards", "gazetteer"]),
    );
    expect(config.place_sources).toHaveLength(2);
    expect(config.display_name).toBe("Pune & Pimpri-Chinchwad");
    expect(config.maxBounds).toBeDefined();
    expect(config.maxBounds).toHaveLength(4);
    expect(config.maxBounds.every((n) => typeof n === "number")).toBe(true);
    expect(config.tile_url_env).toBe("VITE_TILE_URL");
    expect(config.basemap_fallback).toMatch(/^https?:\/\//);
    expect(config.default_pitch).toBeGreaterThanOrEqual(55);
    expect(config.default_pitch).toBeLessThanOrEqual(60);
    expect(config.max_pitch).toBeGreaterThanOrEqual(80);
    expect(config.max_pitch).toBeLessThanOrEqual(85);
    expect(config.buildings?.source_layer).toBe("buildings");
    expect(config.buildings?.extrusion_minzoom).toBeGreaterThanOrEqual(13);
    expect(config.buildings?.extrusion_minzoom).toBeLessThanOrEqual(14);
    expect(config.buildings?.baked_bbox).toEqual([
      73.8317, 18.4954, 73.8817, 18.5454,
    ]);
    expect(config.tiles?.buildings).toMatch(/\.pmtiles$/);
    expect(config.tiles?.roads).toMatch(/\.pmtiles$/);
  });

  it("exposes required honesty disclosure strings", () => {
    const { honesty } = getDefaultCityConfig();

    expect(honesty.day_night).toMatch(/day\/night/i);
    expect(honesty.day_night.toLowerCase()).toMatch(/lighting/);
    expect(honesty.heights.toLowerCase()).toMatch(/height/);
    expect(honesty.heights.toLowerCase()).toMatch(
      /not invent|no fabricated|unknown/,
    );
    expect(honesty.heights.toLowerCase()).toMatch(/flat|no extrusion/);
    expect(honesty.extent).toMatch(/PMC/);
    expect(honesty.extent).toMatch(/PCMC|twin.?city/i);
    expect(honesty.search_limits.length).toBeGreaterThan(10);
    expect(honesty.ship_hold).toMatch(/SHIP HOLD/);
    expect(honesty.ship_hold.toLowerCase()).toMatch(/not.*production|do not treat/);
    expect(honesty.attribution.toLowerCase()).toMatch(/openstreetmap|\bosm\b/);
    expect(honesty.camera ?? "").toMatch(/3D/);
    expect(honesty.camera ?? "").toMatch(/flat/i);
    expect(honesty.ship_hold).toMatch(/SAMPLE/);
    expect(honesty.ship_hold.toLowerCase()).toMatch(/water, parks, rail and metro are real/);
    expect(honesty.terrain).toMatch(/no vertical exaggeration/);
  });

  it("marks buildings/roads/water/parks ready; admin sample; terrain at true scale", () => {
    const { layers } = getDefaultCityConfig();

    expect(layers.buildings?.status).toBe("ready");
    expect(layers.roads?.status).toBe("ready");
    expect(layers.admin?.status).toBe("sample");
    expect(layers.admin?.label).toMatch(/SAMPLE/i);
    expect(layers.water?.status).toBe("ready");
    expect(layers.parks?.status).toBe("ready");
    expect(getDefaultCityConfig().terrain?.exaggeration).toBe(1);
    expect(layers.buildings?.label).not.toMatch(/SAMPLE/i);
    expect(layers.roads?.label).not.toMatch(/SAMPLE/i);
  });

  it("rejects unknown city ids", () => {
    expect(() => loadCityConfig("mumbai")).toThrow(/Unknown city/);
  });
});
