import { useLiveCityStore } from "@/live/liveCityStore";
import type { TrafficDensityMode } from "@/scene/engine/traffic";
import { PANEL, PILL, PILL_ACTIVE } from "@/scene/ui/styles";

const DENSITIES: { id: TrafficDensityMode; label: string }[] = [
  { id: "free", label: "Free" },
  { id: "moderate", label: "Moderate" },
  { id: "heavy", label: "Heavy" },
  { id: "jam", label: "Jam" },
];

/**
 * Simulation controls. Traffic is always labelled SIMULATED.
 * Weather FX follow Live City Open-Meteo when Live is on.
 */
export function SimControls() {
  const liveMode = useLiveCityStore((s) => s.liveMode);
  const weatherFx = useLiveCityStore((s) => s.weatherFxEnabled);
  const setWeatherFx = useLiveCityStore((s) => s.setWeatherFxEnabled);
  const previewRain = useLiveCityStore((s) => s.previewRain);
  const setPreviewRain = useLiveCityStore((s) => s.setPreviewRain);
  const trafficOn = useLiveCityStore((s) => s.trafficVisible);
  const setTraffic = useLiveCityStore((s) => s.setTrafficVisible);
  const speed = useLiveCityStore((s) => s.simSpeed);
  const setSpeed = useLiveCityStore((s) => s.setSimSpeed);
  const density = useLiveCityStore((s) => s.trafficDensity);
  const setDensity = useLiveCityStore((s) => s.setTrafficDensity);
  const paused = useLiveCityStore((s) => s.trafficPaused);
  const setPaused = useLiveCityStore((s) => s.setTrafficPaused);
  const snap = useLiveCityStore((s) => s.snapshot);

  if (!liveMode) return null;

  const wxStatus =
    snap.weather.meta.status === "ok"
      ? snap.rainfall.observations[0]?.kind === "forecast"
        ? "FORECAST DATA"
        : "LIVE DATA"
      : "UNAVAILABLE";

  return (
    <div
      className={`${PANEL} pointer-events-auto absolute top-[4.75rem] left-3 max-w-[min(15rem,calc(100%-1.5rem))] space-y-2 px-2.5 py-2 text-[10px] text-slate-300`}
      data-testid="sim-controls"
    >
      <p className="font-semibold tracking-[0.16em] text-[#f5a524] uppercase">Simulation</p>

      <div className="space-y-1">
        <p className="text-slate-500">Weather effects · {wxStatus}</p>
        <button
          type="button"
          className={`${PILL} w-full ${weatherFx ? PILL_ACTIVE : ""}`}
          aria-pressed={weatherFx}
          onClick={() => setWeatherFx(!weatherFx)}
          data-testid="sim-weather-fx"
        >
          Weather FX {weatherFx ? "on" : "off"}
        </button>
        <button
          type="button"
          className={`${PILL} w-full ${previewRain ? PILL_ACTIVE : ""}`}
          aria-pressed={previewRain}
          onClick={() => setPreviewRain(!previewRain)}
          data-testid="sim-preview-rain"
          title="Optional SIMULATED rain when the sky is dry. Off by default — real rain only."
        >
          Fake rain {previewRain ? "on (SIMULATED)" : "off"}
        </button>
      </div>

      <div className="space-y-1 border-t border-white/10 pt-2">
        <p className="text-amber-200/90">Vehicles · SIMULATED</p>
        <p className="text-slate-500">Not live GPS. OSM roads + procedural motion.</p>
        <button
          type="button"
          className={`${PILL} w-full ${trafficOn ? PILL_ACTIVE : ""}`}
          aria-pressed={trafficOn}
          onClick={() => setTraffic(!trafficOn)}
          data-testid="sim-traffic-toggle"
        >
          Vehicles {trafficOn ? "visible" : "hidden"}
        </button>
        <button
          type="button"
          className={`${PILL} w-full ${paused ? PILL_ACTIVE : ""}`}
          aria-pressed={paused}
          onClick={() => setPaused(!paused)}
          data-testid="sim-traffic-pause"
        >
          {paused ? "Resume" : "Pause"} traffic
        </button>
        <label className="flex items-center gap-2 text-slate-400">
          Speed
          <input
            type="range"
            min={0}
            max={3}
            step={0.25}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="min-w-0 flex-1 accent-[#f5a524]"
            data-testid="sim-speed"
          />
          <span className="w-6 font-mono text-slate-200">{speed.toFixed(1)}×</span>
        </label>
        <div className="flex flex-wrap gap-1">
          {DENSITIES.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`${PILL} px-2 ${density === d.id ? PILL_ACTIVE : ""}`}
              onClick={() => setDensity(d.id)}
              data-testid={`sim-density-${d.id}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
