import { confidenceLabel, provenanceFor } from "@/scene/provenance";
import { useSceneStore } from "@/store/sceneStore";

const OFFSET = 14;

export function SceneTooltip() {
  const hover = useSceneStore((s) => s.hover);
  const dq = useSceneStore((s) => s.dataQualityMode);
  const labels = useSceneStore((s) => s.manifest?.stats.height_source_labels);
  if (!hover) return null;

  const { info, x, y } = hover;
  const prov = provenanceFor(info.source);
  const sourceLabel = labels?.[info.source] ?? prov.label;

  return (
    <div
      className="pointer-events-none absolute z-30 max-w-sm rounded-lg border border-white/10 bg-slate-950/90 px-2.5 py-1.5 text-xs text-slate-200 shadow-lg backdrop-blur"
      style={{ left: x + OFFSET, top: y + OFFSET }}
      data-testid="scene-tooltip"
    >
      <p className="font-semibold text-slate-100">{info.name || info.kind}</p>
      <p>
        {info.height.toFixed(0)} m · ~{info.floors} floors
      </p>
      <p className="text-[11px] text-slate-400">
        Height: {sourceLabel}
        {prov.estimate && " (estimate)"}
      </p>
      {dq && (
        <div className="mt-1.5 space-y-0.5 border-t border-white/10 pt-1.5 text-[11px] text-slate-300" data-testid="dq-tooltip">
          <p>
            <span className="text-slate-500">Confidence:</span> {confidenceLabel(prov.confidence)}
          </p>
          <p>
            <span className="text-slate-500">Source code:</span>{" "}
            <span className="font-mono">{info.source}</span>
          </p>
          <p className="text-slate-400">{prov.methodology}</p>
        </div>
      )}
    </div>
  );
}
