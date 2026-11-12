/**
 * Open-Meteo fetch + normalize for the Worker (mirrors src/live/providers/openMeteo.ts).
 * Free non-commercial tier — CC-BY 4.0. No API key.
 */

type BBox = [number, number, number, number];

function wmoCondition(code: number | null | undefined): string | null {
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
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };
  return map[code] ?? `WMO code ${code}`;
}

function toIsoLocal(t: string | null | undefined): string | null {
  if (!t) return null;
  if (/Z$|[+-]\d{2}:\d{2}$/.test(t)) return t;
  return `${t}+05:30`;
}

function centroid(bbox: BBox) {
  return { lon: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 };
}

function rainPoints(bbox: BBox) {
  const [w, s, e, n] = bbox;
  const dx = (e - w) * 0.2;
  const dy = (n - s) * 0.2;
  const c = centroid(bbox);
  return [c, { lon: w + dx, lat: s + dy }, { lon: e - dx, lat: s + dy }, { lon: w + dx, lat: n - dy }, { lon: e - dx, lat: n - dy }];
}

interface ForecastPayload {
  latitude: number;
  longitude: number;
  current?: Record<string, number | string | undefined>;
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
  current?: Record<string, number | string | null | undefined>;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function buildOpenMeteoSnapshot(bbox: BBox) {
  const fetchedAt = new Date().toISOString();
  const c = centroid(bbox);
  const pts = rainPoints(bbox);

  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}` +
    `&timezone=Asia%2FKolkata&forecast_days=1` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,visibility` +
    `&hourly=temperature_2m,precipitation,precipitation_probability,weather_code,uv_index`;

  const rainUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${pts.map((p) => p.lat).join(",")}` +
    `&longitude=${pts.map((p) => p.lon).join(",")}` +
    `&timezone=Asia%2FKolkata&forecast_days=1&current=precipitation,weather_code` +
    `&hourly=precipitation,precipitation_probability`;

  const airUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${c.lat}&longitude=${c.lon}` +
    `&timezone=Asia%2FKolkata` +
    `&current=us_aqi,european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone`;

  const weather = await getJson<ForecastPayload>(weatherUrl);
  const cur = weather.current ?? {};
  const hourly = weather.hourly;
  let uv: number | null = null;
  if (hourly?.time && hourly.uv_index && typeof cur.time === "string") {
    const idx = hourly.time.findIndex((t) => t.slice(0, 13) === String(cur.time).slice(0, 13));
    if (idx >= 0) uv = hourly.uv_index[idx] ?? null;
  }

  const observedAt = toIsoLocal(typeof cur.time === "string" ? cur.time : null);
  const weatherMeta = {
    source: "Open-Meteo Forecast API (CC-BY 4.0)",
    observedAt,
    fetchedAt,
    spatialResolution: "model grid (~1–11 km), scene centroid sample",
    status: "ok" as const,
    qualityNote: "Shared city sample — not a per-building measurement.",
  };

  const observation = {
    lon: weather.longitude,
    lat: weather.latitude,
    tempC: typeof cur.temperature_2m === "number" ? cur.temperature_2m : null,
    feelsLikeC: typeof cur.apparent_temperature === "number" ? cur.apparent_temperature : null,
    humidityPct: typeof cur.relative_humidity_2m === "number" ? cur.relative_humidity_2m : null,
    windKmh: typeof cur.wind_speed_10m === "number" ? cur.wind_speed_10m : null,
    windDirDeg: typeof cur.wind_direction_10m === "number" ? cur.wind_direction_10m : null,
    cloudPct: typeof cur.cloud_cover === "number" ? cur.cloud_cover : null,
    pressureHpa: typeof cur.pressure_msl === "number" ? cur.pressure_msl : null,
    uvIndex: uv,
    visibilityKm: typeof cur.visibility === "number" ? cur.visibility / 1000 : null,
    condition: wmoCondition(typeof cur.weather_code === "number" ? cur.weather_code : null),
    weatherCode: typeof cur.weather_code === "number" ? cur.weather_code : null,
    meta: weatherMeta,
  };

  const forecast = [];
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

