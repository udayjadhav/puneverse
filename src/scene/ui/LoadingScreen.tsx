import { useState } from "react";
import { useSceneStore } from "@/store/sceneStore";
import { PILL } from "./styles";

export function LoadingScreen() {
  const ready = useSceneStore((s) => s.ready);
  const stages = useSceneStore((s) => s.loadStages);
  const error = useSceneStore((s) => s.loadError);
  const setView = useSceneStore((s) => s.setView);
  const [faded, setFaded] = useState(ready);

  if (!ready && faded) setFaded(false);
  if (ready && faded) return null;

  const done = stages.filter((s) => s.done).length;
  const pct = stages.length > 0 ? (done / stages.length) * 100 : 0;
  const hiding = ready && !error;

  return (
    <div
      className={`absolute inset-0 z-50 flex items-center justify-center bg-slate-950 transition-opacity duration-700 ${
        hiding ? "pointer-events-none opacity-0" : "pointer-events-auto opacity-100"
      }`}
      onTransitionEnd={() => {
        if (hiding) setFaded(true);
      }}
      data-testid="loading-screen"
    >
      <div className="w-72 space-y-4 text-slate-200">
        <h1 className="flex items-baseline gap-2">
          <span className="text-xl font-semibold tracking-[0.35em]">PUNE</span>
          <span className="text-lg font-semibold text-[#f5a524]">पुणे</span>
        </h1>

        <ul className="space-y-1 text-xs" data-testid="load-stages">
          {stages.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              {s.done ? (
                <span className="w-3 text-center text-[#f5a524]" aria-label="done">
                  ✓
                </span>
              ) : error ? (
                <span className="w-3 text-center text-slate-600" aria-label="stopped">
                  ·
                </span>
              ) : (
                <span
                  className="inline-block h-3 w-3 animate-spin rounded-full border border-slate-500 border-t-transparent"
                  aria-label="loading"
                />
              )}
              <span className={s.done ? "text-slate-400" : "text-slate-200"}>{s.label}</span>
            </li>
          ))}
        </ul>

        <div className="h-0.5 w-full overflow-hidden rounded bg-white/10">
          <div
            className="h-full bg-[#f5a524] transition-[width] duration-300"
            style={{ width: `${pct}%` }}
            data-testid="load-progress"
          />
        </div>

        {error && (
          <div className="space-y-2 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs" role="alert">
            <p className="text-red-200" data-testid="load-error">
              The 3D city could not load: {error}
            </p>
            <button
              type="button"
              className={PILL}
              onClick={() => setView("map")}
              data-testid="open-map-instead"
            >
              Open 2D map instead
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
