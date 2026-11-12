/**
 * Open-Meteo adapters (free non-commercial tier, CC-BY 4.0).
 * Shared geographic sample — never one request per building.
 * https://open-meteo.com/en/terms
 */

import {
  emptyLiveSnapshot,
  type AirQualityStation,
  type LiveSnapshot,
  type RainfallObservation,
  type WeatherForecastHour,
  type WeatherObservation,
} from "@/live/types";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";

/** WMO Weather interpretation codes (Open-Meteo). */
export function wmoCondition(code: number | null | undefined): string | null {
  if (code == null || Number.isNaN(code)) return null;
  const map: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };
  return map[code] ?? `WMO code ${code}`;
}

function bboxCentroid(bbox: [number, number, number, number]): { lon: number; lat: number } {
  return { lon: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 };
}

/** Inset sample points for rainfall spatial variation (corners + centre). */
function rainfallSamplePoints(bbox: [number, number, number, number]): { lon: number; lat: number }[] {
  const [w, s, e, n] = bbox;
  const dx = (e - w) * 0.2;
  const dy = (n - s) * 0.2;
  return [
    bboxCentroid(bbox),
    { lon: w + dx, lat: s + dy },
    { lon: e - dx, lat: s + dy },
    { lon: w + dx, lat: n - dy },
    { lon: e - dx, lat: n - dy },
  ];
}

function toIsoLocal(t: string | null | undefined): string | null {
  if (!t) return null;
  // Open-Meteo returns "2026-11-12T14:15" in requested TZ — append offset if missing.
  if (/Z$|[+-]\d{2}:\d{2}$/.test(t)) return t;
  return `${t}+05:30`;
}

interface ForecastPayload {
  latitude: number;
  longitude: number;
  current?: {
    time: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    cloud_cover?: number;
    pressure_msl?: number;
    precipitation?: number;
    weather_code?: number;
    visibility?: number;
  };
  hourly?: {
    time: string[];
    temperature_2m?: (number | null)[];
    precipitation?: (number | null)[];
    precipitation_probability?: (number | null)[];
    weather_code?: (number | null)[];
    uv_index?: (number | null)[];
  };
}

interface AirPayload {
  latitude: number;
  longitude: number;
  current?: {
    time: string;
    european_aqi?: number | null;
    us_aqi?: number | null;
    pm10?: number | null;
    pm2_5?: number | null;
    carbon_monoxide?: number | null;
    nitrogen_dioxide?: number | null;
    sulphur_dioxide?: number | null;
    ozone?: number | null;
  };
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return (await res.json()) as T;
}

function buildWeather(data: ForecastPayload, fetchedAt: string): {
  observation: WeatherObservation;
  forecast: WeatherForecastHour[];
} {
  const c = data.current;
  const hourly = data.hourly;
  let uv: number | null = null;
  if (hourly?.time && hourly.uv_index && c?.time) {
    const idx = hourly.time.findIndex((t) => t.slice(0, 13) === c.time.slice(0, 13));
    if (idx >= 0) uv = hourly.uv_index[idx] ?? null;
  }

  const observation: WeatherObservation = {
    lon: data.longitude,
    lat: data.latitude,
    tempC: c?.temperature_2m ?? null,
    feelsLikeC: c?.apparent_temperature ?? null,
    humidityPct: c?.relative_humidity_2m ?? null,
    windKmh: c?.wind_speed_10m ?? null,
    windDirDeg: c?.wind_direction_10m ?? null,
    cloudPct: c?.cloud_cover ?? null,
    pressureHpa: c?.pressure_msl ?? null,
    uvIndex: uv,
    visibilityKm: c?.visibility != null ? c.visibility / 1000 : null,
    condition: wmoCondition(c?.weather_code ?? null),
    weatherCode: c?.weather_code ?? null,
    meta: {
      source: "Open-Meteo Forecast API (CC-BY 4.0)",
      observedAt: toIsoLocal(c?.time ?? null),
      fetchedAt,
      spatialResolution: "model grid (~1–11 km), scene centroid sample",
      status: "ok",
      qualityNote: "Shared city sample — not a per-building measurement.",
    },
  };

  const forecast: WeatherForecastHour[] = [];
  if (hourly?.time) {
    const n = Math.min(24, hourly.time.length);
    for (let i = 0; i < n; i++) {
      forecast.push({
        at: toIsoLocal(hourly.time[i]) ?? hourly.time[i],
        tempC: hourly.temperature_2m?.[i] ?? null,
        precipMm: hourly.precipitation?.[i] ?? null,
        condition: wmoCondition(hourly.weather_code?.[i] ?? null),
      });
    }
  }
  return { observation, forecast };
}

