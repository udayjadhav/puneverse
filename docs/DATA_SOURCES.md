# Data sources

## Basemap

| Source | Role | Notes |
| --- | --- | --- |
| OpenFreeMap Liberty / Dark | Default day/night styles | Free; no API key |
| MapLibre demotiles | Fallback style | Used if primary style fetch fails |
| `VITE_TILE_URL` / `VITE_TILE_URL_DARK` | Optional overrides | See `.env.example` |

## Places (search)

`public/data/places.index.json`

- `"fixture": true`
- Generic names: Fixture Ward A/B/C, Fixture Gazetteer Place 1/2/3
- Coordinates in the Pune urban area for fly-to demos
- **Not** a marketing neighbourhood list
- **Not** complete ward or gazetteer coverage

## Overlay layers

| Layer | Status | File / notes |
| --- | --- | --- |
| buildings | **ready** (S0 center) | `public/tiles/buildings.pmtiles` — OSM clip; optional flat SAMPLE file retained but not loaded |
| roads | **ready** (S0 center) | `public/tiles/roads.pmtiles` — OSM highways; spoke SAMPLE deleted |
| admin | **sample** | `public/data/overlays/admin.sample.geojson` — illustrative twin-city extent; **not** official wards |
| water | **stub** | No geometry (optional later extract) |
| parks | **stub** | No geometry |

Convention SAMPLE URL: `/data/overlays/{id}.sample.geojson`  
Ready PMTiles: `/tiles/{id}.pmtiles` via `pmtiles://` protocol.

Every SAMPLE feature has `"sample": true`. **SHIP HOLD**.

Do not invent heights. Do not treat SAMPLE admin as official municipal boundaries.

## Geofabrik western-zone (primary OSM)

| Item | Value |
|------|-------|
| URL | https://download.geofabrik.de/asia/india/western-zone-latest.osm.pbf |
| Size | ~211 MB |
| MD5 | Published as `western-zone-latest.osm.pbf.md5` alongside the PBF |
| Coverage | Western India including **Maharashtra / Pune** (see `data/boundaries/western-zone.poly`) |
| Licence | ODbL 1.0 |
| Local path | `data/raw/` (gitignored) |

No Overpass in production harvest. See `pipeline/README.md` and `docs/DATA_QUALITY.md`.
