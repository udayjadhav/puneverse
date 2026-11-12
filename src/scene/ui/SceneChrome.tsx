import { useEffect } from "react";
import { useSceneStore } from "@/store/sceneStore";
import { BottomBar } from "./BottomBar";
import { CityCard } from "./CityCard";
import { DataQualityLegend } from "./DataQualityLegend";
import { LandmarkCard } from "./LandmarkCard";
import { LoadingScreen } from "./LoadingScreen";
import { PlaceReadout } from "./PlaceReadout";
import { PlaceSearch } from "./PlaceSearch";
import { SceneAbout } from "./SceneAbout";
import { SceneTooltip } from "./SceneTooltip";
import { TopControls } from "./TopControls";

/** Overlay UI for the 3D scene. Mount inside a relatively positioned box over the canvas. */
export function SceneChrome() {
  const toggleDq = useSceneStore((s) => s.toggleDataQualityMode);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "D" && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        toggleDq();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleDq]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" data-testid="scene-chrome">
      <CityCard />
      <PlaceSearch />
      <TopControls />
      <DataQualityLegend />
      <PlaceReadout />
      <BottomBar />
      <LandmarkCard />
      <SceneTooltip />
      <SceneAbout />
      <LoadingScreen />
    </div>
  );
}
