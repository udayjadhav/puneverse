# Product requirements — PuneVerse 3D twin

**Status:** Public exploration build (open data). Not an official municipal product.

## Goal

A trustworthy, recognisable, interactive **3D digital city of Pune** that ordinary people enjoy exploring — grounded in open geospatial data with honest height provenance.

## Primary experience (current)

1. **Three.js WebGL twin** — default view (`src/scene/`)
2. Chunk-streamed buildings (~468k), terrain, water, roads/bridges, rail, trees, traffic
3. Time-of-day (IST) + place fly-to presets
4. Height sources labelled (mapped / floors / satellite / area / default) — estimates never called measured
5. Developer **data-quality mode** (Shift+D) for provenance on hover
6. About panel with sources, validation stats, generated-vs-real disclosure
7. Optional **2D MapLibre** view for basemap / PMTiles (when tiles present locally)
8. Free hosting (GitHub Pages) — no paid APIs required

## Out of scope (until higher priorities are solid)

- Cesium migration
- Fabricated building names or fake “surveyed” heights
- Speculative historical reconstructions without sources
- Live traffic / unofficial metro as if approved
- Paid cloud datasets without explicit approval
- Claiming verified full PMC ∪ PCMC coverage

## Success criteria

- `npm test && npm run typecheck && npm run lint && npm run build` pass
- `python3 -m pytest pipeline/ -q` pass
- Local `npm run dev` loads `public/scene/s0/manifest.json` and streams chunks
- Docs / About / city honesty describe the **same** product (3D-first)
- Deployed Pages assets match local bake when intentionally published

## Evolution roadmap (dependency order)

See engineering master prompt workstreams: integrity → building confidence & landmarks → historical → simulations.