function buildRainfallFromForecast(
  data: ForecastPayload,
  fetchedAt: string,
): RainfallObservation {
  const c = data.current;
  const hourly = data.hourly;
  let prob: number | null = null;
  if (hourly?.time && hourly.precipitation_probability && c?.time) {
    const idx = hourly.time.findIndex((t) => t.slice(0, 13) === c.time.slice(0, 13));
    if (idx >= 0) prob = hourly.precipitation_probability[idx] ?? null;
  }
  return {
    lon: data.longitude,
    lat: data.latitude,
    intensityMmH: c?.precipitation ?? null,
    accumulationMm: null,
    probabilityPct: prob,
    kind: "forecast",
    meta: {
      source: "Open-Meteo Forecast API (CC-BY 4.0)",
      observedAt: toIsoLocal(c?.time ?? null),
      fetchedAt,
      spatialResolution: "model grid — forecast precipitation, not radar",
      status: "ok",
      qualityNote: "Forecast/model precipitation — not a radar observation.",
    },
  };
}

function buildModelAqi(data: AirPayload, fetchedAt: string): AirQualityStation {
  const c = data.current;
  // Prefer US AQI for a widely understood scale; clearly label as CAMS model, not CPCB.
  const aqi = c?.us_aqi ?? c?.european_aqi ?? null;
  return {
    id: `open-meteo-cams-${data.latitude.toFixed(2)}-${data.longitude.toFixed(2)}`,
    name: "CAMS model cell (Open-Meteo)",
    lon: data.longitude,
    lat: data.latitude,
    aqi,
    pm25: c?.pm2_5 ?? null,
    pm10: c?.pm10 ?? null,
    no2: c?.nitrogen_dioxide ?? null,
    so2: c?.sulphur_dioxide ?? null,
    co: c?.carbon_monoxide ?? null,
    o3: c?.ozone ?? null,
    readingKind: "model",
    meta: {
      source: "Open-Meteo Air Quality API · CAMS (CC-BY 4.0)",
      observedAt: toIsoLocal(c?.time ?? null),
      fetchedAt,
      spatialResolution: "~45 km CAMS global model cell",
      status: "ok",
      qualityNote:
        "Modelled concentrations — not a CPCB monitoring station. AQI scale is US AQI when present.",
    },
  };
}

/**
 * Fetch a normalized LiveSnapshot for the scene bbox using Open-Meteo only.
 * Weather/rainfall: centroid (+ multi-point rain). AQI: single CAMS model cell.
 * Traffic stays unavailable (no free live congestion feed).
 */
