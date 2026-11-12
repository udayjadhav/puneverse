import { useMemo, useState } from "react";
import { noteMeaningfulInteraction, PV_EVENTS, track } from "@/analytics";
import { hitToPreset, searchScene } from "@/scene/search";
import { landmarkContentFor } from "@/scene/landmarks/content";
import { useSceneStore } from "@/store/sceneStore";
import { PANEL } from "./styles";

export function PlaceSearch() {
  const manifest = useSceneStore((s) => s.manifest);
  const requestFlyTo = useSceneStore((s) => s.requestFlyTo);
  const setSelected = useSceneStore((s) => s.setSelectedPlace);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const hits = useMemo(() => (manifest && q.trim() ? searchScene(manifest, q) : []), [manifest, q]);

  return (
    <div
      className={`${PANEL} pointer-events-auto absolute top-[4.75rem] left-3 w-[min(20rem,calc(100%-6rem))]`}
      data-testid="place-search"
    >
      <label className="sr-only" htmlFor="place-search-input">
        Search places
      </label>
      <input
        id="place-search-input"
        type="search"
        autoComplete="off"
        placeholder="Search places…"
        className="w-full rounded-md border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#f5a524]/60"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Allow click on results
          window.setTimeout(() => setOpen(false), 150);
        }}
        data-testid="place-search-input"
      />
      {open && hits.length > 0 && (
        <ul
          className="mt-1 max-h-64 overflow-y-auto rounded-md border border-white/10 bg-slate-950/95 py-1 text-sm shadow-xl"
          role="listbox"
          data-testid="place-search-results"
        >
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-white/10"
                role="option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  requestFlyTo(hitToPreset(h));
                  const content = landmarkContentFor(h.label);
                  setSelected({
                    label: h.label,
                    kind: h.category,
                    content,
                  });
                  noteMeaningfulInteraction();
                  track(PV_EVENTS.search_submitted, {
                    view: "scene",
                    query_len: q.trim().length,
                    hit_count: hits.length,
                  });
                  track(PV_EVENTS.search_result_selected, {
                    view: "scene",
                    place_name: h.label,
                    place_type: h.category,
                  });
                  if (content) {
                    track(PV_EVENTS.landmark_selected, {
                      view: "scene",
                      landmark_name: content.name_en,
                      place_type: content.category,
                    });
                  }
                  setQ(h.label);
                  setOpen(false);
                }}
                data-testid="place-search-hit"
              >
                <span className="text-slate-100">{h.label}</span>
                <span className="text-[11px] text-slate-500">
                  {h.category}
                  {h.name_mr ? ` · ${h.name_mr}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && q.trim().length > 0 && hits.length === 0 && (
        <p className="mt-1 px-2 py-2 text-xs text-slate-500" data-testid="place-search-empty">
          No matches in this bake.
        </p>
      )}
    </div>
  );
}
