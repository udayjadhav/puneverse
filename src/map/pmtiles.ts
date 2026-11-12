import { addProtocol } from "maplibre-gl";
import { Protocol } from "pmtiles";

let registered = false;

/**
 * Register the MapLibre `pmtiles://` protocol once.
 * Returns true when registration succeeded (or was already done).
 */
export function registerPmtilesProtocol(): boolean {
  if (registered) return true;
  try {
    const protocol = new Protocol();
    addProtocol("pmtiles", protocol.tile);
    registered = true;
    return true;
  } catch {
    return false;
  }
}

export function isPmtilesEnabled(): boolean {
  return registered;
}

/** Build a pmtiles:// URL from a public path or absolute http(s) URL. */
export function toPmtilesUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("pmtiles://")) return pathOrUrl;
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return `pmtiles://${pathOrUrl}`;
  }
  // Relative public path → absolute http(s) for the protocol fetch
  const abs =
    typeof window !== "undefined"
      ? new URL(pathOrUrl, window.location.origin).href
      : `http://localhost${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
  return `pmtiles://${abs}`;
}
