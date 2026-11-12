import { tooltipText } from "@/map/buildingInfo";
import { useMapStore } from "@/store/mapStore";

/** Minimal hover / click label: building name, else its type. */
export function BuildingTooltip() {
  const tooltip = useMapStore((s) => s.tooltip);
  if (!tooltip) return null;
  return (
    <div
      className="pointer-events-none absolute z-30 max-w-[14rem] -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-md bg-slate-950/90 px-2 py-1 text-xs font-medium text-slate-100 shadow"
      style={{ left: tooltip.x, top: tooltip.y }}
      role="tooltip"
      data-testid="building-tooltip"
    >
      {tooltipText(tooltip.info)}
    </div>
  );
}
