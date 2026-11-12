# Data quality

## Height honesty (Q6)

Normalization lives in `pipeline/heights.py` (tested by `pipeline/test_heights.py`).

| Rule | Behaviour |
|------|-----------|
| OSM `height` (or `building:height`) in metres / bare number | `normalized_height_m`, `height_source=osm_explicit`, `height_confidence=high` → extrudes |
| OSM `height` in ft / feet / ′ / ' | Converted to metres, flag `unit_ft_converted` |
| OSM `height` unparseable (`30-40m`, words) or ≤ 0 | Ignored with a flag; falls through to floors or unknown |
| OSM `height` > 300 m | Kept, flag `height_suspicious_gt_300m` |
| OSM `building:levels` only | `normalized_height_m = levels × floor_height_m` (default 3.0 m, `--floor-height-m`), `height_source=osm_levels_estimate`, `height_confidence=medium` → extrudes, labelled as an estimate |
| `building:levels` unparseable (`Ground+3`) or 0 | Unknown, flag recorded |
| Neither | `height_source=unknown`, **no** `normalized_height_m` → **flat footprint only** |
| Base | `min_height`, else `building:min_level × floor_height_m`; a base ≥ height is reset to 0 and flagged `base_clamped` |
| Invented / default metres | **Forbidden** |

Every building keeps `height_raw` / `levels_raw` / `min_height_raw` / `min_level_raw` when tagged, plus `validation_status` (`ok` / `warning`) and `validation_flags`. `source_dataset` (`osm-geofabrik-western-zone@<PBF date>`) and `source_feature_id` (`w123` / `r456`) give provenance. All other OSM tags (addresses, brands, and so on) are dropped from the tiles.

### S0 center coverage (bake of 2026-11-09 data)

| | Count | Share of 16,772 buildings |
|---|---:|---:|
| OSM height tag | 85 | 0.51% |
| Floors estimate | 129 | 0.77% |
| No height (flat) | 16,558 | 98.72% |

Plus 20 `building:part` ways (8 with a height). The raw clipped PBF holds about the same number of height-tagged building ways (212 with `height` or `building:levels`), so the sparsity comes from OpenStreetMap itself, not from the pipeline. Live numbers: `public/data/buildings.stats.json`.

SAMPLE GeoJSON must not carry height/levels keys. Roads SAMPLE spokes are **not** shipped.

## Stages

| Stage | Clip | Notes |
|-------|------|-------|
| **S0** | Center bbox ±0.025° around `[73.8567, 18.5204]` | `data/boundaries/pune-center.geojson` — **current** buildings/roads ready |
| S1 | PMC polygon | Bharatlas / official PMC wards — next |
| S2 | PMC ∪ PCMC | Corp boundaries + cantonments policy |

## Coverage

Geofabrik **western-zone** (India) includes Maharashtra and therefore Pune. Boundary polygon: `data/boundaries/western-zone.poly` (Geofabrik). MD5 published alongside PBF: `western-zone-latest.osm.pbf.md5`.

## Fail-closed publish + runtime

Do not flip `layers.*.status` to `ready` unless:

1. PMTiles exist under `public/tiles/` after bake (files are **gitignored**)
2. Manifest written (`data/processed/manifest-s0.json`)
3. No `sample:true` on baked features
4. CRS WGS84 / CRS84 checks pass

At runtime, before treating ready overlays as loaded:

1. Probe `/tiles/*.pmtiles` (or detect fetch/source failure)
2. If missing → set store banner **Tiles missing — run pipeline bake**; do not silently show empty ready
3. If `registerPmtilesProtocol` fails → visible protocol banner

tippecanoe **v2.79.0** is used for the bake (not deferred). Product remains **SHIP HOLD**.

## Stage 2 audit — S0 bbox `73.8317,18.4954,73.8817,18.5454` (measured 2026-11-11)

### Tiles (decoded with `tippecanoe-decode`)

