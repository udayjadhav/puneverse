import puneRaw from "@config/cities/pune.json";
import type { CityConfig } from "./types";

const pune = puneRaw as unknown as CityConfig;

const cities: Record<string, CityConfig> = {
  [pune.id]: pune,
};

export function loadCityConfig(cityId = "pune"): CityConfig {
  const config = cities[cityId];
  if (!config) {
    throw new Error(`Unknown city config: ${cityId}`);
  }
  return config;
}

export function getDefaultCityConfig(): CityConfig {
  return loadCityConfig("pune");
}
