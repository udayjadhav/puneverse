import { LIVE_LAYERS, type LiveLayerId } from "@/live/types";
import { useLiveCityStore } from "@/live/liveCityStore";
import { PANEL, PILL, PILL_ACTIVE } from "@/scene/ui/styles";

function layerStatus(id: LiveLayerId, snap: ReturnType<typeof useLiveCityStore.getState>["snapshot"]): string {
  switch (id) {
    case "overview":
      return "status";
    case "traffic":
      return snap.traffic.meta.status;
    case "weather":
      return snap.weather.meta.status;
    case "rainfall":
      return snap.rainfall.meta.status;
    case "air_quality":
      return snap.airQuality.meta.status;
    case "flood_risk":
      return snap.floodRisk.meta.status;
    case "civic_alerts":
      return snap.civicAlerts.meta.status;
  }
}

export function LiveLayerSelector() {
  const liveMode = useLiveCityStore((s) => s.liveMode);
  const active = useLiveCityStore((s) => s.activeLayer);
  const setActive = useLiveCityStore((s) => s.setActiveLayer);
  const snap = useLiveCityStore((s) => s.snapshot);
  if (!liveMode) return null;

  return (
    <div
      className={`${PANEL} pointer-events-auto absolute top-[4.75rem] right-3 max-w-[min(16rem,calc(100%-1.5rem))] space-y-1.5 px-2 py-2`}
      data-testid="live-layer-selector"
    >
      <p className="px-1 text-[10px] font-semibold tracking-[0.18em] text-[#f5a524] uppercase">Live city</p>
      <div className="flex flex-col gap-1">
        {LIVE_LAYERS.map((l) => {
          const st = layerStatus(l.id, snap);
          return (
            <button
              key={l.id}
              type="button"
              className={`${PILL} w-full justify-between px-2.5 text-left ${active === l.id ? PILL_ACTIVE : ""}`}
              onClick={() => setActive(l.id)}
              data-testid={`live-layer-${l.id}`}
            >
              <span>{l.label}</span>
              <span className="ml-2 font-mono text-[10px] text-slate-500">{st}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
