import type { Map as MapLibreMap } from "maplibre-gl";
import { getDefaultCityConfig } from "@/config/loadCityConfig";
import type { LayerId } from "@/store/mapStore";
import { defaultTileStorage } from "./storage";
import { toPmtilesUrl } from "./pmtiles";

const city = getDefaultCityConfig();
const storage = defaultTileStorage();

/**
 * Layers drawn from one of our PMTiles archives. Labels, terrain and trees
 * read from several sources and are attached separately.
 */
export const READY_LAYER_KEYS: readonly LayerId[] = [
  "buildings",
  "roads",
  "water",
  "parks",
  "transit",
  "admin",
];

/** Layers whose geometry lives in the shared context archive. */
export const CONTEXT_LAYER_KEYS: readonly LayerId[] = ["water", "parks", "transit"];

/** Layer ids whose city-config status is `ready` (served from PMTiles). */
export function readyIds(): LayerId[] {
  return READY_LAYER_KEYS.filter((id) => city.layers[id]?.status === "ready");
}

export const CONTEXT_SOURCE_ID = "pv-ready-context";

export function readySourceId(id: LayerId): string {
  return CONTEXT_LAYER_KEYS.includes(id) ? CONTEXT_SOURCE_ID : `pv-ready-${id}`;
}

export function tilePathFor(id: LayerId): string | undefined {
  const tiles = city.tiles;
  if (!tiles) return undefined;
  if (id === "buildings") return tiles.buildings;
  if (id === "roads") return tiles.roads;
  if (CONTEXT_LAYER_KEYS.includes(id)) return tiles.context;
  return undefined;
}

/** Source-layer name inside each PMTiles archive (tippecanoe `-l`). */
export function sourceLayerFor(id: LayerId): string {
  if (id === "buildings") return city.buildings?.source_layer ?? "buildings";
  if (id === "parks") return "green";
  if (id === "transit") return "rail";
  return id;
}

/** Probe whether a public tile path is fetchable (HEAD, then ranged GET). */
export async function probePmtilesPath(pathOrUrl: string): Promise<boolean> {
  const url = storage.resolve(pathOrUrl);
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) return true;
    if (head.status !== 405 && head.status !== 501) return false;
  } catch {
    // fall through to ranged GET
  }
  try {
    const get = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
    });
    return get.ok || get.status === 206;
  } catch {
    return false;
  }
}

/** Probe all config-ready tile paths. */
export async function probeReadyPmtiles(): Promise<{
  ok: LayerId[];
  missing: LayerId[];
}> {
  const ok: LayerId[] = [];
  const missing: LayerId[] = [];
  for (const id of readyIds()) {
    const path = tilePathFor(id);
    if (!path) {
      missing.push(id);
      continue;
    }
    if (await probePmtilesPath(path)) ok.push(id);
    else missing.push(id);
  }
  return { ok, missing };
}

/** Add the PMTiles vector source for a ready layer once. Returns the source id. */
export function ensureReadySource(map: MapLibreMap, id: LayerId): string | null {
  const path = tilePathFor(id);
  if (!path) return null;
  const sid = readySourceId(id);
  if (!map.getSource(sid)) {
    map.addSource(sid, {
      type: "vector",
      url: toPmtilesUrl(storage.resolve(path)),
    });
  }
  return sid;
}

/**
 * Insertion point for overlays: the first layer of the basemap's trailing
 * label block. Styles such as OpenFreeMap Liberty interleave early symbol
 * layers (one-way arrows) with later bridge and building fills, so "before
 * the first symbol" would put our footprints under the basemap's own
 * buildings. Our own `pv-` layers are ignored.
 */
export function labelLayerStartId(map: MapLibreMap): string | undefined {
  const layers = (map.getStyle?.()?.layers ?? []).filter(
    (l) => !l.id.startsWith("pv-"),
  );
  let start: string | undefined;
  for (let i = layers.length - 1; i >= 0 && layers[i].type === "symbol"; i--) {
    start = layers[i].id;
  }
  return start ?? layers.find((l) => l.type === "symbol")?.id;
}
