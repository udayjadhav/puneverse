# Contributing

## Setup

```bash
npm install
npm run dev
```

## Checks before PR

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Rules for Phase 1

- Do not invent building heights or ship them as “real.”
- Do not call Overpass from the client or pipeline stubs.
- Keep fixture place names clearly fixture-shaped.
- Update honesty strings in `config/cities/pune.json` when disclosures change.
- Prefer free basemap styles that need no API key.

## Pipeline

See `pipeline/README.md`. Raw OSM PBFs stay in `data/raw/` (gitignored).