| Archive | Source layers | Zooms | Size | Features in source | Distinct at maxzoom |
|---|---|---|---|---|---|
| `buildings.pmtiles` | `buildings` | 12–16 | 8.4 MB | 44,292 (44,272 buildings + 20 parts) | 44,292 ids at z16, none dropped |
| `roads.pmtiles` | `roads` | 10–16 | 0.89 MB | 6,718 | rebaked; old bake stopped at z12 (`-zg`) and overwrote the OSM `layer` tag |
| `context.pmtiles` | `water, waterway, green, rail, station, place, tree` | 10–16 | 0.24 MB | see below | all layers present at z14/z16 |

Roads now keep only `highway, name, name:en, ref, bridge, tunnel, layer, oneway, lanes` (was 109 keys). Geometry validity: 0 invalid building polygons, 0 invalid context polygons (shapely).

### Raw OSM clip tags (buildings)

| Tag | Buildings with it |
|---|---|
| `height` / `building:height` | 90 raw → 85 usable (others unparseable / ≤ 0) |
| `building:levels` | 184 raw → 129 used where no height |
| `min_height` | 6 · `building:min_level` 4 |
| `roof:shape` | 34 ways |
| `building:part` | 20 features (8 with a height) |

The limit is the source data, not the pipeline: raw height keys are kept as `height_raw`, `levels_raw`, `min_height_raw`.

### Overture Maps buildings, release `2026-10-21.0` (DuckDB, STAC-selected files, bbox predicate)

| Field | Count of 44,276 | % |
|---|---|---|
| `height` | 84 | 0.19 |
| `num_floors` | 167 | 0.38 |
| `min_height` / `min_floor` | 1 / 2 | ~0 |
| `roof_shape` / `roof_height` | 12 / 0 | 0.03 / 0 |
| `names.primary` | 642 | 1.45 |
| `subtype` / `class` | 676 / 592 | 1.5 / 1.3 |

Footprint source: Google Open Buildings 23,894 · OpenStreetMap 16,769 · Microsoft ML Buildings 3,613. All 84 heights come from OpenStreetMap. `building_part`: 19, all OSM. Overture adds footprints but no new heights here.

### Conflation (pipeline/conflate.py)

OSM kept as is. Overture features sourced from OSM are the same ways (500-sample IoU ≥ 0.99 for 498, matched by `record_id`) and are dropped. Non-OSM footprints are dropped if IoU ≥ 0.3 or ≥ 50% of their area lies inside one OSM footprint.

| Result | Count |
|---|---|
| OSM buildings | 16,772 |
| Overture added (Google 23,888, Microsoft 3,612) | 27,500 |
| Dropped by IoU / containment | 0 / 7 |
| Buildings with a height | 214 (0.48%) — unchanged; the rest stay flat (Q6) |

Each feature carries `source` (`osm`/`overture`), `source_id`, `footprint_dataset`, `height_source`.

### Google Open Buildings 2.5D heights

Public bucket `gs://open-buildings-data` has v1–v3 footprints only. The 2.5D Temporal heights are Earth Engine only (`GOOGLE/Research/open-buildings-temporal/v1`) → blocked without an Earth Engine–enabled Google Cloud project.

### Context layers from the OSM clip

| Layer | Count |
|---|---|
| Water polygons (incl. Mula-Mutha river, 18 wastewater excluded from fill) | 39 |
| Waterways (Mula, Mutha, Mula-Mutha, canals, streams) | 24 |
| Green (park 58, pitch 80, grass 23, garden 20, wood 15, scrub 10, …) | 219 |
| Rail ways (rail 126, metro 90; 38 metro on viaduct) | 216 |
| Stations (metro 23, rail 2) | 25 |
| Place labels (suburb / locality) | 25 |
| Surveyed trees (`natural=tree`) | 1,719 |

Licence: Overture buildings theme ODbL; Google Open Buildings CC BY 4.0; Microsoft footprints ODbL (docs.overturemaps.org/attribution).
