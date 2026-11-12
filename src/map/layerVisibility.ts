import type { Map as MapLibreMap } from "maplibre-gl";
import type { LayerId } from "@/store/mapStore";
import type { ViewMode } from "./camera";
import { syncSampleOverlayVisibility } from "./overlays";
import { syncReadyOverlayVisibility } from "./readyOverlays";

/** Single entry point for the layer panel toggles + Flat/3D mode. */
export function syncOverlayVisibility(
  map: MapLibreMap,
  layersEnabled: Record<LayerId, boolean>,
  mode: ViewMode,
): void {
  syncSampleOverlayVisibility(map, layersEnabled);
  syncReadyOverlayVisibility(map, layersEnabled, mode);
}
