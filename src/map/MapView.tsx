import { useCallback, useEffect, useRef, useState } from "react";
import type { ErrorEvent, Map as MapLibreMap } from "maplibre-gl";
import { noteMeaningfulInteraction, PV_EVENTS, track } from "@/analytics";
import { getDefaultCityConfig } from "@/config/loadCityConfig";
import { resolveBasemapUrl } from "./basemap";
import { hideBasemapFillExtrusions, hideBasemapPois } from "./hideBasemapExtrusions";
import { ensureSampleOverlays } from "./overlays";
import { ensureReadyOverlays, PMTILES_PROTOCOL_BANNER } from "./readyOverlays";
import { registerPmtilesProtocol } from "./pmtiles";
import { buildMapOptions, createMap } from "./initMap";
import { cameraDurationMs } from "./camera";
import { syncOverlayVisibility } from "./layerVisibility";
import { applySelectionState, attachBuildingInteraction } from "./buildingInteraction";
import { useMapStore } from "@/store/mapStore";

const city = getDefaultCityConfig();

/** After every style load: hide basemap 3D, then (re)attach our overlays. */
async function attachOverlaysAfterStyleLoad(
  map: MapLibreMap,
  isCurrent: () => boolean,
): Promise<void> {
  try {
    hideBasemapFillExtrusions(map);
    hideBasemapPois(map);
    const s = useMapStore.getState();
    ensureSampleOverlays(map, s.layersEnabled);
    await ensureReadyOverlays(map, {
      layersEnabled: s.layersEnabled,
      mode: s.viewMode,
      theme: s.theme,
      isCurrent,
    });
    if (!isCurrent()) return;
    const selected = useMapStore.getState().selectedBuilding?.featureId ?? null;
    applySelectionState(map, selected, null);
  } catch (err) {
    console.error("PuneVerse: failed to attach map overlays", err);
  }
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const fallbackUsedRef = useRef(false);
  const selectedIdRef = useRef<number | null>(null);
  const styleThemeRef = useRef<string | null>(null);
  const styleGenRef = useRef(0);
  const theme = useMapStore((s) => s.theme);
  const viewMode = useMapStore((s) => s.viewMode);
  const layersEnabled = useMapStore((s) => s.layersEnabled);
  const flyToTarget = useMapStore((s) => s.flyToTarget);
  const clearFlyTo = useMapStore((s) => s.clearFlyTo);
  const selectedBuilding = useMapStore((s) => s.selectedBuilding);
  const tilesBanner = useMapStore((s) => s.tilesBanner);
  const setTilesBanner = useMapStore((s) => s.setTilesBanner);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  /** Full style swap (no diff) so `style.load` always fires and overlays re-attach. */
  const swapStyle = useCallback((map: MapLibreMap, url: string) => {
    styleGenRef.current += 1;
    map.setStyle(url, { diff: false });
  }, []);

  const applyFallbackStyle = useCallback(
    (map: MapLibreMap) => {
      if (fallbackUsedRef.current) return;
      fallbackUsedRef.current = true;
      swapStyle(map, city.basemap_fallback);
    },
    [swapStyle],
  );

  const retryBasemap = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    fallbackUsedRef.current = false;
    setMapError(null);
    swapStyle(map, city.basemap_fallback);
  }, [swapStyle]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;
    fallbackUsedRef.current = false;

    if (!registerPmtilesProtocol()) {
      setTilesBanner(PMTILES_PROTOCOL_BANNER);
    }

    let detachInteraction: (() => void) | null = null;
    try {
      const { theme: initialTheme, viewMode: initialMode } = useMapStore.getState();
      styleThemeRef.current = initialTheme;
      const map = createMap(
        buildMapOptions(
          city,
          containerRef.current,
          resolveBasemapUrl(city, initialTheme),
          initialMode,
        ),
      );

      map.on("error", (e: ErrorEvent) => {
        // Our own PMTiles errors surface as the tiles banner, not a basemap swap.
        const src = (e as ErrorEvent & { sourceId?: string }).sourceId ?? "";
        if (src.startsWith("pv-")) return;
        const msg = e.error?.message ?? "Map error";
        if (/style|tile|fetch|network|source/i.test(msg)) {
          setMapError(msg);
          if (!cancelled) {
            applyFallbackStyle(map);
          }
        }
      });

      const currentStyleCheck = () => {
        const gen = styleGenRef.current;
        return () => !cancelled && styleGenRef.current === gen;
      };

      map.on("style.load", () => {
        if (cancelled) return;
        void attachOverlaysAfterStyleLoad(map, currentStyleCheck());
      });

      map.once("load", () => {
        if (cancelled) return;
        map.resize();
        void attachOverlaysAfterStyleLoad(map, currentStyleCheck()).finally(() => {
          if (!cancelled) setMapReady(true);
        });
      });

      detachInteraction = attachBuildingInteraction(
        map,
        (info, point) => {
          const s = useMapStore.getState();
          s.selectBuilding(info);
          s.setTooltip(info ? { info, ...point, pinned: true } : null);
          if (info) {
            noteMeaningfulInteraction();
            track(PV_EVENTS.building_selected, {
              view: "map",
              source: "map",
              building_name: info.name ?? null,
              building_type: info.buildingType ?? undefined,
              building_height_m: info.heightM ?? undefined,
              height_source: info.heightSource,
            });
          }
        },
        (info, point) => {
          const s = useMapStore.getState();
          if (s.tooltip?.pinned) return;
          s.setTooltip(info ? { info, ...point, pinned: false } : null);
        },
      );
      // The tooltip is placed in screen space, so it cannot follow a moving camera.
      map.on("movestart", () => {
        if (useMapStore.getState().tooltip) useMapStore.getState().setTooltip(null);
      });

      mapRef.current = map;
      // Dev-only handle for visual QA; import.meta.env.DEV is false in builds.
      if (import.meta.env.DEV) {
        (window as Window & { __puneverseMap?: MapLibreMap }).__puneverseMap = map;
      }
    } catch (err) {
      setMapError(err instanceof Error ? err.message : "Failed to create map");
    }

    return () => {
      cancelled = true;
      setMapReady(false);
      detachInteraction?.();
      if (import.meta.env.DEV) {
        delete (window as Window & { __puneverseMap?: MapLibreMap }).__puneverseMap;
      }
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Intentionally mount once; theme swaps handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleThemeRef.current === theme) return;
    styleThemeRef.current = theme;
    fallbackUsedRef.current = false;
    swapStyle(map, resolveBasemapUrl(city, theme));
    setMapError(null);
  }, [theme, swapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    syncOverlayVisibility(map, layersEnabled, viewMode);
  }, [mapReady, layersEnabled, viewMode]);

  useEffect(() => {
    const map = mapRef.current;
    const nextId = selectedBuilding?.featureId ?? null;
    if (mapReady && map) {
      applySelectionState(map, nextId, selectedIdRef.current);
    }
    selectedIdRef.current = nextId;
  }, [mapReady, selectedBuilding]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !flyToTarget) return;
    const options = {
      center: flyToTarget.center ?? map.getCenter(),
      zoom:
        flyToTarget.zoom ??
        (flyToTarget.center ? Math.max(map.getZoom(), 13) : map.getZoom()),
      pitch: flyToTarget.pitch ?? map.getPitch(),
      bearing: flyToTarget.bearing ?? map.getBearing(),
      essential: true,
    };
    if (flyToTarget.animate === "ease") {
      map.easeTo({ ...options, duration: cameraDurationMs(700) });
    } else if (cameraDurationMs() === 0) {
      map.jumpTo(options);
    } else {
      map.flyTo(options);
    }
    clearFlyTo();
  }, [mapReady, flyToTarget, clearFlyTo]);

  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        className="h-full w-full"
        data-testid="map-container"
      />
      {tilesBanner ? (
        <div
          className="absolute top-14 left-1/2 z-20 max-w-lg -translate-x-1/2 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-950 shadow"
          role="status"
          data-testid="tiles-banner"
        >
          {tilesBanner}
        </div>
      ) : null}
      {mapError ? (
        <div className="absolute bottom-16 left-1/2 z-20 flex max-w-md -translate-x-1/2 flex-col gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950 shadow">
          <p>
            Basemap issue: {mapError}. Overlays need a loaded style; stub layers
            have no geometry.
          </p>
          <button
            type="button"
            className="self-start rounded border border-amber-800/40 bg-white px-2 py-1 text-xs font-medium hover:bg-amber-100"
            onClick={retryBasemap}
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
