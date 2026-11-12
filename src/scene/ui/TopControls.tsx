import { useSceneStore, type DetailLevel } from "@/store/sceneStore";
import { PANEL, PILL, PILL_ACTIVE } from "./styles";

const DETAIL_OPTIONS: { value: DetailLevel; label: string }[] = [
  { value: "low", label: "Low detail" },
  { value: "medium", label: "Medium detail" },
  { value: "high", label: "High detail" },
  { value: "ultra", label: "Ultra detail" },
];

export function TopControls() {
  const labels = useSceneStore((s) => s.labels);
  const toggleLabels = useSceneStore((s) => s.toggleLabels);
  const detail = useSceneStore((s) => s.detail);
  const setDetail = useSceneStore((s) => s.setDetail);
  const setView = useSceneStore((s) => s.setView);
  const setAboutOpen = useSceneStore((s) => s.setAboutOpen);

  return (
    <div className={`${PANEL} absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1.5`} data-testid="top-controls">
      <button
        type="button"
        className={`${PILL} ${labels ? PILL_ACTIVE : ""}`}
        aria-pressed={labels}
        onClick={toggleLabels}
        data-testid="labels-toggle"
      >
        Labels
      </button>
      <select
        className="rounded-full border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-200"
        aria-label="Detail level"
        value={detail}
        onChange={(e) => setDetail(e.target.value as DetailLevel)}
        data-testid="detail-select"
      >
        {DETAIL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="button" className={PILL} onClick={() => setView("map")} data-testid="map-view-button">
        2D map
      </button>
      <button type="button" className={PILL} onClick={() => setAboutOpen(true)} data-testid="about-button">
        About
      </button>
    </div>
  );
}
