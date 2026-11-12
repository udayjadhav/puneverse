import { describe, expect, it } from "vitest";
import { emptyLiveSnapshot, PUNE_SCENE_BBOX, type LiveSnapshot } from "@/live/types";
import { isThunderCode, kindFromInputs, weatherParamsFromSnapshot, withPreviewRain } from "./weatherMap";

function snapWithWeather(partial: Partial<LiveSnapshot["weather"]["observation"]> & { weatherCode?: number | null }): LiveSnapshot {
  const base = emptyLiveSnapshot(PUNE_SCENE_BBOX);
  base.weather.meta.status = "ok";
  base.weather.meta.source = "Open-Meteo";
  base.weather.observation = {
    lon: 73.85,
    lat: 18.52,
    tempC: 30,
    feelsLikeC: 29,
    humidityPct: 40,
    windKmh: 12,
    windDirDeg: 90,
    cloudPct: 40,
    pressureHpa: 1013,
    uvIndex: 5,
    visibilityKm: 10,
    condition: "Mainly clear",
    weatherCode: 1,
    meta: base.weather.meta,
    ...partial,
  };
  base.rainfall.meta.status = "ok";
  base.rainfall.observations = [
    {
      lon: 73.85,
      lat: 18.52,
      intensityMmH: 0,
      accumulationMm: null,
      probabilityPct: 0,
      kind: "forecast",
      meta: base.rainfall.meta,
    },
  ];
  return base;
}

describe("weatherMap", () => {
  it("returns UNAVAILABLE clear when snapshot has no weather", () => {
    const p = weatherParamsFromSnapshot(emptyLiveSnapshot(PUNE_SCENE_BBOX));
    expect(p.kind).toBe("clear");
    expect(p.rainDensity).toBe(0);
    expect(p.provenance).toBe("UNAVAILABLE");
  });

  it("maps thunder codes only for thunderstorm lightning", () => {
    expect(isThunderCode(95)).toBe(true);
    expect(isThunderCode(61)).toBe(false);
    expect(kindFromInputs(95, 2, 80, 8)).toBe("thunderstorm");
    expect(kindFromInputs(61, 1, 80, 8)).toBe("light_rain");
  });

  it("drives rain density from precip / codes without inventing when unavailable", () => {
    const heavy = snapWithWeather({ weatherCode: 65, condition: "Heavy rain" });
    heavy.rainfall.observations[0]!.intensityMmH = 0;
    const p = weatherParamsFromSnapshot(heavy);
    expect(p.kind).toBe("heavy_rain");
    expect(p.rainDensity).toBeGreaterThan(0.4);
    expect(p.lightningEnabled).toBe(false);
    expect(p.wetness).toBeGreaterThan(0.2);
  });

  it("enables lightning only for thunderstorm", () => {
    const t = snapWithWeather({ weatherCode: 95, condition: "Thunderstorm" });
    const p = weatherParamsFromSnapshot(t);
    expect(p.kind).toBe("thunderstorm");
    expect(p.lightningEnabled).toBe(true);
  });

  it("preview rain fills dry live weather as SIMULATED", () => {
    const dry = weatherParamsFromSnapshot(snapWithWeather({ weatherCode: 1, condition: "Mainly clear" }));
    expect(dry.rainDensity).toBe(0);
    const preview = withPreviewRain(dry, true);
    expect(preview.provenance).toBe("SIMULATED");
    expect(preview.rainDensity).toBeGreaterThan(0.2);
    expect(withPreviewRain(dry, false).rainDensity).toBe(0);
  });
});
