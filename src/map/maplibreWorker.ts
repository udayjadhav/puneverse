/**
 * Register MapLibre's dedicated web worker for Vite.
 * Must run before any `new Map()` — otherwise the worker URL is wrong,
 * tile parsing never starts, and the canvas stays the liberty cream background.
 */
import { setWorkerUrl } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

setWorkerUrl(maplibreWorkerUrl);
