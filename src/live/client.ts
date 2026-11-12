/**
 * Frontend live-data client.
 * Prefers Cloudflare Worker (VITE_LIVE_API_BASE). When unset, falls back to
 * Open-Meteo direct (CORS + free non-commercial) so local `npm run dev` shows
 * real weather without inventing values or requiring secrets.
 */

import { emptyLiveSnapshot, type LiveSnapshot } from "./types";
import { fetchOpenMeteoSnapshot } from "./providers/openMeteo";

export function liveApiBase(): string | null {
  const u = (import.meta.env.VITE_LIVE_API_BASE as string | undefined)?.trim();
  return u && u.length > 0 ? u.replace(/\/$/, "") : null;
}

export function isLiveApiConfigured(): boolean {
  return liveApiBase() !== null;
}

/**
 * Fetch a normalized snapshot for a bbox.
 * Never fabricates observations on failure — returns empty unavailable snapshot.
 */
export async function fetchLiveSnapshot(
  bbox: [number, number, number, number],
  signal?: AbortSignal,
): Promise<LiveSnapshot> {
  const base = liveApiBase();
  if (base) {
    const q = new URLSearchParams({
      west: String(bbox[0]),
      south: String(bbox[1]),
      east: String(bbox[2]),
      north: String(bbox[3]),
    });
    const res = await fetch(`${base}/v1/live?${q}`, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Live API HTTP ${res.status}`);
    }
    const data = (await res.json()) as LiveSnapshot;
    if (!data || typeof data !== "object" || !data.traffic || !data.weather) {
      throw new Error("Live API returned an unexpected payload");
    }
    return data;
  }

  // Zero-cost local path: Open-Meteo (no API key). Production should still use Worker cache.
  try {
    return await fetchOpenMeteoSnapshot(bbox, signal);
  } catch {
    return emptyLiveSnapshot(bbox);
  }
}
