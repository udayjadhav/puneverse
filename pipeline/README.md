# PuneVerse data pipeline

## Status (M-S0-CENTER-REAL)

- **S0 ready:** buildings + roads are clipped OSM PMTiles under `public/tiles/` (gitignored; local bake).
- **SAMPLE spokes removed** — roads are ready PMTiles only (no illustrative spoke GeoJSON).
- **Admin** stays SAMPLE; **water/parks** stay stub.
- **tippecanoe v2.79.0** is used for bake (not deferred).
- Product remains **SHIP HOLD**. No R2. No Overpass.

## Tools

See `docs/TOOLING.md`.

| Tool | Version pinned here |
|------|---------------------|
| tippecanoe | 2.79.0 (`brew install tippecanoe`) |
| osmium-tool | 1.19.1 (`brew install osmium-tool`) |

```bash
export PATH="$(pwd)/tools/bin:/opt/homebrew/bin:$PATH"
tippecanoe -v
osmium --version
```

## Geofabrik western-zone (Q1)

```bash
mkdir -p data/raw
curl -L --progress-bar \
  -o data/raw/western-zone-latest.osm.pbf \
  https://download.geofabrik.de/asia/india/western-zone-latest.osm.pbf
curl -L -o data/raw/western-zone-latest.osm.pbf.md5 \
  https://download.geofabrik.de/asia/india/western-zone-latest.osm.pbf.md5
# verify
md5 -q data/raw/western-zone-latest.osm.pbf
# compare to first field of .md5 file (~211 MB expected)
```

**Coverage:** western-zone covers western India including **Maharashtra / Pune**. Polygon notes: `data/boundaries/western-zone.poly`.

## S0 center bake

Clip bbox: `data/boundaries/pune-center.bbox` (±0.025° around `[73.8567, 18.5204]`).

```bash
python3 pipeline/check_raw_data.py
python3 pipeline/bake_center.py
python3 -m pytest pipeline/test_crs_validity.py -q
```

Outputs (gitignored PMTiles):

| Artifact | Path |
|----------|------|
| Clipped PBF | `data/processed/pune-center.osm.pbf` |
| Enriched GeoJSON | `data/processed/buildings.geojson`, `roads.geojson` |
| PMTiles | `public/tiles/buildings.pmtiles`, `roads.pmtiles` |
| Manifest | `data/processed/manifest-s0.json` |
| CI fixtures | `public/data/fixtures/*.fixture.geojson` |

## S1 / S2 (next)

```bash
# S1 — after PMC polygon lands under data/boundaries/pmc.geojson:
# osmium extract -p data/boundaries/pmc.poly -o data/processed/pmc.osm.pbf data/raw/western-zone-latest.osm.pbf
# S2 — PMC ∪ PCMC (Bharatlas PMC wards + PCMC corp); union polygon then extract.
```

Bbox clip is enough for S0. Do **not** use Overpass for production harvest.

## Height policy (Q6)

See `pipeline/heights.py` and `docs/DATA_QUALITY.md`.

- `osm_explicit` from OSM `height` / `building:height` (metres; feet converted and flagged)
- `osm_levels_estimate` from `building:levels × floor_height_m` (default 3.0 m)
- else `unknown` — **no** `normalized_height_m`, no extrusion

Re-bake buildings only (keeps roads untouched):

```bash
PATH="/opt/homebrew/bin:$PATH" .venv/bin/python pipeline/bake_center.py --buildings-only [--floor-height-m 3.0]
.venv/bin/python -m pytest pipeline -q
```

Buildings tippecanoe command (recorded in `data/processed/manifest-s0.json`):

```bash
tippecanoe -o public/tiles/buildings.pmtiles -l buildings --minimum-zoom=12 --maximum-zoom=16 \
  --no-feature-limit --no-tile-size-limit --no-tiny-polygon-reduction \
  "--attribution=© OpenStreetMap contributors" --force data/processed/buildings.geojson
```

The bake decodes zoom 16 afterwards and fails if any feature id is missing.

## Storage (Q7)

Local bake only. App resolves via `src/map/storage.ts` (`local` now; R2 stub reserved).
