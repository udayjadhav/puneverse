import type { Map as MapLibreMap } from "maplibre-gl";
import { getDefaultCityConfig } from "@/config/loadCityConfig";
import type { LayerId } from "@/store/mapStore";

/** Candidate SAMPLE overlay ids (paint maps + convention paths). */
const SAMPLE_OVERLAY_CANDIDATES = ["admin", "roads", "buildings"] as const;

export type SampleOverlayId = (typeof SAMPLE_OVERLAY_CANDIDATES)[number];

/**
 * SAMPLE overlay ids derived from city config `status === "sample"`.
 * loadCityConfig tests lock pune.json alignment for these keys.
 */
export const SAMPLE_OVERLAY_IDS: readonly SampleOverlayId[] =
  SAMPLE_OVERLAY_CANDIDATES.filter(
    (id) => getDefaultCityConfig().layers[id]?.status === "sample",
  );

/** Layers with no SAMPLE geometry (UI toggle only) — includes demoted roads. */
export const STUB_OVERLAY_IDS: LayerId[] = (
  ["buildings", "roads", "water", "parks", "admin"] as const
).filter((id) => getDefaultCityConfig().layers[id]?.status === "stub");

/** Layers served from PMTiles when status === ready. */
export const READY_OVERLAY_IDS: LayerId[] = (
  ["buildings", "roads", "water", "parks", "admin"] as const
).filter((id) => getDefaultCityConfig().layers[id]?.status === "ready");

export function isSampleOverlayId(id: string): id is SampleOverlayId {
  return (SAMPLE_OVERLAY_IDS as readonly string[]).includes(id);
}

export function sampleOverlayUrl(id: SampleOverlayId): string {
  return `/data/overlays/${id}.sample.geojson`;
}

function sourceId(id: SampleOverlayId): string {
  return `pv-sample-${id}`;
}

function fillLayerId(id: SampleOverlayId): string {
  return `pv-sample-${id}-fill`;
}

function lineLayerId(id: SampleOverlayId): string {
  return `pv-sample-${id}-line`;
}

const FILL_PAINT: Record<
  SampleOverlayId,
  { "fill-color": string; "fill-opacity": number }
> = {
  admin: { "fill-color": "#f59e0b", "fill-opacity": 0.12 },
  buildings: { "fill-color": "#94a3b8", "fill-opacity": 0.55 },
  roads: { "fill-color": "#000000", "fill-opacity": 0 },
};

const LINE_PAINT: Record<
  SampleOverlayId,
  { "line-color": string; "line-width": number; "line-opacity": number }
> = {
  admin: { "line-color": "#d97706", "line-width": 1.5, "line-opacity": 0.85 },
  roads: { "line-color": "#334155", "line-width": 2.25, "line-opacity": 0.9 },
  buildings: { "line-color": "#64748b", "line-width": 0.6, "line-opacity": 0.7 },
};

/** MapLibre layout visibility for a layer toggle (pure; unit-tested). */
export function overlayVisibility(enabled: boolean): "visible" | "none" {
  return enabled ? "visible" : "none";
}

/**
 * Add SAMPLE GeoJSON sources/layers if missing.
 * Safe to call after every `style.load` (setStyle wipes custom layers).
 * Stub layers (incl. roads after P0) intentionally have no geometry.
 */
export function ensureSampleOverlays(
  map: MapLibreMap,
  layersEnabled: Record<LayerId, boolean>,
): void {
  for (const id of SAMPLE_OVERLAY_IDS) {
    const sid = sourceId(id);
    if (!map.getSource(sid)) {
      map.addSource(sid, {
        type: "geojson",
        data: sampleOverlayUrl(id),
      });
    }

    const vis = overlayVisibility(layersEnabled[id]);

    if (id === "roads") {
      const lid = lineLayerId(id);
      if (!map.getLayer(lid)) {
        map.addLayer({
          id: lid,
          type: "line",
          source: sid,
          layout: { visibility: vis },
          paint: LINE_PAINT.roads,
        });
      } else {
        map.setLayoutProperty(lid, "visibility", vis);
      }
      continue;
    }

    // admin + buildings: fill + outline
    const fid = fillLayerId(id);
    const lid = lineLayerId(id);
    if (!map.getLayer(fid)) {
      map.addLayer({
        id: fid,
        type: "fill",
        source: sid,
        layout: { visibility: vis },
        paint: FILL_PAINT[id],
      });
    } else {
      map.setLayoutProperty(fid, "visibility", vis);
    }
    if (!map.getLayer(lid)) {
      map.addLayer({
        id: lid,
        type: "line",
        source: sid,
        layout: { visibility: vis },
        paint: LINE_PAINT[id],
      });
    } else {
      map.setLayoutProperty(lid, "visibility", vis);
    }
  }
}

/** Sync SAMPLE layer visibility from the store (no-op if layers not yet added). */
export function syncSampleOverlayVisibility(
  map: MapLibreMap,
  layersEnabled: Record<LayerId, boolean>,
): void {
  for (const id of SAMPLE_OVERLAY_IDS) {
    const vis = overlayVisibility(layersEnabled[id]);
    const fid = fillLayerId(id);
    const lid = lineLayerId(id);
    if (map.getLayer(fid)) {
      map.setLayoutProperty(fid, "visibility", vis);
    }
    if (map.getLayer(lid)) {
      map.setLayoutProperty(lid, "visibility", vis);
    }
  }
}
