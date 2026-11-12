import type { Map as MapLibreMap } from "maplibre-gl";

/** Minimal layer shape for pure filtering (style.layers entries). */
export interface StyleLayerRef {
  id: string;
  type: string;
}

/** Ready overlay layers we own — never hide these when stripping basemap 3D. */
export const READY_LAYER_ID_PREFIX = "pv-ready-";

/**
 * True for basemap fill-extrusion layers only.
 * Skips owned ready overlays (`pv-ready-*`) so Option 1 extrusions stay visible.
 */
export function isBasemapFillExtrusionLayer(layer: StyleLayerRef): boolean {
  return (
    layer.type === "fill-extrusion" &&
    !layer.id.startsWith(READY_LAYER_ID_PREFIX)
  );
}

/**
 * Return ids of every style layer with type `fill-extrusion`
 * that belongs to the basemap (e.g. OpenFreeMap liberty `building-3d`).
 * Pure — unit-tested. Does not include `pv-ready-*` layers.
 */
export function listFillExtrusionLayerIds(
  layers: readonly StyleLayerRef[] | undefined | null,
): string[] {
  if (!layers?.length) return [];
  return layers.filter(isBasemapFillExtrusionLayer).map((layer) => layer.id);
}

/**
 * Hide all basemap fill-extrusion layers so honesty ("no invented heights")
 * is not silently broken by style 3D buildings after style load / setStyle.
 * Does not hide `pv-ready-*` fill-extrusion layers.
 */
/** Basemap point-of-interest icon/label layers (OpenFreeMap: `poi_*`). */
export function listBasemapPoiLayerIds(
  layers: readonly StyleLayerRef[] | undefined | null,
): string[] {
  if (!layers?.length) return [];
  return layers
    .filter((l) => l.type === "symbol" && !l.id.startsWith("pv-") && /^poi/i.test(l.id))
    .map((l) => l.id);
}

/**
 * Hide basemap POI icons: they clutter the 3D view and repeat the names our own
 * label layers already draw from the same OpenStreetMap data.
 */
export function hideBasemapPois(map: MapLibreMap): string[] {
  const ids = listBasemapPoiLayerIds(map.getStyle?.()?.layers as StyleLayerRef[] | undefined);
  for (const id of ids) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
  }
  return ids;
}

export function hideBasemapFillExtrusions(map: MapLibreMap): string[] {
  const style = map.getStyle?.();
  const ids = listFillExtrusionLayerIds(
    style?.layers as StyleLayerRef[] | undefined,
  );
  for (const id of ids) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", "none");
    }
  }
  return ids;
}
