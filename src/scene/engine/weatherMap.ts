/**
 * Maps normalized Live City weather into simulation parameters.
 * Never invents provider readings — only transforms when status is ok.
 */

import type { LiveSnapshot } from "@/live/types";

export type WeatherKind =
  | "clear"
  | "cloudy"
  | "fog"
  | "light_rain"
  | "moderate_rain"
  | "heavy_rain"
  | "thunderstorm";

export type DataProvenance = "LIVE" | "FORECAST" | "SIMULATED" | "UNAVAILABLE";

export interface WeatherSimParams {
  kind: WeatherKind;
  /** 0..1 rain particle density target. */
  rainDensity: number;
  /** mm/h precipitation intensity. */
  precipMmH: number;
  /** 0..1 road/building wetness. */
  wetness: number;
  cloudPct: number;
  windKmh: number;
  windDirDeg: number;
  /** Extra FogExp2 density boost. */
  fogBoost: number;
  /** Dim sun/sky for storms. */
  skyDarken: number;
  lightningEnabled: boolean;
  visibilityKm: number | null;
  conditionLabel: string | null;
  provenance: DataProvenance;
}

export const CLEAR_WEATHER: WeatherSimParams = {
  kind: "clear",
  rainDensity: 0,
  precipMmH: 0,
  wetness: 0,
  cloudPct: 10,
  windKmh: 0,
  windDirDeg: 0,
  fogBoost: 0,
  skyDarken: 0,
  lightningEnabled: false,
  visibilityKm: null,
  conditionLabel: null,
  provenance: "UNAVAILABLE",
};

/** Light SIMULATED rain so FX are visible when Open-Meteo reports dry. */
export const PREVIEW_RAIN: WeatherSimParams = {
  kind: "light_rain",
  rainDensity: 0.42,
  precipMmH: 1.5,
  wetness: 0.55,
  cloudPct: 55,
  windKmh: 12,
  windDirDeg: 60,
  fogBoost: 0.00002,
  skyDarken: 0.14,
  lightningEnabled: false,
  visibilityKm: 8,
  conditionLabel: "Simulated light rain (preview)",
  provenance: "SIMULATED",
};

export function isThunderCode(code: number | null | undefined): boolean {
  return code === 95 || code === 96 || code === 99;
}

export function kindFromInputs(
  weatherCode: number | null,
  precipMmH: number,
  cloudPct: number,
  visibilityKm: number | null,
): WeatherKind {
  if (isThunderCode(weatherCode)) return "thunderstorm";
  if (precipMmH >= 7.5) return "heavy_rain";
  if (precipMmH >= 2.5) return "moderate_rain";
  if (precipMmH >= 0.1 || (weatherCode != null && weatherCode >= 51 && weatherCode < 95)) {
    return "light_rain";
  }
  if (weatherCode === 45 || weatherCode === 48 || (visibilityKm != null && visibilityKm < 1.5)) {
    return "fog";
  }
  if (cloudPct >= 55 || (weatherCode != null && weatherCode >= 2)) return "cloudy";
  return "clear";
}

/**
 * Build sim params from a LiveSnapshot. If weather meta is not ok, returns CLEAR
 * with UNAVAILABLE provenance (no invented rain).
 */
export function weatherParamsFromSnapshot(snap: LiveSnapshot | null): WeatherSimParams {
  if (!snap || snap.weather.meta.status !== "ok" || !snap.weather.observation) {
    return { ...CLEAR_WEATHER };
  }
  const o = snap.weather.observation;
  const rainObs = snap.rainfall.observations[0];
  let precipMmH = rainObs?.intensityMmH ?? 0;
  const weatherCode = o.weatherCode;
  const cloudPct = o.cloudPct ?? 20;
  const windKmh = o.windKmh ?? 0;
  const windDirDeg = o.windDirDeg ?? 0;
  const visibilityKm = o.visibilityKm;

  // When the model reports a rain/thunder code but 0.00 mm this hour, use a
  // modest intensity so particles still match the condition (not invented AQI).
  if (precipMmH < 0.05 && weatherCode != null) {
    if (isThunderCode(weatherCode)) precipMmH = 6;
    else if (weatherCode >= 80 && weatherCode < 90) precipMmH = 3;
    else if (weatherCode >= 65 && weatherCode < 70) precipMmH = 8;
    else if (weatherCode >= 63) precipMmH = 4;
    else if (weatherCode >= 51) precipMmH = 1.2;
  }

  const kind = kindFromInputs(weatherCode, precipMmH, cloudPct, visibilityKm);
  const rainDensity =
    kind === "heavy_rain" || kind === "thunderstorm"
      ? Math.min(1, 0.55 + precipMmH / 20)
      : kind === "moderate_rain"
        ? Math.min(0.7, 0.25 + precipMmH / 15)
        : kind === "light_rain"
          ? Math.min(0.35, 0.08 + precipMmH / 10)
          : 0;

  const wetness =
    kind === "clear" || kind === "cloudy"
      ? 0
      : kind === "fog"
        ? 0.15
        : Math.min(1, 0.25 + rainDensity * 0.75);

  const fogBoost =
    kind === "fog"
      ? 0.00012
      : visibilityKm != null && visibilityKm < 4
        ? (4 - visibilityKm) * 0.00003
        : kind === "thunderstorm"
          ? 0.00004
          : 0;

  const skyDarken =
    kind === "thunderstorm"
      ? 0.45
      : kind === "heavy_rain"
        ? 0.28
        : kind === "moderate_rain"
          ? 0.12
          : Math.max(cloudPct / 180, kind === "cloudy" ? 0.08 : 0);

  const provenance: DataProvenance =
    snap.rainfall.meta.status === "ok" && rainObs?.kind === "forecast"
      ? "FORECAST"
      : "LIVE";

  return {
    kind,
    rainDensity,
    precipMmH,
    wetness,
    cloudPct,
    windKmh,
    windDirDeg,
    fogBoost,
    skyDarken,
    lightningEnabled: kind === "thunderstorm",
    visibilityKm,
    conditionLabel: o.condition,
    provenance,
  };
}

/**
 * Merge live params with optional SIMULATED rain preview when the sky is dry.
 * Real precip / thunder from the provider always wins.
 */
export function withPreviewRain(live: WeatherSimParams, previewOn: boolean): WeatherSimParams {
  if (!previewOn) return live;
  if (live.provenance === "UNAVAILABLE") {
    return { ...PREVIEW_RAIN };
  }
  if (live.rainDensity > 0.05 || live.precipMmH >= 0.1 || live.lightningEnabled) {
    return live;
  }
  return {
    ...PREVIEW_RAIN,
    windKmh: Math.max(live.windKmh, PREVIEW_RAIN.windKmh),
    windDirDeg: live.windDirDeg || PREVIEW_RAIN.windDirDeg,
    cloudPct: Math.max(live.cloudPct, PREVIEW_RAIN.cloudPct),
    conditionLabel: `Simulated rain preview · live was: ${live.conditionLabel ?? "clear"}`,
  };
}
