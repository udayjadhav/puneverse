import { TIME_PRESETS, useSceneStore } from "@/store/sceneStore";
import { formatClock } from "./heightBreakdown";
import { PANEL, PILL } from "./styles";

export function BottomBar() {
  const presets = useSceneStore((s) => s.manifest?.presets);
  const requestFlyTo = useSceneStore((s) => s.requestFlyTo);
  const timeOfDay = useSceneStore((s) => s.timeOfDay);
  const setTimeOfDay = useSceneStore((s) => s.setTimeOfDay);

  return (
    <div
      className={`${PANEL} absolute right-3 bottom-3 w-[min(30rem,calc(100%-1.5rem))] space-y-2 px-3 py-2.5`}
      data-testid="bottom-bar"
    >
      {presets && presets.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 whitespace-nowrap" data-testid="preset-chips">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`${PILL} shrink-0`}
              onClick={() => requestFlyTo(p)}
              data-testid="preset-chip"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="w-[4.5rem] shrink-0 font-mono text-xs text-slate-100" data-testid="time-readout">
          {formatClock(timeOfDay)} IST
        </span>
        <input
          type="range"
          min={0}
          max={24}
          step={0.05}
          value={timeOfDay}
          onChange={(e) => setTimeOfDay(Number(e.target.value))}
          aria-label="Time of day"
          className="min-w-0 flex-1 accent-[#f5a524]"
          data-testid="time-slider"
        />
        <div className="flex shrink-0 gap-1">
          {TIME_PRESETS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${PILL} px-2`}
              onClick={() => setTimeOfDay(t.hour)}
              data-testid={`time-preset-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
