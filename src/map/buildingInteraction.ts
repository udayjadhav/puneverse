import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { buildingInfoFromProps, type BuildingInfo } from "./buildingInfo";
import {
  BUILDINGS_EXTRUSION_ID,
  BUILDINGS_FILL_ID,
  BUILDINGS_SOURCE_ID,
  BUILDINGS_SOURCE_LAYER,
  interactiveBuildingLayerIds,
} from "./buildingsLayers";

/** Building under a screen point (3D layer first), or null. */
export function pickBuilding(
  map: MapLibreMap,
  point: MapMouseEvent["point"],
): BuildingInfo | null {
  const layers = interactiveBuildingLayerIds(map);
  if (layers.length === 0) return null;
  const hit = map.queryRenderedFeatures(point, { layers })[0];
  if (!hit) return null;
  return buildingInfoFromProps(
    hit.properties as Record<string, unknown>,
    hit.id as number | string | undefined,
  );
}

/** Highlight one building via feature-state; clears the previous one. */
export function applySelectionState(
  map: MapLibreMap,
  nextId: number | null,
  prevId: number | null,
): void {
  if (!map.getSource(BUILDINGS_SOURCE_ID)) return;
  const target = { source: BUILDINGS_SOURCE_ID, sourceLayer: BUILDINGS_SOURCE_LAYER };
  if (prevId !== null && prevId !== nextId) {
    map.setFeatureState({ ...target, id: prevId }, { selected: false });
  }
  if (nextId !== null) {
    map.setFeatureState({ ...target, id: nextId }, { selected: true });
  }
}

/**
 * Click → select (or clear on empty map); pointer cursor over buildings.
 * Layer-scoped hover listeners survive setStyle because the layer ids are re-added.
 * Returns a detach function.
 */
export type ScreenPoint = { x: number; y: number };

export function attachBuildingInteraction(
  map: MapLibreMap,
  onSelect: (info: BuildingInfo | null, point: ScreenPoint) => void,
  onHover?: (info: BuildingInfo | null, point: ScreenPoint) => void,
): () => void {
  const onClick = (e: MapMouseEvent) => onSelect(pickBuilding(map, e.point), e.point);
  const setPointer = () => {
    map.getCanvas().style.cursor = "pointer";
  };
  const clearPointer = () => {
    map.getCanvas().style.cursor = "";
  };
  let frame = 0;
  let last: MapMouseEvent | null = null;
  const onMove = (e: MapMouseEvent) => {
    if (!onHover) return;
    last = e;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (last) onHover(pickBuilding(map, last.point), last.point);
    });
  };
  const onOut = () => onHover?.(null, { x: 0, y: 0 });

  map.on("click", onClick);
  map.on("mousemove", onMove);
  map.on("mouseout", onOut);
  for (const id of [BUILDINGS_EXTRUSION_ID, BUILDINGS_FILL_ID]) {
    map.on("mouseenter", id, setPointer);
    map.on("mouseleave", id, clearPointer);
  }
  return () => {
    if (frame) cancelAnimationFrame(frame);
    map.off("click", onClick);
    map.off("mousemove", onMove);
    map.off("mouseout", onOut);
    for (const id of [BUILDINGS_EXTRUSION_ID, BUILDINGS_FILL_ID]) {
      map.off("mouseenter", id, setPointer);
      map.off("mouseleave", id, clearPointer);
    }
  };
}
