import type { Map as MapLibreMap } from "maplibre-gl";
import type { LayerId, ThemeMode } from "@/store/mapStore";
import { useMapStore } from "@/store/mapStore";
import type { ViewMode } from "./camera";
import { registerPmtilesProtocol } from "./pmtiles";
import { ensureBuildingLayers, syncBuildingLayers } from "./buildingsLayers";
import { ensureToggleLayers, setVisible, TOGGLE_LAYERS } from "./contextLayers";
import { ensureReadySource, probeReadyPmtiles, readyIds } from "./sources";
import { ensureTerrain, syncTerrain } from "./terrain";
import { ensureTrees, syncTrees } from "./trees3d";

export { probePmtilesPath, probeReadyPmtiles } from "./sources";

export const TILES_MISSING_BANNER = "Tiles missing — run pipeline bake";
export const PMTILES_PROTOCOL_BANNER =
  "PMTiles protocol failed — cannot load ready tiles";

export function fillId(id: LayerId): string {
  return `pv-ready-${id}-fill`;
}

export function lineId(id: LayerId): string {
  return `pv-ready-${id}-line`;
}

export interface ReadyOverlayState {
  layersEnabled: Record<LayerId, boolean>;
  mode: ViewMode;
  theme: ThemeMode;
  /** False once a newer style has replaced the one this call started on. */
  isCurrent?: () => boolean;
}

function wireReadySourceErrors(map: MapLibreMap): void {
  const key = "__pvReadySourceErrors";
  const flagged = map as MapLibreMap & { [key]?: boolean };
  if (flagged[key]) return;
  flagged[key] = true;
  map.on("error", (e) => {
    const src = (e as { sourceId?: string }).sourceId ?? "";
    const msg = e.error?.message ?? "";
    if (
      src.startsWith("pv-ready-") ||
      /pmtiles|\/tiles\//i.test(msg) ||
      /failed to (load|fetch).*tile/i.test(msg)
    ) {
      useMapStore.getState().setTilesBanner(TILES_MISSING_BANNER);
    }
  });
}

/**
 * Attach PMTiles vector layers for config status=ready.
 * Fail-closed: protocol failure or missing files → store banner.
 * Stacking is fixed by LAYER_ORDER (contextLayers.ts), not by call order.
 */
export async function ensureReadyOverlays(
  map: MapLibreMap,
  state: ReadyOverlayState,
): Promise<void> {
  if (readyIds().length === 0) return;

  if (!registerPmtilesProtocol()) {
    useMapStore.getState().setTilesBanner(PMTILES_PROTOCOL_BANNER);
    return;
  }

  wireReadySourceErrors(map);

  const { ok, missing } = await probeReadyPmtiles();
  // A theme switch during the probe swaps the style; its own style.load re-adds.
  if (state.isCurrent && !state.isCurrent()) return;
  if (missing.length > 0) {
    useMapStore.getState().setTilesBanner(TILES_MISSING_BANNER);
  } else if (useMapStore.getState().tilesBanner === TILES_MISSING_BANNER) {
    useMapStore.getState().setTilesBanner(null);
  }

  for (const id of ok) {
    const sid = ensureReadySource(map, id);
    if (!sid) continue;
    const enabled = state.layersEnabled[id];
    if (id === "buildings") {
      ensureBuildingLayers(map, sid, {
        enabled,
        mode: state.mode,
        theme: state.theme,
      });
    } else {
      ensureToggleLayers(map, id, state.theme, enabled);
    }
  }
  ensureToggleLayers(map, "labels", state.theme, state.layersEnabled.labels);
  ensureTerrain(map, state.layersEnabled.terrain, state.theme);
  await ensureTrees(map, {
    enabled: state.layersEnabled.trees,
    mode: state.mode,
    theme: state.theme,
  });
}

/** Sync toggle + Flat/3D state onto every ready layer that exists. */
export function syncReadyOverlayVisibility(
  map: MapLibreMap,
  layersEnabled: Record<LayerId, boolean>,
  mode: ViewMode,
): void {
  for (const id of readyIds()) {
    if (id === "buildings") {
      syncBuildingLayers(map, { enabled: layersEnabled.buildings, mode });
      continue;
    }
    setVisible(map, TOGGLE_LAYERS[id] ?? [fillId(id), lineId(id)], layersEnabled[id]);
  }
  setVisible(map, TOGGLE_LAYERS.labels ?? [], layersEnabled.labels);
  syncTerrain(map, layersEnabled.terrain);
  syncTrees(map, { enabled: layersEnabled.trees, mode });
}
