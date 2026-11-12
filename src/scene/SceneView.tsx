import { useEffect, useRef } from "react";
import { useSceneStore } from "@/store/sceneStore";
import { SceneEngine, type Detail } from "./engine/SceneEngine";

export const LOAD_STAGES = [
  { id: "manifest", label: "Reading the scene plan" },
  { id: "terrain", label: "Raising terrain (Copernicus DEM)" },
  { id: "imagery", label: "Draping Sentinel-2 ground colour" },
  { id: "network", label: "Laying roads, flyovers and metro" },
  { id: "buildings", label: "Raising every building" },
  { id: "trees", label: "Planting trees" },
  { id: "lighting", label: "Lighting the city" },
];

function autoDetail(): Detail {
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  if (mobile) return "low";
  const cores = navigator.hardwareConcurrency || 4;
  return cores >= 8 ? "high" : "medium";
}

declare global {
  interface Window {
    __pvEngine?: SceneEngine;
    __pvStore?: typeof useSceneStore;
  }
}

export function SceneView() {
  const ref = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SceneEngine | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const st = useSceneStore.getState();
    st.setStages(LOAD_STAGES.map((s) => ({ ...s, done: false })));
    st.setReady(false);
    st.setLoadError(null);
    const engine = new SceneEngine(el, {
      stage: (id) => useSceneStore.getState().markStage(id),
      manifest: (m) => useSceneStore.getState().setManifest(m),
      ready: () => useSceneStore.getState().setReady(true),
      error: (e) => useSceneStore.getState().setLoadError(e),
      readout: (r) => useSceneStore.getState().setReadout(r),
      hover: (h) => useSceneStore.getState().setHover(h),
      fps: (f) => useSceneStore.getState().setFps(f),
    });
    engineRef.current = engine;
    window.__pvEngine = engine;
    window.__pvStore = useSceneStore;
    const initial = useSceneStore.getState();
    const d = initial.detail === "high" ? autoDetail() : initial.detail;
    useSceneStore.getState().setDetail(d);
    engine.setDetail(d);
    engine.setTime(initial.timeOfDay);
    engine.setLabels(initial.labels);
    void engine.load();

    const unsub = useSceneStore.subscribe((s, prev) => {
      if (s.timeOfDay !== prev.timeOfDay) engine.setTime(s.timeOfDay);
      if (s.detail !== prev.detail) engine.setDetail(s.detail);
      if (s.labels !== prev.labels) engine.setLabels(s.labels);
      if (s.flyTo && s.flyTo !== prev.flyTo) {
        engine.flyTo(s.flyTo);
        useSceneStore.getState().requestFlyTo(null);
      }
    });
    return () => {
      unsub();
      engine.dispose();
      engineRef.current = null;
      if (window.__pvEngine === engine) delete window.__pvEngine;
    };
  }, []);

  return <div ref={ref} className="absolute inset-0" data-testid="scene-container" />;
}
