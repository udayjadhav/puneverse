import { useLiveCityStore } from "@/live/liveCityStore";
import { PANEL } from "@/scene/ui/styles";

const TRAFFIC = [
  { c: "#22c55e", t: "Free flow" },
  { c: "#eab308", t: "Moderate" },
  { c: "#f97316", t: "Slow" },
  { c: "#ef4444", t: "Heavy" },
  { c: "#7f1d1d", t: "Severe (if provided)" },
];

const AQI = [
  { c: "#22c55e", t: "Good" },
  { c: "#eab308", t: "Moderate" },
  { c: "#f97316", t: "Poor" },
  { c: "#ef4444", t: "Very poor" },
  { c: "#7f1d1d", t: "Severe" },
];

/** Colour legend — explanatory only until overlays have real data. */
export function LiveLegend() {
  const liveMode = useLiveCityStore((s) => s.liveMode);
  const layer = useLiveCityStore((s) => s.activeLayer);
  if (!liveMode) return null;
  if (layer !== "traffic" && layer !== "air_quality" && layer !== "rainfall") return null;

  const rows = layer === "air_quality" ? AQI : TRAFFIC;
  const title =
    layer === "air_quality" ? "AQI colours (when stations load)" : layer === "rainfall" ? "Rain intensity (when radar loads)" : "Traffic colours (when segments load)";

  return (
    <div
      className={`${PANEL} pointer-events-none absolute bottom-24 left-3 max-w-[14rem] space-y-1.5 px-2.5 py-2 text-[10px] text-slate-300`}
      data-testid="live-legend"
    >
      <p className="font-semibold text-slate-100">{title}</p>
      <ul className="space-y-1">
        {(layer === "rainfall"
          ? [
              { c: "#93c5fd", t: "Light" },
              { c: "#3b82f6", t: "Moderate" },
              { c: "#1d4ed8", t: "Heavy" },
            ]
          : rows
        ).map((r) => (
          <li key={r.t} className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: r.c }} />
            {r.t}
          </li>
        ))}
      </ul>
      <p className="text-slate-500">Legend only — overlays appear after a live provider responds.</p>
    </div>
  );
}
