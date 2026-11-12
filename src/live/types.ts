/**
 * Normalized live-city contracts. Providers map into these shapes via a
 * server-side adapter. The frontend never invents observation values.
 */

export type LiveDataStatus =
  | "unavailable" // no provider wired / feature off
  | "planned" // layer designed but not implemented
  | "loading"
  | "ok"
  | "stale"
  | "error";

export type LiveLayerId =
  | "overview"
  | "traffic"
  | "weather"
  | "rainfall"
  | "air_quality"
  | "flood_risk"
  | "civic_alerts";

export interface LiveDataMetadata {
  source: string;
  /** ISO-8601 observation time from the provider, when known. */
  observedAt: string | null;
  /** ISO-8601 when our backend fetched the payload. */
  fetchedAt: string | null;
  /** Human-readable spatial resolution (e.g. "road segment", "city station"). */
  spatialResolution: string;
  /** Optional quality note from provider or adapter. */
  qualityNote?: string;
  status: LiveDataStatus;
  /** Short error / unavailable reason for UI. */
  message?: string;
}

export type TrafficLevel = "free" | "moderate" | "slow" | "heavy" | "severe";

export interface TrafficSegment {
  id: string;
  name: string | null;
  level: TrafficLevel;
  speedKmh: number | null;
  freeFlowKmh: number | null;
  delaySec: number | null;
  /** [lon, lat][] simplified centreline for overlay. */
  geometry: [number, number][];
  meta: LiveDataMetadata;
}

export interface TrafficIncident {
  id: string;
  kind: "accident" | "closure" | "construction" | "other";
  title: string;
  lon: number;
  lat: number;
  meta: LiveDataMetadata;
}

export interface WeatherObservation {
  lon: number;
  lat: number;
  tempC: number | null;
  feelsLikeC: number | null;
  humidityPct: number | null;
  windKmh: number | null;
  windDirDeg: number | null;
  cloudPct: number | null;
  pressureHpa: number | null;
  uvIndex: number | null;
  visibilityKm: number | null;
  condition: string | null;
  /** WMO weather interpretation code when the provider supplies one. */
  weatherCode: number | null;
  meta: LiveDataMetadata;
}

export interface WeatherForecastHour {
  at: string;
  tempC: number | null;
  precipMm: number | null;
  condition: string | null;
}

export interface RainfallObservation {
  lon: number;
  lat: number;
  intensityMmH: number | null;
  accumulationMm: number | null;
  probabilityPct: number | null;
  /** Observation vs forecast/model — must be labelled in UI. */
  kind: "radar" | "gauge" | "forecast" | "model";
  meta: LiveDataMetadata;
}

export interface AirQualityStation {
  id: string;
  name: string;
  lon: number;
  lat: number;
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  o3: number | null;
  /**
   * How the value was produced — never confuse these in the UI.
   * - station: physical monitor
   * - interpolated: derived from nearby stations
   * - model: chemical transport / CAMS-style model cell
   */
  readingKind: "station" | "interpolated" | "model";
  meta: LiveDataMetadata;
}

export interface CivicAlert {
  id: string;
  title: string;
  severity: "info" | "watch" | "warning" | "severe";
  lon: number | null;
  lat: number | null;
  body: string | null;
  meta: LiveDataMetadata;
}

export interface LiveSnapshot {
  bbox: [number, number, number, number];
  traffic: { segments: TrafficSegment[]; incidents: TrafficIncident[]; meta: LiveDataMetadata };
  weather: { observation: WeatherObservation | null; forecast: WeatherForecastHour[]; meta: LiveDataMetadata };
  rainfall: { observations: RainfallObservation[]; meta: LiveDataMetadata };
  airQuality: { stations: AirQualityStation[]; meta: LiveDataMetadata };
  floodRisk: { meta: LiveDataMetadata };
  civicAlerts: { alerts: CivicAlert[]; meta: LiveDataMetadata };
}

export interface LiveLocationContext {
  label: string;
  kind: "place" | "building" | "road" | "area" | "unknown";
  lon: number | null;
  lat: number | null;
}

/** Empty snapshot — every layer unavailable. Never filled with invented readings. */
export function emptyLiveSnapshot(bbox: [number, number, number, number]): LiveSnapshot {
  const unavailable = (source: string, message: string): LiveDataMetadata => ({
    source,
    observedAt: null,
    fetchedAt: null,
    spatialResolution: "n/a",
    status: "unavailable",
    message,
  });
  return {
    bbox,
    traffic: {
      segments: [],
      incidents: [],
      meta: unavailable("none", "Traffic provider not configured"),
    },
    weather: {
      observation: null,
      forecast: [],
      meta: unavailable("none", "Weather provider not configured"),
    },
    rainfall: {
      observations: [],
      meta: unavailable("none", "Rainfall / radar provider not configured"),
    },
    airQuality: {
      stations: [],
      meta: unavailable("none", "Air-quality feed not configured"),
    },
    floodRisk: {
      meta: {
        source: "none",
        observedAt: null,
        fetchedAt: null,
        spatialResolution: "n/a",
        status: "planned",
        message: "Flood-risk layer planned — no live source wired",
      },
    },
    civicAlerts: {
      alerts: [],
      meta: {
        source: "none",
        observedAt: null,
        fetchedAt: null,
        spatialResolution: "n/a",
        status: "planned",
        message: "Civic alerts planned — no live source wired",
      },
    },
  };
}

export const LIVE_LAYERS: {
  id: LiveLayerId;
  label: string;
  description: string;
}[] = [
  { id: "overview", label: "Overview", description: "Status of all live layers" },
  { id: "traffic", label: "Traffic", description: "Road congestion by segment" },
  { id: "weather", label: "Weather", description: "Temperature, wind, conditions" },
  { id: "rainfall", label: "Rainfall", description: "Precipitation intensity" },
  { id: "air_quality", label: "Air quality", description: "AQI monitoring stations" },
  { id: "flood_risk", label: "Flood risk", description: "Planned — data-backed only" },
  { id: "civic_alerts", label: "Civic alerts", description: "Planned — data-backed only" },
];

/** Scene bake extent (west, south, east, north) — keep in sync with manifest. */
export const PUNE_SCENE_BBOX: [number, number, number, number] = [
  73.74191, 18.35025, 73.99835, 18.59984,
];
