# Attribution

## OpenStreetMap

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
OpenStreetMap is open data, licensed under the [Open Data Commons Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/).

## Building footprints & heights

- Footprints: [Overture Maps](https://overturemaps.org/) (ODbL), including Google Open Buildings (CC BY 4.0) and Microsoft Global ML Building Footprints (ODbL)
- Heights: OSM tags where present; [GlobalBuildingAtlas](https://github.com/zhu-xlab/GlobalBuildingAtlas) satellite estimates (calibrated); [GHSL](https://ghsl.jrc.ec.europa.eu/) Built-H area estimates; typed defaults — all labelled in the UI

## Terrain & imagery

- Terrain: Copernicus DEM GLO-30
- Ground colour: Sentinel-2 L2A
- Tree candidates: ESA WorldCover

## Basemap styles / tiles (optional 2D view)

Free styles that do not require an API key:

- [OpenFreeMap](https://openfreemap.org/) Liberty / Dark styles (`tiles.openfreemap.org`)
- Fallback: [MapLibre demo style](https://demotiles.maplibre.org/style.json)

## Libraries

- [Three.js](https://threejs.org/)
- [MapLibre GL JS](https://maplibre.org/)
- [React](https://react.dev/)
- [Vite](https://vite.dev/)
- [Zustand](https://github.com/pmndrs/zustand)

## Honesty

Estimates are never presented as surveyed measurements. Generated façades, traffic and tree meshes are disclosed in About. Landmark cards cite public references. See `config/cities/pune.json` → `honesty` and `docs/DATA_QUALITY.md`.
