import { getDefaultCityConfig } from "@/config/loadCityConfig";
import { heightCoverageLines } from "@/map/buildingStats";
import { LAYER_IDS, useMapStore, type LayerId } from "@/store/mapStore";

const city = getDefaultCityConfig();
const LAYER_ORDER: LayerId[] = LAYER_IDS.filter((id) => city.layers[id]);

const READY_HINT: Partial<Record<LayerId, string>> = {
  terrain: "Real elevation, true scale. Wider than the center area.",
  trees: "Only trees surveyed in OpenStreetMap — not full tree cover.",
};

function statusHint(id: LayerId, status: string | undefined): string | null {
  if (status === "stub") {
    return "Unavailable — no real geometry loaded.";
  }
  if (status === "sample") {
    return "SAMPLE — illustrative only; not official boundaries.";
  }
  if (status === "ready") {
    return READY_HINT[id] ?? "Real map data — center area only.";
  }
  return null;
}

function BuildingsCoverage() {
  const stats = useMapStore((s) => s.buildingStats);
  if (stats === null) {
    return <span className="block text-xs text-slate-400">Loading height coverage…</span>;
  }
  if (stats === "unavailable") {
    return (
      <span className="block text-xs text-amber-300/90">
        Height coverage numbers unavailable — run the pipeline bake.
      </span>
    );
  }
  const [shown, sources, flat] = heightCoverageLines(stats);
  return (
    <span className="mt-0.5 block space-y-0.5 text-xs text-slate-300" data-testid="height-coverage">
      <span className="block">{shown}</span>
      <span className="block">{sources}</span>
      <span className="block">{flat}</span>
    </span>
  );
}

export function LayerPanel() {
  const layersEnabled = useMapStore((s) => s.layersEnabled);
  const toggleLayer = useMapStore((s) => s.toggleLayer);

  return (
    <section
      className="rounded-lg border border-slate-700/80 bg-slate-950/85 p-3 text-slate-100 shadow-lg backdrop-blur"
      aria-label="Map layers"
    >
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-300 uppercase">
        Layers
      </h2>
      <ul className="space-y-2">
        {LAYER_ORDER.map((id) => {
          const meta = city.layers[id];
          const hint = statusHint(id, meta?.status);
          const unavailable = meta?.status === "stub";
          return (
            <li key={id} className="flex items-start gap-2 text-sm">
              <input
                id={`layer-${id}`}
                type="checkbox"
                className="mt-0.5"
                checked={layersEnabled[id]}
                disabled={unavailable}
                aria-describedby={hint ? `layer-${id}-hint` : undefined}
                onChange={() => toggleLayer(id)}
              />
              <label
                htmlFor={`layer-${id}`}
                className={`leading-snug ${unavailable ? "cursor-default text-slate-400" : "cursor-pointer"}`}
              >
                <span>{meta?.label ?? id}</span>
                {hint ? (
                  <span id={`layer-${id}-hint`} className="mt-0.5 block text-xs text-amber-300/90">
                    {hint}
                  </span>
                ) : null}
                {id === "buildings" ? <BuildingsCoverage /> : null}
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
