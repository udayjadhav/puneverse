# Data quality — 3D scene bake

This document describes the **Three.js scene** under `public/scene/s0/` (current product). Older S0 PMTiles notes for the optional 2D MapLibre path are kept only as historical context at the end.

## Building height provenance

Every extruded building carries a height **source** baked into the scene binary:

| Source | Meaning | Confidence | Estimate? |
|--------|---------|------------|-----------|
| `mapped` | OSM / Overture explicit height tag | high | no |
| `floors` | `building:levels` × 3.0 m | medium | **yes** |
| `satellite` | GlobalBuildingAtlas ML height, affine-calibrated on mapped buildings in this bake | medium | **yes** |
| `area` | GHSL Built-H ~100 m neighbourhood raster | low | **yes** |
| `default` | Conservative default from footprint area / type | low | **yes** |

**Rule:** estimates are never labelled as measured or surveyed. The About panel and Shift+D data-quality mode expose the same vocabulary.

Client mapping: `src/scene/provenance.ts`. Pipeline: `pipeline/` height helpers + `bake_scene.py`.

## Current bake (manifest)

Live numbers come from `public/scene/s0/manifest.json` → `stats.height_sources` (example order of magnitude: ~468k buildings; vast majority `satellite`).

Validation against mapped heights / floors×3 (when present) is stored under `stats.height_validation_gba` and summarised in the About panel. Investigate bias before expanding the height pipeline.

## Geographic extent

`extent_lonlat` on the manifest is authoritative for the 3D bake (roughly Sinhgad–Wagholi). This is **not** a verified claim of full PMC ∪ PCMC coverage.

## Developer inspection

Press **Shift+D** in the 3D view:

- Colour legend by height source
- Hover tooltip shows confidence + methodology

Ordinary users do not see this mode by default.

## Landmark identity

Curated place cards: `src/scene/landmarks/content.ts`. Positions always come from the bake (OSM / Overture). Cards cite public references; no fabricated names.

## Known limitations

- Most heights are ML / area estimates with documented error vs sparse OSM tags
- Generated façades, tanks, traffic and tree meshes are not real surveys
- SAMPLE admin overlays (2D) are illustrative only
- Historical / simulation layers are not yet product features

## Optional 2D MapLibre path (secondary)

If local PMTiles exist under `public/tiles/`, the 2D view may still show OSM height/floors extrusions only (others flat). That path does **not** redefine the product — the 3D twin is default.
