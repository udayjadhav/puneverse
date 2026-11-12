# PuneVerse

> **SHIP HOLD** — S0 center buildings/roads are real clipped OSM **PMTiles** (local tippecanoe bake). Admin remains **SAMPLE**. Water/parks remain **stubs**. Not a production release. No R2. No Overpass.

Interactive map chrome for **Pune & Pimpri-Chinchwad** (scope B, cantonments in). English UI.

## What works today

- Full-screen MapLibre map with free OpenFreeMap / MapLibre demo basemap (no API key)
- Day / night = basemap style lighting swap only
- Layer toggles (Zustand) — **ready** PMTiles for buildings + roads (S0 center); **SAMPLE** GeoJSON for admin; water/parks still **stub**
- Real 3D buildings (default 3D view, Flat toggle): extrusion only from OSM heights (`normalized_height_m`, `height_source` in `{osm_explicit, osm_levels_estimate}`); unknown stays flat. Only ~1.3% of center buildings have height data
- Place search over `public/data/places.index.json` (**fixture: true**)
- Honesty / About panel (SHIP HOLD, S0 extent, OSM attribution)
- Fail-closed banner when `/tiles/*.pmtiles` are missing (gitignored) or PMTiles protocol fails
- WebGL gate + React error boundary
- tippecanoe **v2.79.0** used for local bake (not deferred)

## What does **not** work yet

- Full PMC ∪ PCMC city-wide overlays (S0 is a ~±0.025° center bbox only)
- Water / parks geometry
- Official admin / ward boundaries (SAMPLE admin is illustrative)
- Overpass live queries
- Complete ward or gazetteer coverage

## Quick start

```bash
npm install
# Optional: bake S0 tiles (requires Geofabrik PBF + tippecanoe + osmium)
# python3 pipeline/bake_center.py
npm run dev
```

Without a local bake, ready layers show a banner: **Tiles missing — run pipeline bake**.

Enable **Buildings**, **Roads**, or **Admin boundaries (SAMPLE)** in the Layers panel.

Other scripts:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run preview
npm run deploy          # Cloudflare Pages (free) — requires `npx wrangler login`
python3 -m pytest pipeline/ -q
```

Hosting: see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) (Cloudflare Pages preferred, GitHub Pages via Actions).

## Data layers (honest status)

| Layer | Status | Notes |
| --- | --- | --- |
| buildings | **ready** (S0 center) | `public/tiles/buildings.pmtiles` (gitignored; local bake) |
| roads | **ready** (S0 center) | `public/tiles/roads.pmtiles` — spoke SAMPLE removed |
| admin | **sample** | `public/data/overlays/admin.sample.geojson` — illustrative only |
| water / parks | **stub** | No geometry |

See [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) and [`pipeline/README.md`](pipeline/README.md).

## Config (G0)

City lock lives in [`config/cities/pune.json`](config/cities/pune.json). See [`docs/context/G0.md`](docs/context/G0.md).

## Docs

| Doc | Purpose |
| --- | --- |
| [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) | Product goals / hold status |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Folder layout & Option 0 S0 |
| [docs/GEOGRAPHIC_BOUNDARY.md](docs/GEOGRAPHIC_BOUNDARY.md) | Extent + placeholder maxBounds |
| [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) | OSM / SAMPLE / ready tiles |
| [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md) | Height honesty + fail-closed |
| [docs/TOOLING.md](docs/TOOLING.md) | tippecanoe v2.79.0 + osmium |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Local only for Phase 1 |
| [docs/COST_ESTIMATE.md](docs/COST_ESTIMATE.md) | Honest cost notes |
| [ATTRIBUTION.md](ATTRIBUTION.md) | Credits |
| [pipeline/README.md](pipeline/README.md) | S0 center bake |

## License

See [LICENSE](LICENSE). Map data © OpenStreetMap contributors.
