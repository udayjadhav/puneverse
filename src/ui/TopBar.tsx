import { noteMeaningfulInteraction, PV_EVENTS, track } from "@/analytics";
import { getDefaultCityConfig } from "@/config/loadCityConfig";
import { useMapStore } from "@/store/mapStore";

const city = getDefaultCityConfig();

export function TopBar() {
  const theme = useMapStore((s) => s.theme);
  const toggleTheme = useMapStore((s) => s.toggleTheme);
  const resetView = useMapStore((s) => s.resetView);
  const viewMode = useMapStore((s) => s.viewMode);
  const toggleViewMode = useMapStore((s) => s.toggleViewMode);
  const setAboutOpen = useMapStore((s) => s.setAboutOpen);

  return (
    <header className="pointer-events-none absolute top-0 right-0 left-0 z-30 flex items-start justify-between gap-3 p-3">
      <div className="pointer-events-auto max-w-md rounded-lg border border-amber-500/40 bg-slate-950/90 px-3 py-2 text-slate-100 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-sm font-semibold tracking-tight">PuneVerse</h1>
          <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-200 uppercase">
            Open data
          </span>
        </div>
        <p className="text-xs text-slate-300">{city.display_name} · 2D map view (optional)</p>
      </div>
      <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="rounded-md border border-slate-600 bg-slate-950/90 px-3 py-1.5 text-sm text-slate-100 shadow backdrop-blur hover:bg-slate-800"
          onClick={() => {
            toggleTheme();
            noteMeaningfulInteraction();
            track(PV_EVENTS.map_theme_changed, {
              view: "map",
              map_theme: theme === "day" ? "night" : "day",
            });
          }}
          aria-pressed={theme === "night"}
          title="Switches basemap lighting style only — not a live day/night view of the city"
          aria-label={
            theme === "day"
              ? "Switch to night lighting style (basemap only, not live city)"
              : "Switch to day lighting style (basemap only, not live city)"
          }
        >
          {theme === "day" ? "Night" : "Day"}
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-600 bg-slate-950/90 px-3 py-1.5 text-sm text-slate-100 shadow backdrop-blur hover:bg-slate-800"
          onClick={() => resetView()}
          title={`Back to the city center in ${viewMode === "3d" ? "3D" : "flat"} view`}
        >
          Reset view
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-600 bg-slate-950/90 px-3 py-1.5 text-sm text-slate-100 shadow backdrop-blur hover:bg-slate-800"
          onClick={() => {
            toggleViewMode();
            noteMeaningfulInteraction();
            track(PV_EVENTS.map_view_mode_changed, {
              view: "map",
              map_view_mode: viewMode === "3d" ? "flat" : "3d",
            });
          }}
          aria-pressed={viewMode === "flat"}
          data-testid="view-mode-toggle"
          title={
            viewMode === "3d"
              ? "Switch to flat view: no tilt, no raised buildings"
              : "Switch to 3D view: tilted, buildings with known height raised"
          }
        >
          {viewMode === "3d" ? "Flat" : "3D"}
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-600 bg-slate-950/90 px-3 py-1.5 text-sm text-slate-100 shadow backdrop-blur hover:bg-slate-800"
          onClick={() => {
            noteMeaningfulInteraction();
            track(PV_EVENTS.about_opened, { view: "map" });
            setAboutOpen(true);
          }}
        >
          About / honesty
        </button>
      </div>
    </header>
  );
}
