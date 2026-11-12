# Attribution

## OpenStreetMap

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
OpenStreetMap is open data, licensed under the [Open Data Commons Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/).

## Basemap styles / tiles

Phase 1 Option 0 defaults to free styles that do not require an API key:

- [OpenFreeMap](https://openfreemap.org/) Liberty / Dark styles (`tiles.openfreemap.org`)
- Fallback: [MapLibre demo style](https://demotiles.maplibre.org/style.json)

Respect each provider’s terms if you change the style URL.

## Libraries

- [MapLibre GL JS](https://maplibre.org/)
- [React](https://react.dev/)
- [Vite](https://vite.dev/)
- [Zustand](https://github.com/pmndrs/zustand)

## OSM extract (Option 0 S0)

Center buildings/roads tiles are clipped from the [Geofabrik western-zone](https://download.geofabrik.de/asia/india/western-zone.html) extract (ODbL). See `docs/DATA_SOURCES.md` and `docs/DATA_QUALITY.md`.

## Honesty

PuneVerse Phase 1 does **not** invent building heights. Unknown height stays flat (no extrusion). Fixture place names are labeled as fixtures. See the in-app About panel and `config/cities/pune.json` → `honesty`.
