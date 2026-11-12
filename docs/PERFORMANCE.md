# Performance — 3D scene

Measure **frame time / FPS** in a focused window. MapLibre `redraw()` CPU ms alone is not a substitute for WebGL FPS.

## What to measure

| Metric | How |
|--------|-----|
| FPS / frame time | On-screen FPS in the scene chrome (`sceneStore.fps`) |
| Chunks resident | `SceneEngine.stats().chunks` |
| Draw calls / triangles | `renderer.info` via `SceneEngine.stats()` |
| Geometries / textures | `stats().geometries`, `stats().textures` |
| Transfer | Network panel for `/scene/s0/chunks/*` |

## Design constraints

- Stream chunks by camera; evict outside radius (`DETAIL.*.streamRadius` / `maxChunks`)
- Do not keep the whole city on the GPU
- Device detail: Low / Medium / High / Ultra
- Dispose path must terminate workers, evict chunks, clear trees/traffic, dispose meshes

## Views to check

1. City oblique (launch pose)
2. Neighbourhood (~1 km)
3. Street / landmark close-up
4. Long session with repeated fly-tos (watch memory)

## Historical note

Earlier Stage-2 MapLibre S0 measurements (2026-11-11) applied to the 2D PMTiles PoC only. Re-baseline after intentional 3D publishes; do not cite those numbers as current 3D FPS.
