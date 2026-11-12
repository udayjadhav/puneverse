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

    expect(honesty.day_night.toLowerCase()).toMatch(/3d/);
    expect(honesty.day_night.toLowerCase()).toMatch(/basemap|2d/);
    expect(honesty.heights.toLowerCase()).toMatch(/height/);
    expect(honesty.heights.toLowerCase()).toMatch(/estimate/);
    expect(honesty.heights.toLowerCase()).toMatch(/mapped|satellite|floors/);
    expect(honesty.extent).toMatch(/PMC|PCMC|Sinhgad|manifest/i);
    expect(honesty.search_limits.length).toBeGreaterThan(10);
    expect(honesty.ship_hold).toMatch(/not an official municipal product|exploration|SAMPLE/i);
    expect(honesty.ship_hold.toLowerCase()).toMatch(/do not treat|not claimed|official/);
    expect(honesty.attribution.toLowerCase()).toMatch(/openstreetmap|\bosm\b/);
    expect(honesty.camera ?? "").toMatch(/3D|Three/i);
    expect((honesty.terrain ?? "").toLowerCase()).toMatch(/dem|terrain|copernicus/);
    expect((honesty.trees ?? "").toLowerCase()).toMatch(/worldcover|tree/);
    expect((honesty.live_city ?? "").toLowerCase()).toMatch(/live|provider|unavailable|never invent/);
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