export async function fetchOpenMeteoSnapshot(
  bbox: [number, number, number, number],
  signal?: AbortSignal,
): Promise<LiveSnapshot> {
  const fetchedAt = new Date().toISOString();
  const centre = bboxCentroid(bbox);
  const rainPts = rainfallSamplePoints(bbox);

  const weatherParams = new URLSearchParams({
    latitude: String(centre.lat),
    longitude: String(centre.lon),
    timezone: "Asia/Kolkata",
    forecast_days: "1",
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "precipitation",
      "weather_code",
      "cloud_cover",
      "pressure_msl",
      "wind_speed_10m",
      "wind_direction_10m",
      "visibility",
    ].join(","),
    hourly: [
      "temperature_2m",
      "precipitation",
      "precipitation_probability",
      "weather_code",
      "uv_index",
    ].join(","),
  });

  const rainLat = rainPts.map((p) => p.lat).join(",");
  const rainLon = rainPts.map((p) => p.lon).join(",");
  const rainParams = new URLSearchParams({
    latitude: rainLat,
    longitude: rainLon,
    timezone: "Asia/Kolkata",
    current: "precipitation,weather_code",
    hourly: "precipitation,precipitation_probability",
    forecast_days: "1",
  });

  const airParams = new URLSearchParams({
    latitude: String(centre.lat),
    longitude: String(centre.lon),
    timezone: "Asia/Kolkata",
    current: [
      "us_aqi",
      "european_aqi",
      "pm10",
      "pm2_5",
      "carbon_monoxide",
      "nitrogen_dioxide",
      "sulphur_dioxide",
      "ozone",
    ].join(","),
  });

  const base = emptyLiveSnapshot(bbox);
  base.traffic.meta = {
    source: "none",
    observedAt: null,
    fetchedAt,
    spatialResolution: "n/a",
    status: "unavailable",
    message:
      "Live congestion unavailable — no free traffic-speed feed. OSM roads stay in the 3D scene; OSRM may be added later for routes only.",
  };

  try {
    const weather = await fetchJson<ForecastPayload>(`${FORECAST_URL}?${weatherParams}`, signal);
    const { observation, forecast } = buildWeather(weather, fetchedAt);
    base.weather = {
      observation,
      forecast,
      meta: observation.meta,
    };
    base.rainfall = {
      observations: [buildRainfallFromForecast(weather, fetchedAt)],
      meta: {
        source: "Open-Meteo Forecast API (CC-BY 4.0)",
        observedAt: observation.meta.observedAt,
        fetchedAt,
        spatialResolution: "model forecast — not radar",
        status: "ok",
        qualityNote: "Precipitation from weather model; distinguish from radar observations.",
      },
    };
  } catch (e) {
    base.weather.meta = {
      source: "Open-Meteo",
      observedAt: null,
      fetchedAt,
      spatialResolution: "n/a",
      status: "error",
      message: String((e as Error)?.message ?? e).slice(0, 160),
    };
    base.rainfall.meta = { ...base.weather.meta, message: "Rainfall fetch failed with weather" };
  }

  // Multi-point rainfall (best-effort; ignore if multi-coord shape differs)
  try {
    const multi = await fetchJson<ForecastPayload | ForecastPayload[]>(
      `${FORECAST_URL}?${rainParams}`,
      signal,
    );
    const list = Array.isArray(multi) ? multi : [multi];
    const obs = list.map((d) => buildRainfallFromForecast(d, fetchedAt));
    if (obs.length > 0) {
      base.rainfall.observations = obs;
      base.rainfall.meta.status = "ok";
    }
  } catch {
    // Keep single-point rainfall from weather fetch if present.
  }

  try {
    const air = await fetchJson<AirPayload>(`${AIR_URL}?${airParams}`, signal);
    const station = buildModelAqi(air, fetchedAt);
    base.airQuality = {
      stations: [station],
      meta: station.meta,
    };
  } catch (e) {
    base.airQuality.meta = {
      source: "Open-Meteo Air Quality",
      observedAt: null,
      fetchedAt,
      spatialResolution: "n/a",
      status: "error",
      message: String((e as Error)?.message ?? e).slice(0, 160),
    };
  }

  base.floodRisk.meta = {
    source: "none",
    observedAt: null,
    fetchedAt,
    spatialResolution: "terrain DEM in scene",
    status: "planned",
    message: "Flood risk planned — DEM exists; no free live flood observation feed yet.",
  };
  base.civicAlerts.meta = {
    source: "none",
    observedAt: null,
    fetchedAt,
    spatialResolution: "n/a",
    status: "planned",
    message: "Civic alerts planned — no free feed wired.",
  };

  return base;
}
