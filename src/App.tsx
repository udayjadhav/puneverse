import { useEffect } from "react";
import { getDefaultCityConfig } from "@/config/loadCityConfig";
import { fetchBuildingStats } from "@/map/buildingStats";
import { MapView } from "@/map/MapView";
import { useMapStore } from "@/store/mapStore";
import { useSceneStore } from "@/store/sceneStore";
import { SceneView } from "@/scene/SceneView";
import { SceneChrome } from "@/scene/ui/SceneChrome";
import { AboutPanel } from "@/ui/AboutPanel";
import { BuildingPanel } from "@/ui/BuildingPanel";
import { BuildingTooltip } from "@/ui/BuildingTooltip";
import { HeightLegend } from "@/ui/HeightLegend";
import { SidePanel } from "@/ui/SidePanel";
import { TopBar } from "@/ui/TopBar";
import { WebGLGate } from "@/ui/WebGLGate";

const statsUrl = getDefaultCityConfig().buildings?.stats_url;

function MapExperience() {
  const setView = useSceneStore((s) => s.setView);
  useEffect(() => {
    if (!statsUrl) {
      useMapStore.getState().setBuildingStats("unavailable");
      return;
    }
    let cancelled = false;
    void fetchBuildingStats(statsUrl).then((stats) => {
      if (!cancelled) useMapStore.getState().setBuildingStats(stats ?? "unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <MapView />
      <TopBar />
      <SidePanel />
      <BuildingTooltip />
      <BuildingPanel />
      <HeightLegend />
      <AboutPanel />
      <button
        type="button"
        onClick={() => setView("scene")}
        className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/15 bg-slate-900/85 px-4 py-2 text-sm font-medium text-amber-300 shadow-lg backdrop-blur hover:bg-slate-800"
        data-testid="back-to-3d"
      >
        Back to 3D city
      </button>
    </>
  );
}

export default function App() {
  const view = useSceneStore((s) => s.view);
  return (
    <WebGLGate>
      <div className="relative h-full w-full overflow-hidden bg-slate-950">
        {view === "scene" ? (
          <>
            <SceneView />
            <SceneChrome />
          </>
        ) : (
          <MapExperience />
        )}
      </div>
    </WebGLGate>
  );
}
