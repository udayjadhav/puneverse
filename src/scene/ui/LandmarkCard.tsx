import { useSceneStore } from "@/store/sceneStore";
import { PILL } from "./styles";

/** Compact info card for a selected landmark / place — not a permanent side panel. */
export function LandmarkCard() {
  const selected = useSceneStore((s) => s.selectedPlace);
  const clear = useSceneStore((s) => s.clearSelectedPlace);
  if (!selected) return null;

  const c = selected.content;

  return (
    <div
      className="pointer-events-auto absolute right-3 bottom-24 z-20 w-[min(22rem,calc(100%-1.5rem))] rounded-xl border border-white/10 bg-slate-950/92 p-3 text-xs text-slate-300 shadow-2xl backdrop-blur"
      data-testid="landmark-card"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-100">{c?.name_en ?? selected.label}</p>
          {c?.name_mr && <p className="text-[11px] text-slate-400">{c.name_mr}</p>}
          <p className="mt-0.5 text-[11px] tracking-wide text-[#f5a524] uppercase">
            {c?.category ?? selected.kind}
          </p>
        </div>
        <button type="button" className={PILL} onClick={clear} aria-label="Close" data-testid="landmark-card-close">
          Close
        </button>
      </div>
      {c ? (
        <>
          <p className="leading-relaxed text-slate-300">{c.summary_en}</p>
          <ul className="mt-2 space-y-1" data-testid="landmark-sources">
            {c.sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#7eb8ff] underline-offset-2 hover:underline"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-slate-500">
            Verification: {c.verification === "verified" ? "curated with public sources" : "needs review"} · Map
            position from OpenStreetMap / bake
          </p>
        </>
      ) : (
        <p className="text-slate-400">
          Named place from the open-data bake. No curated description yet — position follows OpenStreetMap.
        </p>
      )}
    </div>
  );
}
