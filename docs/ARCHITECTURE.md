# Architecture — PuneVerse 3D twin (current)

**Primary runtime:** Three.js scene (`src/scene/`) streaming `public/scene/s0/`.  
**Secondary:** MapLibre 2D (`src/map/`) for basemap / optional PMTiles.

## Layout

```
puneverse/
├── config/cities/pune.json     # City lock + honesty copy (both views)
├── public/
│   ├── scene/s0/               # Baked 3D twin (committed for free hosting)
│   ├── tiles/                  # Optional PMTiles for 2D (often gitignored)
│   └── data/                   # Places / SAMPLE admin / fixtures
├── src/
│   ├── scene/                  # Three.js engine + chrome (default)
│   ├── map/                    # MapLibre path
│   ├── store/                  # Zustand (sceneStore + mapStore)
│   └── ui/                     # Shared gates / map chrome
├── pipeline/                   # bake_scene.py + height helpers
└── docs/
```

## Principles (current)

| Choice | Why |
| --- | --- |
| Three.js default | City-scale procedural façades, TOY lighting, chunk streaming |
| MapLibre optional | Free 2D basemap; PMTiles when baked locally |
| Manifest-driven presets | Places / landmarks from bake — not a second hardcoded city list |
| Labelled height sources | Mapped / floors / satellite / area / default — estimates never “measured” |
| Data-quality mode (Shift+D) | Developer provenance inspection without cluttering default UI |
| SAMPLE admin only | Illustrative twin-city extent; not official wards |
| No R2 / Overpass in live path | Free static hosting |
| Fail-closed scene load | Manifest / WebGL errors surface in UI |

## Runtime flow

1. App loads `pune.json`.
2. MapLibre mounts with light (or env override) style; night swaps style URL.
3. `registerPmtilesProtocol` — on failure, banner (not silent).
4. On `load` / `style.load`: hide basemap 3D (skip `pv-ready-*`), attach SAMPLE admin, probe + attach ready PMTiles.
5. Search fetches `/data/places.index.json`.
6. Layer checkboxes flip `layersEnabled`; visibility syncs for SAMPLE + ready layers.

## Later phases (not implemented)

S1 PMC / S2 PMC∪PCMC clips → city-wide overlays; optional R2 storage; water/parks extracts.

## Stage 2 engine decision (grounded in the S0 proof of concept)

Decision: stay on MapLibre GL (vector PMTiles, fill-extrusion, raster-dem terrain, hillshade, sky). Use a Three.js custom layer only for instanced objects (trees now; vehicles and landmark models later). No open photogrammetric 3D Tiles exist for Pune, so Cesium's main advantage does not apply.

| Need | MapLibre (+ Three.js layer) | Cesium | deck.gl | Three.js only |
|---|---|---|---|---|
| PMTiles vector tiles | native via protocol (in use) | no native MVT styling | MVTLayer, no PMTiles style spec | custom loader |
| Extruded footprints with base | fill-extrusion (in use) | via 3D Tiles / custom | PolygonLayer extruded | custom meshes |
| Terrain + extrusions on it | raster-dem + setTerrain, extrusions follow terrain (verified) | best-in-class | TerrainLayer, separate | custom |
| Labels / symbols / collision | native | basic | TextLayer, no collision with basemap | custom |
| Instanced trees / cars | Three.js custom layer (1,719 trees in PoC) | possible | ScenegraphLayer | native |
| Photogrammetry 3D Tiles | not needed | native | Tile3DLayer | via loaders |
| Open Pune photogrammetry available? | — | none found | — | — |
| Procedural facades / windows | needs custom shader layer | custom | custom | native (Mumbai 3D uses this) |
| Reuse of existing app + tests | full | rewrite | partial | rewrite |

Procedural facades and window lights are the one area where a full Three.js renderer is stronger. It becomes worth it only once most buildings have heights.
