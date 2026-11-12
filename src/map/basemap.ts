import type { CityConfig } from "@/config/types";
import type { ThemeMode } from "@/store/mapStore";

export function resolveBasemapUrl(
  config: CityConfig,
  theme: ThemeMode,
): string {
  const envLight = import.meta.env.VITE_TILE_URL;
  const envDark = import.meta.env.VITE_TILE_URL_DARK;

  if (theme === "night") {
    return envDark || config.basemap.dark || config.basemap_fallback;
  }
  return envLight || config.basemap.light || config.basemap_fallback;
}
