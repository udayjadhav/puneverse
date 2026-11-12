import { BottomBar } from "./BottomBar";
import { CityCard } from "./CityCard";
import { LoadingScreen } from "./LoadingScreen";
import { PlaceReadout } from "./PlaceReadout";
import { SceneAbout } from "./SceneAbout";
import { SceneTooltip } from "./SceneTooltip";
import { TopControls } from "./TopControls";

/** Overlay UI for the 3D scene. Mount inside a relatively positioned box over the canvas. */
export function SceneChrome() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" data-testid="scene-chrome">
      <CityCard />
      <TopControls />
      <PlaceReadout />
      <BottomBar />
      <SceneTooltip />
      <SceneAbout />
      <LoadingScreen />
    </div>
  );
}
