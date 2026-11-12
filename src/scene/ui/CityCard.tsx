import { useSceneStore } from "@/store/sceneStore";
import { PANEL } from "./styles";

export function CityCard() {
  const buildings = useSceneStore((s) => s.manifest?.stats.buildings);
  return (
    <div className={`${PANEL} absolute top-3 left-3 px-4 py-2.5`} data-testid="city-card">
      <div className="flex items-baseline gap-2">
        <span className="text-base font-semibold tracking-[0.35em] text-slate-100">PUNE</span>
        <span className="text-sm font-semibold text-[#f5a524]">पुणे</span>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-400">
        Pune centre ·{" "}
        {buildings != null ? (
          <>
            <strong className="text-slate-200">{buildings.toLocaleString("en-IN")}</strong> buildings placed from
            the map
          </>
        ) : (
          "loading buildings…"
        )}
      </p>
    </div>
  );
}
