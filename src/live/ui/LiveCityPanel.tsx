import { isLiveApiConfigured } from "@/live/client";
import { useLiveCityStore } from "@/live/liveCityStore";
import type { LiveDataMetadata, LiveLayerId, LiveSnapshot } from "@/live/types";
import { PILL } from "@/scene/ui/styles";

function MetaBlock({ meta }: { meta: LiveDataMetadata }) {
  return (
    <div className="mt-1 space-y-0.5 text-[11px] text-slate-400" data-testid="live-meta">
      <p>
        Status: <span className="text-slate-200">{meta.status}</span>
        {meta.message ? ` — ${meta.message}` : ""}
      </p>
      {meta.qualityNote && <p className="text-amber-200/80">{meta.qualityNote}</p>}
      <p>Source: {meta.source}</p>
      <p>Observed: {meta.observedAt ?? "—"}</p>
      <p>Fetched: {meta.fetchedAt ?? "—"}</p>
      <p>Resolution: {meta.spatialResolution}</p>
    </div>
  );
}

function layerMeta(id: LiveLayerId, snap: LiveSnapshot): LiveDataMetadata {
  switch (id) {
    case "traffic":
      return snap.traffic.meta;
    case "weather":
      return snap.weather.meta;
    case "rainfall":
      return snap.rainfall.meta;
    case "air_quality":
      return snap.airQuality.meta;
    case "flood_risk":
      return snap.floodRisk.meta;
    case "civic_alerts":
      return snap.civicAlerts.meta;
    default:
      return {
        source: "overview",
        observedAt: null,
        fetchedAt: snap.weather.meta.fetchedAt,
        spatialResolution: "city bbox",
        status: snap.weather.meta.status === "ok" ? "ok" : "unavailable",
        message: "Pick a layer. Weather uses Open-Meteo (shared city sample).",
      };
  }
}

function LayerBody({ layer, snap }: { layer: LiveLayerId; snap: LiveSnapshot }) {
  const w = snap.weather.observation;
  const hasWeather = w && snap.weather.meta.status === "ok" && w.tempC != null;

  if (layer === "overview") {
    return (
      <ul className="mt-1 space-y-0.5 text-slate-200" data-testid="live-overview">
        <li>Weather: {snap.weather.meta.status}</li>
        <li>Rainfall: {snap.rainfall.meta.status}</li>
        <li>Air quality: {snap.airQuality.meta.status}</li>
        <li>Traffic: {snap.traffic.meta.status}</li>
        <li>Flood / civic: planned</li>
      </ul>
    );
  }

  if (layer === "weather" && hasWeather) {
    return (
      <ul className="mt-1 space-y-0.5 text-slate-200" data-testid="live-weather-readings">
        <li>
          {w!.tempC}°C
          {w!.feelsLikeC != null ? ` · feels ${w!.feelsLikeC}°C` : ""}
        </li>
        {w!.condition && <li>{w!.condition}</li>}
        {w!.humidityPct != null && <li>Humidity {w!.humidityPct}%</li>}
        {w!.windKmh != null && (
          <li>
            Wind {w!.windKmh} km/h
            {w!.windDirDeg != null ? ` · ${Math.round(w!.windDirDeg)}°` : ""}
          </li>
        )}
        {w!.cloudPct != null && <li>Cloud cover {w!.cloudPct}%</li>}
        {w!.pressureHpa != null && <li>Pressure {w!.pressureHpa} hPa</li>}
        {w!.uvIndex != null && <li>UV index {w!.uvIndex}</li>}
        {w!.visibilityKm != null && <li>Visibility {w!.visibilityKm.toFixed(1)} km</li>}
        {snap.weather.forecast.length > 0 && (
          <li className="text-slate-400">{snap.weather.forecast.length} hourly forecast steps</li>
        )}
      </ul>
    );
  }

  if (layer === "rainfall" && snap.rainfall.observations.length > 0 && snap.rainfall.meta.status === "ok") {
    const pts = snap.rainfall.observations;
    const max = Math.max(...pts.map((p) => p.intensityMmH ?? 0));
    return (
      <ul className="mt-1 space-y-0.5 text-slate-200" data-testid="live-rainfall-readings">
        <li>
          Peak intensity {max.toFixed(2)} mm/h across {pts.length} sample
          {pts.length === 1 ? "" : "s"}
        </li>
        <li className="text-slate-400">Kind: {pts[0]?.kind ?? "forecast"} (not radar)</li>
        {pts[0]?.probabilityPct != null && <li>Precip probability {pts[0].probabilityPct}%</li>}
      </ul>
    );
  }

  if (layer === "air_quality" && snap.airQuality.stations.length > 0) {
    const st = snap.airQuality.stations[0]!;
    return (
      <ul className="mt-1 space-y-0.5 text-slate-200" data-testid="live-aqi-readings">
        <li className="font-medium">{st.name}</li>
        <li>
          AQI: {st.aqi ?? "—"} ({st.readingKind})
        </li>
        {st.pm25 != null && <li>PM2.5: {st.pm25} µg/m³</li>}
        {st.pm10 != null && <li>PM10: {st.pm10} µg/m³</li>}
        {st.no2 != null && <li>NO₂: {st.no2} µg/m³</li>}
        {st.o3 != null && <li>O₃: {st.o3} µg/m³</li>}
        {st.readingKind === "model" && (
          <li className="text-amber-200/90">Model cell — not a CPCB station reading.</li>
        )}
      </ul>
    );
  }

  if (layer === "traffic") {
    return (
      <p className="mt-1 text-slate-400" data-testid="live-traffic-unavailable">
        Live congestion is unavailable. Road geometry comes from OpenStreetMap in the 3D scene. We do
        not paint fake green/orange/red traffic.
      </p>
    );
  }

  return (
    <p className="mt-1 text-slate-400" data-testid="live-no-readings">
      No live readings for this layer. PuneVerse never invents traffic, weather, rainfall or AQI
      values.
    </p>
  );
}

