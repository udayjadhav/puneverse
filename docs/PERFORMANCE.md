# Performance — Stage 2 PoC (S0 center, measured 2026-11-11)

Dev build (`vite`), Chromium in Cursor's browser, viewport 696×707, terrain + all layers on, 3D mode.

| View | Camera | Buildings rendered | CPU ms per `map.redraw()` | JS heap |
|---|---|---|---|---|
| City | z13.3, pitch 55 | 43,374 | 0.78 | 63 MB |
| Neighbourhood | z16.1, pitch 62 | 5,967 | 1.23 | 104 MB |
| Close-up | z17.4, pitch 63 | 939 | 1.14 | 126 MB |

CPU time per redraw only (GPU work is asynchronous and not included). A true frame rate could not be measured: the browser tab had no focus, so `requestAnimationFrame` was throttled to about 1 frame per second. Re-measure in a focused window.

| Network (one session, three views) | Requests | Transferred |
|---|---|---|
| buildings.pmtiles | 30 | 3.5 MB |
| roads.pmtiles | 31 | 0.29 MB |
| context.pmtiles | 38 | 0.07 MB |
| Terrain tiles (AWS) | 84 | not reported (cross-origin timing) |

Archive sizes: buildings 8.4 MB, roads 0.89 MB, context 0.24 MB, trees JSON 41 KB. three.js loads lazily with the trees layer.
