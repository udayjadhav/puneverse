# Tooling

## tippecanoe (Q3 — binary, not Docker)

| Item | Value |
|------|-------|
| Version | **2.79.0** |
| Install (preferred) | `brew install tippecanoe` |
| Fallback | Extract Homebrew bottle into `tools/bin/` (Felt/Mapbox GitHub releases ship source tarballs only — no macOS arm64 assets as of 2026-11-11) |
| Verify | `tippecanoe -v` → `tippecanoe v2.79.0` |
| Repo copy | `tools/bin/tippecanoe` (+ helpers) may be present for PATH-less CI |

**Note:** If Homebrew is blocked by an untrusted third-party tap, extract the tippecanoe bottle into `tools/bin/` (offline fallback) or temporarily disable that tap, then `brew install tippecanoe`.

## osmium-tool

| Item | Value |
|------|-------|
| Version | **1.19.1** (libosmium 2.23.1) |
| Install | `brew install osmium-tool` |
| Verify | `osmium --version` |
| Role | Clip PBF (`osmium extract`), filter tags, export GeoJSON |

## Python pipeline

- Prefer system/`brew` Python 3.9–3.12 for pytest (`shapely` optional).
- Bake script `pipeline/bake_center.py` shells out to **osmium** + **tippecanoe** (no pyosmium required).

```bash
# after western-zone PBF lands in data/raw/
python3 pipeline/bake_center.py
python3 -m pytest pipeline/test_crs_validity.py -q
```

## Node

```bash
npm install
npm test
```

`pmtiles` npm package registers the MapLibre `pmtiles://` protocol (`src/map/pmtiles.ts`).
