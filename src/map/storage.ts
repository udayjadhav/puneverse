/**
 * Tile storage interface (Q7) — local bake today; R2 later without redesign.
 */

export type TileStorageKind = "local" | "r2";

export interface TileRef {
  /** Logical layer id (buildings, roads, …). */
  layerId: string;
  /** Absolute or app-relative URL the map can fetch. */
  url: string;
  kind: TileStorageKind;
}

export interface TileStorage {
  kind: TileStorageKind;
  /** Resolve a city config tile path to a fetchable URL. */
  resolve(pathOrUrl: string): string;
}

/** Local / Vite public path storage (default for Option 0). */
export function createLocalTileStorage(base = ""): TileStorage {
  const prefix = base.replace(/\/$/, "");
  return {
    kind: "local",
    resolve(pathOrUrl: string): string {
      if (/^(https?:|pmtiles:)/i.test(pathOrUrl)) {
        return pathOrUrl;
      }
      const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
      return `${prefix}${path}`;
    },
  };
}

/**
 * Future R2 adapter stub — not wired. Callers should keep using local
 * until Q7 GO. Signature reserved so MapLibre wiring stays stable.
 */
export function createR2TileStorage(_publicBaseUrl: string): TileStorage {
  throw new Error("R2 tile storage is not enabled (Q7 deferred)");
}

export function defaultTileStorage(): TileStorage {
  return createLocalTileStorage();
}
