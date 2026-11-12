import { useMapStore } from "@/store/mapStore";

/** On-map note so a mostly flat 3D view does not read as broken. */
export function HeightLegend() {
  const viewMode = useMapStore((s) => s.viewMode);
  const stats = useMapStore((s) => s.buildingStats);
  const buildingsOn = useMapStore((s) => s.layersEnabled.buildings);
  const setAboutOpen = useMapStore((s) => s.setAboutOpen);
  if (viewMode !== "3d" || !buildingsOn) return null;

  const pct = stats && stats !== "unavailable" ? `${stats.pct_with_height}% of buildings` : "Few buildings";

  return (
    <div
      className="pointer-events-auto absolute bottom-10 left-3 z-20 max-w-xs rounded-md border border-slate-700/80 bg-slate-950/85 px-3 py-2 text-xs text-slate-200 shadow backdrop-blur"
      data-testid="height-legend"
    >
      <p>
        <strong className="text-slate-100">Raised:</strong> height known ({pct}).{" "}
        <strong className="text-slate-100">Flat:</strong> no height in the source data yet.{" "}
        <button
          type="button"
          className="text-sky-300 underline"
          onClick={() => setAboutOpen(true)}
        >
          Why?
        </button>
      </p>
    </div>
  );
}
