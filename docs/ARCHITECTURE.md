# Architecture — Phase 1 Option 0 (S0 center ready)

## Layout

```
puneverse/
├── config/cities/pune.json     # G0 city lock (ready|sample|stub)
├── public/
│   ├── tiles/                  # S0 PMTiles (gitignored; local bake)
│   └── data/
│       ├── places.index.json
│       ├── fixtures/           # CI GeoJSON slices
│       └── overlays/           # SAMPLE GeoJSON (admin only loaded)
│           ├── admin.sample.geojson
│           └── README.md
├── src/
│   ├── config/                 # load + types (LayerStatus: stub|sample|ready)
│   ├── map/                    # MapView, basemap, overlays, readyOverlays, pmtiles
│   ├── places/                 # fixture search helpers
│   ├── store/                  # Zustand UI state (+ tilesBanner)
│   └── ui/                     # chrome panels
├── pipeline/                   # tippecanoe v2.79.0 + osmium S0 bake
└── docs/
```

## Option 0 principles (current)

| Choice | Why |
| --- | --- |
| Import city JSON via Vite | Single source of truth under `config/` |
| Ready PMTiles for buildings/roads | Local tippecanoe bake from Geofabrik western-zone clip (S0 center) |
| SAMPLE admin only | Illustrative twin-city extent; not official wards |
| Stub water/parks | No geometry invented for those layers yet |
| OpenFreeMap / MapLibre demo | Free, no API key |
| Fixture places | Search works without claiming completeness |
| No R2 / Overpass | Keeps Phase 1 local and honest |
| `src/map/pmtiles.ts` | Registers `pmtiles://` protocol (tippecanoe **not** deferred) |
| Fail-closed tiles | Missing `/tiles/*.pmtiles` → store banner; do not silently show empty ready |
| Convention SAMPLE paths | `/data/overlays/{id}.sample.geojson` — admin only |

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