/**
 * Location intelligence panel. Shows real provider data when present;
 * otherwise an honest unavailable / planned state — never invented numbers.
 */
export function LiveCityPanel() {
  const liveMode = useLiveCityStore((s) => s.liveMode);
  const open = useLiveCityStore((s) => s.panelOpen);
  const setOpen = useLiveCityStore((s) => s.setPanelOpen);
  const layer = useLiveCityStore((s) => s.activeLayer);
  const location = useLiveCityStore((s) => s.location);
  const snap = useLiveCityStore((s) => s.snapshot);
  const fetching = useLiveCityStore((s) => s.fetching);
  const err = useLiveCityStore((s) => s.lastFetchError);
  const refresh = useLiveCityStore((s) => s.refresh);

  if (!liveMode || !open) return null;

  const meta = layerMeta(layer, snap);

  return (
    <div
      className="pointer-events-auto absolute right-3 bottom-24 z-20 w-[min(22rem,calc(100%-1.5rem))] rounded-xl border border-white/10 bg-slate-950/92 p-3 text-xs text-slate-300 shadow-2xl backdrop-blur"
      data-testid="live-city-panel"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-[#f5a524] uppercase">Location</p>
          <p className="text-sm font-semibold text-slate-100">{location?.label ?? "Pune scene"}</p>
          {location?.lat != null && location.lon != null && (
            <p className="font-mono text-[10px] text-slate-500">
              {location.lat.toFixed(4)}° N {location.lon.toFixed(4)}° E
            </p>
          )}
        </div>
        <button type="button" className={PILL} onClick={() => setOpen(false)} data-testid="live-panel-close">
          Close
        </button>
      </div>

      <section className="border-t border-white/10 pt-2">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-[#f5a524] uppercase">
          {layer.replace(/_/g, " ")}
        </p>
        <LayerBody layer={layer} snap={snap} />
        <MetaBlock meta={meta} />
      </section>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2 text-[10px] text-slate-500">
        <span data-testid="live-api-config">
          {isLiveApiConfigured()
            ? "API: Worker"
            : "API: Open-Meteo direct (no Worker)"}
        </span>
        <span>Attribution: Open-Meteo · CC-BY 4.0</span>
        {fetching && <span>Refreshing…</span>}
        {err && <span className="text-amber-400">{err}</span>}
        <button type="button" className={PILL} onClick={() => void refresh()} data-testid="live-refresh">
          Refresh
        </button>
      </div>
    </div>
  );
}
