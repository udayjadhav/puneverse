/**
 * Cached typical-hour traffic demand for Pune (IST).
 *
 * There is no free live congestion-speed feed. This uses a fixed diurnal
 * curve for Pune peak / off-peak (not GPS). Results are cached in
 * localStorage so refreshes stay stable within the TTL.
 */

import type { TrafficDensityMode } from "@/scene/engine/traffic";

export interface TrafficDemand {
  /** Density mode for car-following gaps / speed. */
  density: TrafficDensityMode;
  /** Multiplier on the detail traffic budget (0.2–1). */
  countMul: number;
  /** IST hour 0–23 used for the curve. */
  hourIst: number;
  /** Cache hit vs freshly computed. */
  fromCache: boolean;
  fetchedAt: string;
  source: "pune-typical-hour-cache";
  /** Honest label for UI. */
  message: string;
}

const CACHE_KEY = "pv-traffic-demand-v1";
const TTL_MS = 20 * 60 * 1000;

interface CacheRow {
  hourIst: number;
  density: TrafficDensityMode;
  countMul: number;
  fetchedAt: string;
  expiresAt: number;
}

/** Relative activity 0–1 by IST hour (Pune weekday-ish peaks). */
const HOUR_ACTIVITY = [
  0.12, 0.08, 0.06, 0.06, 0.1, 0.22, // 0–5
  0.45, 0.75, 0.95, 0.85, 0.55, 0.5, // 6–11
  0.55, 0.5, 0.48, 0.55, 0.7, 0.92, // 12–17
  0.98, 0.85, 0.6, 0.4, 0.28, 0.18, // 18–23
];

function istHour(d = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? d.getHours());
  return ((h % 24) + 24) % 24;
}

function fromActivity(activity: number): Pick<TrafficDemand, "density" | "countMul"> {
  if (activity >= 0.85) return { density: "jam", countMul: 1 };
  if (activity >= 0.65) return { density: "heavy", countMul: 0.75 };
  if (activity >= 0.35) return { density: "moderate", countMul: 0.45 };
  return { density: "free", countMul: 0.25 };
}

function readCache(hourIst: number): CacheRow | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const row = JSON.parse(raw) as CacheRow;
    if (!row || row.hourIst !== hourIst || Date.now() > row.expiresAt) return null;
    return row;
  } catch {
    return null;
  }
}

function writeCache(row: CacheRow) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(row));
  } catch {
    /* quota / private mode */
  }
}

/** Resolve demand for the current IST hour (cached ~20 min). */
export function getTrafficDemand(now = new Date()): TrafficDemand {
  const hourIst = istHour(now);
  const hit = readCache(hourIst);
  if (hit) {
    return {
      density: hit.density,
      countMul: hit.countMul,
      hourIst,
      fromCache: true,
      fetchedAt: hit.fetchedAt,
      source: "pune-typical-hour-cache",
      message:
        "3D road activity follows a cached typical Pune hour profile (IST peaks). Not live GPS congestion.",
    };
  }
  const activity = HOUR_ACTIVITY[hourIst] ?? 0.4;
  const { density, countMul } = fromActivity(activity);
  const fetchedAt = now.toISOString();
  writeCache({
    hourIst,
    density,
    countMul,
    fetchedAt,
    expiresAt: Date.now() + TTL_MS,
  });
  return {
    density,
    countMul,
    hourIst,
    fromCache: false,
    fetchedAt,
    source: "pune-typical-hour-cache",
    message:
      "3D road activity follows a cached typical Pune hour profile (IST peaks). Not live GPS congestion.",
  };
}
