import { useEffect, useRef } from "react";
import {
  distanceBucket,
  noteMeaningfulInteraction,
  pitchBucket,
  PV_EVENTS,
  track,
} from "@/analytics";
import { useLiveCityStore } from "@/live/liveCityStore";
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
      ready: () => {
        useSceneStore.getState().setReady(true);
        track(PV_EVENTS.scene_loaded, { view: "scene" });
      },
      error: (e) => {
        // Ignore errors from a disposed engine (Strict Mode remount race).
        if (engineRef.current !== engine) return;
        useSceneStore.getState().setLoadError(e);
        track(PV_EVENTS.scene_load_failed, { view: "scene", error: e.slice(0, 120) });
      },
      readout: (r) => useSceneStore.getState().setReadout(r),
      hover: (h) => useSceneStore.getState().setHover(h),
      select: (info) => {
        noteMeaningfulInteraction();
        track(PV_EVENTS.building_selected, {
          view: "scene",
          source: "scene",
          building_name: info.name,
          building_type: info.kind,
          building_height_m: info.height,
          height_source: info.source,
        });
        const readout = useSceneStore.getState().readout;
        if (useLiveCityStore.getState().liveMode) {
          useLiveCityStore.getState().setLocation({
            label: info.name || info.kind,
            kind: "building",
            lon: readout?.lon ?? null,
            lat: readout?.lat ?? null,
          });
        }
      },
      fps: (f) => useSceneStore.getState().setFps(f),
      cameraSample: ({ dist, pitch }) => {
        track(PV_EVENTS.camera_exploration, {
          view: "scene",
          camera_distance_bucket: distanceBucket(dist),
          camera_pitch_bucket: pitchBucket(pitch),
        });
      },
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

    // Live City defaults: everything on (weather FX, vehicles, Live UI).
    const live0 = useLiveCityStore.getState();
    engine.setWeatherFxEnabled(live0.weatherFxEnabled);
    engine.setPreviewRain(live0.previewRain);
    engine.setTrafficVisible(live0.trafficVisible);
    engine.setSimSpeed(live0.simSpeed);
    engine.setTrafficDensity(live0.trafficDensity);
    engine.setTrafficPaused(live0.trafficPaused);
    if (live0.liveMode) {
      engine.applyLiveSnapshot(live0.snapshot);
      void useLiveCityStore.getState().refresh();
    } else {
      // Even without Live panel, keep SIMULATED rain preview + traffic on.
      engine.setPreviewRain(live0.previewRain);
      if (live0.previewRain) engine.applyLiveSnapshot(null);
    }

    const unsubLive = useLiveCityStore.subscribe((s, prev) => {
      if (s.snapshot !== prev.snapshot || s.liveMode !== prev.liveMode) {
        engine.applyLiveSnapshot(s.liveMode ? s.snapshot : null);
      }
      if (s.weatherFxEnabled !== prev.weatherFxEnabled) engine.setWeatherFxEnabled(s.weatherFxEnabled);
      if (s.previewRain !== prev.previewRain) {
        engine.setPreviewRain(s.previewRain);
        engine.applyLiveSnapshot(s.liveMode ? s.snapshot : null);
      }
      if (s.trafficVisible !== prev.trafficVisible) engine.setTrafficVisible(s.trafficVisible);
      if (s.simSpeed !== prev.simSpeed) engine.setSimSpeed(s.simSpeed);
      if (s.trafficDensity !== prev.trafficDensity) engine.setTrafficDensity(s.trafficDensity);
      if (s.trafficPaused !== prev.trafficPaused) engine.setTrafficPaused(s.trafficPaused);
    });

    return () => {
      unsub();
      unsubLive();
      engine.dispose();
      engineRef.current = null;
      if (window.__pvEngine === engine) delete window.__pvEngine;
    };
  }, []);

  return <div ref={ref} className="absolute inset-0" data-testid="scene-container" />;
}