  function rainObs(d: ForecastPayload) {
    const cc = d.current ?? {};
    let prob: number | null = null;
    if (d.hourly?.time && d.hourly.precipitation_probability && typeof cc.time === "string") {
      const idx = d.hourly.time.findIndex((t) => t.slice(0, 13) === String(cc.time).slice(0, 13));
      if (idx >= 0) prob = d.hourly.precipitation_probability[idx] ?? null;
    }
    return {
      lon: d.longitude,
      lat: d.latitude,
      intensityMmH: typeof cc.precipitation === "number" ? cc.precipitation : null,
      accumulationMm: null,
      probabilityPct: prob,
      kind: "forecast" as const,
      meta: {
        source: "Open-Meteo Forecast API (CC-BY 4.0)",
        observedAt: toIsoLocal(typeof cc.time === "string" ? cc.time : null),
        fetchedAt,
        spatialResolution: "model grid — forecast precipitation, not radar",
        status: "ok" as const,
        qualityNote: "Forecast/model precipitation — not a radar observation.",
      },
    };
  }

  let rainObservations = [rainObs(weather)];
  try {
    const multi = await getJson<ForecastPayload | ForecastPayload[]>(rainUrl);
    const list = Array.isArray(multi) ? multi : [multi];
    if (list.length) rainObservations = list.map(rainObs);
  } catch {
    /* keep single point */
  }

  let airStations: unknown[] = [];
  let airMeta = {
    source: "Open-Meteo Air Quality API · CAMS (CC-BY 4.0)",
    observedAt: null as string | null,
    fetchedAt,
    spatialResolution: "~45 km CAMS global model cell",
    status: "error" as const,
    message: "Air-quality fetch failed",
    qualityNote: undefined as string | undefined,
  };
  try {
    const air = await getJson<AirPayload>(airUrl);
    const ac = air.current ?? {};
    const aqi =
      typeof ac.us_aqi === "number"
        ? ac.us_aqi
        : typeof ac.european_aqi === "number"
          ? ac.european_aqi
          : null;
    const station = {
      id: `open-meteo-cams-${air.latitude.toFixed(2)}-${air.longitude.toFixed(2)}`,
      name: "CAMS model cell (Open-Meteo)",
      lon: air.longitude,
      lat: air.latitude,
      aqi,
      pm25: typeof ac.pm2_5 === "number" ? ac.pm2_5 : null,
      pm10: typeof ac.pm10 === "number" ? ac.pm10 : null,
      no2: typeof ac.nitrogen_dioxide === "number" ? ac.nitrogen_dioxide : null,
      so2: typeof ac.sulphur_dioxide === "number" ? ac.sulphur_dioxide : null,
      co: typeof ac.carbon_monoxide === "number" ? ac.carbon_monoxide : null,
      o3: typeof ac.ozone === "number" ? ac.ozone : null,
      readingKind: "model" as const,
      meta: {
        source: "Open-Meteo Air Quality API · CAMS (CC-BY 4.0)",
        observedAt: toIsoLocal(typeof ac.time === "string" ? ac.time : null),
        fetchedAt,
        spatialResolution: "~45 km CAMS global model cell",
        status: "ok" as const,
        qualityNote:
          "Modelled concentrations — not a CPCB monitoring station. AQI scale is US AQI when present.",
      },
    };
    airStations = [station];
    airMeta = station.meta;
  } catch {
    /* leave error meta */
  }

  return {
    bbox,
    traffic: {
      segments: [],
      incidents: [],
      meta: {
        source: "none",
        observedAt: null,
        fetchedAt,
        spatialResolution: "n/a",
        status: "unavailable" as const,
        message:
          "Live congestion unavailable — no free traffic-speed feed. OSM roads stay in the 3D scene.",
      },
    },
    weather: { observation, forecast, meta: weatherMeta },
    rainfall: {
      observations: rainObservations,
      meta: {
        source: "Open-Meteo Forecast API (CC-BY 4.0)",
        observedAt,
        fetchedAt,
        spatialResolution: "model forecast — not radar",
        status: "ok" as const,
        qualityNote: "Precipitation from weather model; not radar.",
      },
    },
    airQuality: { stations: airStations, meta: airMeta },
    floodRisk: {
      meta: {
        source: "none",
        observedAt: null,
        fetchedAt,
        spatialResolution: "terrain DEM in scene",
        status: "planned" as const,
        message: "Flood risk planned — no free live flood observation feed yet.",
      },
    },
    civicAlerts: {
      alerts: [],
      meta: {
        source: "none",
        observedAt: null,
        fetchedAt,
        spatialResolution: "n/a",
        status: "planned" as const,
        message: "Civic alerts planned — no free feed wired.",
      },
    },
  };
}
