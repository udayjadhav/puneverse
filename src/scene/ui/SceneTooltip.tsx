import { useSceneStore } from "@/store/sceneStore";

const OFFSET = 14;

export function SceneTooltip() {
  const hover = useSceneStore((s) => s.hover);
  const labels = useSceneStore((s) => s.manifest?.stats.height_source_labels);
  if (!hover) return null;

  const { info, x, y } = hover;
  const sourceLabel = labels?.[info.source] ?? info.source;

  return (
    <div
      className="pointer-events-none absolute z-30 max-w-xs rounded-lg border border-white/10 bg-slate-950/85 px-2.5 py-1.5 text-xs text-slate-200 shadow-lg backdrop-blur"
      style={{ left: x + OFFSET, top: y + OFFSET }}
      data-testid="scene-tooltip"
    >
      <p className="font-semibold text-slate-100">{info.name || info.kind}</p>
      <p>
        {info.height.toFixed(0)} m · ~{info.floors} floors
      </p>
      <p className="text-[11px] text-slate-400">
        Height: {sourceLabel}
        {info.source !== "mapped" && " (estimate)"}
      </p>
    </div>
  );
}
