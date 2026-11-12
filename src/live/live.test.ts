import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { fetchLiveSnapshot, isLiveApiConfigured, liveApiBase } from "./client";
import { emptyLiveSnapshot, LIVE_LAYERS, PUNE_SCENE_BBOX } from "./types";
import { useLiveCityStore } from "./liveCityStore";
import { wmoCondition } from "./providers/openMeteo";

describe("emptyLiveSnapshot", () => {
  it("never invents observations", () => {
    const s = emptyLiveSnapshot(PUNE_SCENE_BBOX);
    expect(s.traffic.segments).toEqual([]);
    expect(s.weather.observation).toBeNull();
    expect(s.rainfall.observations).toEqual([]);
    expect(s.airQuality.stations).toEqual([]);
    expect(s.traffic.meta.status).toBe("unavailable");
    expect(s.floodRisk.meta.status).toBe("planned");
    expect(LIVE_LAYERS.map((l) => l.id)).toContain("traffic");
  });
});

describe("wmoCondition", () => {
  it("maps known codes", () => {
    expect(wmoCondition(0)).toBe("Clear sky");
    expect(wmoCondition(61)).toBe("Slight rain");
    expect(wmoCondition(null)).toBeNull();
  });
});

describe("live client without Worker base", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_LIVE_API_BASE", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is not Worker-configured", () => {
    expect(liveApiBase()).toBeNull();
    expect(isLiveApiConfigured()).toBe(false);
  });

  it("uses Open-Meteo fallback and maps real fields (mocked)", async () => {
    const forecast = {
      latitude: 18.52,
      longitude: 73.85,
      current: {
        time: "2026-11-12T14:15",
        temperature_2m: 30,
        apparent_temperature: 29.2,
        relative_humidity_2m: 27,
        precipitation: 0,
        weather_code: 1,
        cloud_cover: 23,
        pressure_msl: 1014.3,
        wind_speed_10m: 9.2,
        wind_direction_10m: 64,
        visibility: 16460,
      },
      hourly: {
        time: ["2026-11-12T14:00"],
        temperature_2m: [30],
        precipitation: [0],
        precipitation_probability: [0],
        weather_code: [1],
        uv_index: [7],
      },
    };
    const air = {
      latitude: 18.5,
      longitude: 73.9,
      current: {
        time: "2026-11-12T13:30",
        us_aqi: 83,
        pm2_5: 26.5,
        pm10: 32.5,
        carbon_monoxide: 200,
        nitrogen_dioxide: 0.5,
        sulphur_dioxide: 9.1,
        ozone: 163,
      },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes("air-quality")) {
          return new Response(JSON.stringify(air), { status: 200 });
        }
        return new Response(JSON.stringify(forecast), { status: 200 });
      }),
    );

    const s = await fetchLiveSnapshot(PUNE_SCENE_BBOX);
    expect(s.weather.meta.status).toBe("ok");
    expect(s.weather.observation?.tempC).toBe(30);
    expect(s.weather.observation?.condition).toBe("Mainly clear");
    expect(s.weather.observation?.weatherCode).toBe(1);
    expect(s.rainfall.meta.status).toBe("ok");
    expect(s.airQuality.stations[0]?.readingKind).toBe("model");
    expect(s.airQuality.stations[0]?.aqi).toBe(83);
    expect(s.traffic.meta.status).toBe("unavailable");
    expect(s.traffic.segments).toEqual([]);
  });
});

describe("liveCityStore", () => {
  it("starts with live mode off and unavailable snapshot", () => {
    useLiveCityStore.setState({
      liveMode: false,
      snapshot: emptyLiveSnapshot(PUNE_SCENE_BBOX),
      lastFetchError: null,
    });
    const s = useLiveCityStore.getState();
    expect(s.liveMode).toBe(false);
    expect(s.snapshot.airQuality.stations).toEqual([]);
  });
});
