# Q1–Q8 decisions (user GO for ingest)

**Date:** 2026-11-11  
**Effect:** Unlocks Geofabrik download + Option 0 real-data bake. Product SHIP still HOLD.

| # | Decision | Detail |
|---|----------|--------|
| Q1 | **Yes** — Geofabrik western-zone ~211 MB | Store in gitignored `data/raw/`. Verify Pune coverage before processing. |
| Q2 | **Defer** Google Open Buildings 2.5D | OSM baseline first; revisit as supplementary footprints later. |
| Q3 | **Tippecanoe binary** | Pinned reproducible version; no Docker prerequisite; record version + build command. |
| Q4 | **Bharatlas** PMC wards | Subject to verification vs official PMC; OSM admin ≠ automatic ward SoT. |
| Q5 | **Defer** Microsoft Global ML Buildings | Measure OSM coverage/gaps first. |
| Q6 | **No extrusion** when height unknown | Never invent heights; 2D footprints until defensible height or levels. |
| Q7 | **Local bake only** initially | Design storage interface for later R2 without redesign. |
| Q8 | **Mild pitch** default | Flat-map option retained; strong pitch not default. |

## Locked kill rules (still)
- No silent heights
- No Overpass as production harvest
- No full-PMR building LOD in Phase 1
- Free path only (ask before paid)
