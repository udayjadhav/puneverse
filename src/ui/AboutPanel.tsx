import { getDefaultCityConfig } from "@/config/loadCityConfig";
import { heightCoverageLines } from "@/map/buildingStats";
import { useMapStore } from "@/store/mapStore";

const city = getDefaultCityConfig();

function HeightCoverage() {
  const stats = useMapStore((s) => s.buildingStats);
  if (stats === null || stats === "unavailable") {
    return (
      <span className="mt-1 block text-slate-400">
        Height coverage numbers {stats === null ? "are loading" : "are unavailable (bake not run)"}.
      </span>
    );
  }
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-300" data-testid="about-height-coverage">
      {heightCoverageLines(stats).map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

function DataViewToggle() {
  const dataView = useMapStore((s) => s.dataView);
  const setDataView = useMapStore((s) => s.setDataView);
  return (
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        className="mt-1"
        checked={dataView}
        onChange={(e) => setDataView(e.target.checked)}
        data-testid="data-view-toggle"
      />
      <span>
        <strong className="text-slate-100">Data details:</strong> when on,
        clicking a building opens a panel with its height source, footprint
        source and ids.
      </span>
    </label>
  );
}

export function AboutPanel() {
  const open = useMapStore((s) => s.aboutOpen);
  const setAboutOpen = useMapStore((s) => s.setAboutOpen);
  if (!open) return null;

  const h = city.honesty;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      onClick={() => setAboutOpen(false)}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl border border-slate-600 bg-slate-950 p-5 text-slate-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-amber-300 uppercase">
              SHIP HOLD
            </p>
            <h2 id="about-title" className="text-lg font-semibold">
              About PuneVerse
            </h2>
            <p className="text-sm text-slate-400">{city.display_name}</p>
          </div>
          <button
            type="button"
            className="rounded border border-slate-600 px-2 py-1 text-sm hover:bg-slate-800"
            onClick={() => setAboutOpen(false)}
          >
            Close
          </button>
        </div>
        <ul className="space-y-3 text-sm leading-relaxed text-slate-200">
          <li>
            <strong className="text-slate-100">Day / night:</strong> {h.day_night}
          </li>
          <li>
            <strong className="text-slate-100">Heights:</strong> {h.heights}
            <HeightCoverage />
          </li>
          <li>
            <strong className="text-slate-100">Other layers:</strong> Water,
            parks, rail, metro and place names are real OpenStreetMap data for
            the center area. Admin boundaries are SAMPLE (illustrative, not
            official wards).
          </li>
          {h.terrain ? (
            <li>
              <strong className="text-slate-100">Terrain:</strong> {h.terrain}
            </li>
          ) : null}
          {h.trees ? (
            <li>
              <strong className="text-slate-100">Trees:</strong> {h.trees}
            </li>
          ) : null}
          {h.camera ? (
            <li>
              <strong className="text-slate-100">Camera:</strong> {h.camera}
            </li>
          ) : null}
          <li>
            <strong className="text-slate-100">Extent:</strong> {h.extent}
          </li>
          <li>
            <strong className="text-slate-100">Search:</strong> {h.search_limits}
          </li>
          <li>
            <strong className="text-slate-100">Status:</strong> {h.ship_hold}
          </li>
          <li>
            <DataViewToggle />
          </li>
          <li>
            <strong className="text-slate-100">Attribution:</strong>{" "}
            {h.attribution}{" "}
            <a
              className="text-sky-300 underline"
              href={city.attribution.osm_url}
              target="_blank"
              rel="noreferrer"
            >
              OSM copyright
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
