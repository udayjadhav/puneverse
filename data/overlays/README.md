# Overlay SAMPLE GeoJSON

**SHIP HOLD** — SAMPLE files are illustrative only.

## Current posture

| File | Layer | Notes |
| --- | --- | --- |
| `admin.sample.geojson` | admin (**sample**) | Illustrative twin-city urban extent — not official wards |
| *(removed)* | buildings | **ready** via `/tiles/buildings.pmtiles` |
| *(removed)* | roads | Spoke SAMPLE deleted; **ready** via `/tiles/roads.pmtiles` |
| *(none)* | water / parks | Still **stub** |

URL convention (MapLibre SAMPLE): `/data/overlays/{id}.sample.geojson`  
Ready PMTiles: `/tiles/{id}.pmtiles` (local tippecanoe v2.79.0 bake; gitignored).

## Honesty

- Every SAMPLE feature has `"sample": true`.
- Admin polygons are illustrative — **not** official PMC/PCMC wards.
- Heights are never invented; extrusion only with `normalized_height_m` and `height_source` in `osm_explicit` / `osm_levels_estimate`.
- Missing PMTiles → UI banner: run `pipeline/bake_center.py`.
- Product remains **SHIP HOLD**.
