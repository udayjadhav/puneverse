# Product requirements — Phase 1 Option 0 (S0 center)

**Status: SHIP HOLD**

## Goal

Ship a honest, local-runnable map for Pune & Pimpri-Chinchwad with real S0 center buildings/roads tiles, clear SAMPLE/stub labels, and disclosures before claiming city-wide production data.

## In scope (current)

1. Vite + React + TypeScript map app with MapLibre
2. City config G0 locked in `config/cities/pune.json`
3. Free open basemap (no paid cloud)
4. Layer toggles with honest UI copy (stub vs SAMPLE vs ready)
5. Fixture place search (wards + gazetteer shaped)
6. Day/night lighting style swap
7. About / honesty panel
8. Docs that match runtime reality
9. CI: lint, typecheck, test, build
10. **S0 center ready** — buildings + roads PMTiles from local tippecanoe **v2.79.0** bake (Geofabrik western-zone clip)
11. Provenanced extrusion only (`osm_explicit` / `osm_levels_estimate`); never invent heights
12. Fail-closed UI when gitignored PMTiles are missing or protocol registration fails
13. Admin remains **SAMPLE** GeoJSON; water/parks remain **stub**
14. SAMPLE road spokes removed (not shipped)

## Out of scope (this milestone)

- Creating Cloudflare R2 or Pages projects
- Overpass live queries
- Fabricated building heights or non-metre unit conversion
- Marketing neighbourhood “cool lists” as search data
- Claiming production readiness / lifting SHIP HOLD
- Full PMC ∪ PCMC overlays (S1/S2)
- Water / parks geometry
- Official admin / ward boundaries

## Success criteria (current)

- `npm install && npm test && npm run typecheck && npm run lint && npm run build` pass
- `python3 -m pytest pipeline/ -q` pass
- After `pipeline/bake_center.py`, `npm run dev` shows S0 buildings/roads; without bake, honesty banner appears
- SHIP HOLD visible in README and UI; SAMPLE admin labeled clearly
- tippecanoe documented as **in use** (v2.79.0), not deferred
