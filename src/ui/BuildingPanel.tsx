import { buildingDetailRows } from "@/map/buildingInfo";
import { useMapStore } from "@/store/mapStore";

export function BuildingPanel() {
  const info = useMapStore((s) => s.selectedBuilding);
  const dataView = useMapStore((s) => s.dataView);
  const selectBuilding = useMapStore((s) => s.selectBuilding);
  // Technical provenance is an advanced view (About → Data details), not the default.
  if (!info || !dataView) return null;

  return (
    <section
      className="pointer-events-auto absolute right-3 bottom-10 z-30 w-80 max-w-[calc(100vw-1.5rem)] rounded-lg border border-slate-700/80 bg-slate-950/90 p-3 text-slate-100 shadow-lg backdrop-blur"
      aria-label="Selected building"
      aria-live="polite"
      data-testid="building-panel"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
          Building
        </h2>
        <button
          type="button"
          className="rounded border border-slate-600 px-1.5 text-xs hover:bg-slate-800"
          onClick={() => selectBuilding(null)}
          aria-label="Close building details"
        >
          Close
        </button>
      </div>
      <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1 text-sm">
        {buildingDetailRows(info).map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-slate-400">{row.label}</dt>
            <dd className="break-words">
              {row.href ? (
                <a
                  className="text-sky-300 underline"
                  href={row.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {row.value}
                </a>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
