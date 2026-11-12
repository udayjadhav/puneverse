import { HEIGHT_SOURCES, type HeightSource } from "@/scene/types";
import { SOURCE_DQ_RGB, provenanceFor } from "@/scene/provenance";
import { useSceneStore } from "@/store/sceneStore";
import { PANEL } from "./styles";

function swatch(src: HeightSource): string {
  const [r, g, b] = SOURCE_DQ_RGB[src];
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

/** Developer-only legend — hidden unless data-quality mode is on (Shift+D). */
export function DataQualityLegend() {
  const on = useSceneStore((s) => s.dataQualityMode);
  const counts = useSceneStore((s) => s.manifest?.stats.height_sources);
  if (!on) return null;

  return (
    <div
      className={`${PANEL} absolute top-[8.5rem] left-3 max-w-xs space-y-2 px-3 py-2.5 text-xs text-slate-200`}
      data-testid="dq-legend"
    >
      <p className="font-semibold text-slate-100">Data quality mode</p>
      <p className="text-[11px] text-slate-400">
        Hover a building for provenance. Estimates are never labelled as measured. Press Shift+D to exit.
      </p>
      <ul className="space-y-1">
        {HEIGHT_SOURCES.map((src) => {
          const p = provenanceFor(src);
          const n = counts?.[src];
          return (
            <li key={src} className="flex items-start gap-2">
              <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: swatch(src) }} />
              <span>
                <span className="text-slate-100">{p.label}</span>
                {typeof n === "number" && (
                  <span className="ml-1 font-mono text-slate-500">{n.toLocaleString("en-IN")}</span>
                )}
                <span className="block text-[10px] text-slate-500">
                  {p.confidence} · {p.estimate ? "estimate" : "mapped"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
