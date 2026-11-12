import type { Map as MapLibreMap } from "maplibre-gl";

export interface MockLayer {
  id: string;
  type: string;
  source?: string;
  "source-layer"?: string;
  minzoom?: number;
  filter?: unknown;
  layout?: { visibility?: string };
  paint?: Record<string, unknown>;
}

/**
 * Minimal in-memory MapLibre stand-in: ordered style layers, sources,
 * layout/filter state, light, feature-state. `wipeStyle()` mimics setStyle.
 */
export function createMockMap(baseLayers: MockLayer[] = [
  { id: "background", type: "background" },
  { id: "water", type: "fill" },
  { id: "road-label", type: "symbol" },
  { id: "place-label", type: "symbol" },
]) {
  let order: MockLayer[] = baseLayers.map((l) => ({ ...l }));
  const sources = new Map<string, unknown>();
  const layout = new Map<string, string>();
  const filters = new Map<string, unknown>();
  const featureState = new Map<string, Record<string, unknown>>();
  const addLayerCalls: Array<{ layer: MockLayer; beforeId?: string }> = [];
  let light: unknown = null;
  let terrain: unknown = null;
  let sky: unknown = null;
  const canvas = { style: { cursor: "" } };
  const handlers: Array<{ type: string; layer?: string; fn: unknown }> = [];

  const api = {
    getStyle: () => ({ layers: order.map((l) => ({ id: l.id, type: l.type })) }),
    getSource: (id: string) => sources.get(id),
    addSource: (id: string, spec: unknown) => {
      if (sources.has(id)) throw new Error(`source ${id} already exists`);
      sources.set(id, spec);
    },
    getLayer: (id: string) => order.find((l) => l.id === id),
    addLayer: (layer: MockLayer, beforeId?: string) => {
      if (order.some((l) => l.id === layer.id)) {
        throw new Error(`layer ${layer.id} already exists`);
      }
      addLayerCalls.push({ layer, beforeId });
      const idx = beforeId ? order.findIndex((l) => l.id === beforeId) : -1;
      if (idx >= 0) order.splice(idx, 0, layer);
      else order.push(layer);
      if (layer.layout?.visibility) layout.set(layer.id, layer.layout.visibility);
      if (layer.filter) filters.set(layer.id, layer.filter);
    },
    setLayoutProperty: (id: string, key: string, value: string) => {
      if (key === "visibility") layout.set(id, value);
    },
    getLayoutProperty: (id: string, key: string) =>
      key === "visibility" ? layout.get(id) ?? "visible" : undefined,
    setFilter: (id: string, filter: unknown) => filters.set(id, filter),
    setLight: (l: unknown) => {
      light = l;
    },
    getTerrain: () => terrain,
    setTerrain: (t: unknown) => {
      terrain = t;
    },
    setSky: (s: unknown) => {
      sky = s;
    },
    setFeatureState: (
      target: { source: string; sourceLayer?: string; id: number },
      state: Record<string, unknown>,
    ) => {
      const key = `${target.source}/${target.sourceLayer}/${target.id}`;
      featureState.set(key, { ...(featureState.get(key) ?? {}), ...state });
    },
    getCanvas: () => canvas,
    on: (type: string, layerOrFn: unknown, maybeFn?: unknown) => {
      if (typeof layerOrFn === "string") handlers.push({ type, layer: layerOrFn, fn: maybeFn });
      else handlers.push({ type, fn: layerOrFn });
    },
    off: (type: string, layerOrFn: unknown, maybeFn?: unknown) => {
      const fn = typeof layerOrFn === "string" ? maybeFn : layerOrFn;
      const i = handlers.findIndex((h) => h.type === type && h.fn === fn);
      if (i >= 0) handlers.splice(i, 1);
    },
    queryRenderedFeatures: (_p: unknown, _o: unknown): unknown[] => [],
  };

  return {
    api,
    map: api as unknown as MapLibreMap,
    sources,
    layout,
    filters,
    featureState,
    addLayerCalls,
    canvas,
    handlers,
    get light() {
      return light;
    },
    get terrain() {
      return terrain;
    },
    get sky() {
      return sky;
    },
    layerIds: () => order.map((l) => l.id),
    layer: (id: string) => order.find((l) => l.id === id),
    /** setStyle(): all custom layers and sources are gone. */
    wipeStyle: () => {
      order = baseLayers.map((l) => ({ ...l }));
      sources.clear();
      layout.clear();
      filters.clear();
      featureState.clear();
      terrain = null;
      sky = null;
    },
  };
}
