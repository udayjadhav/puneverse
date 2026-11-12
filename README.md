# PuneVerse

**Interactive 3D digital twin of Pune** — explore ~4.7 lakh buildings, roads, bridges, rivers, metro, and landmarks in the browser. Fly to Shaniwar Wada, Swargate, Taljai, Mundhwa Bridge, Sinhgad Fort, and more. Scrub time of day from sunrise → midday → golden hour → night.

| | |
| --- | --- |
| **Live demo** | https://udayjadhav.github.io/puneverse/ |
| **Repo** | https://github.com/udayjadhav/puneverse |
| **Cost to host** | $0 (GitHub Pages / optional Cloudflare Pages) |

English UI. Open data only. No paid tile APIs, no Overpass in the live path.

Private product analytics (PostHog) are optional and consent-gated — see [docs/ANALYTICS.md](docs/ANALYTICS.md). Nothing visitor-facing is shown in the app.

**Live City** uses free Open-Meteo for weather/rainfall (and labelled CAMS model AQI). Live congestion stays unavailable. See [docs/LIVE_CITY.md](docs/LIVE_CITY.md) and [docs/LIVE_CITY_FREE_DATA.md](docs/LIVE_CITY_FREE_DATA.md). No fabricated readings. Not deployed until you approve.

---

## What’s in the scene (baked S0)

| Asset | Approx. count | Notes |
| --- | ---: | --- |
| Buildings | **468,493** | Every footprint extruded; heights labelled by source |
| Trees | **484,604** | Instanced low-poly trees from WorldCover + obstacles |
| Road segments | **120,161** | Ribbons + multi-layer flyover stacking |
| Street lamps | **166,178** | Along major roads |
| Rail / metro lines | **259** | Elevated metro decks + piers where tagged |
| Water mesh | **8,074** triangles | Mutha / lakes, carved away from banks & buildings |
| Place presets | **29+** | One-click fly-tos (heritage, bridges, neighbourhoods) |
| Stadium bowls | **4** | Procedural bowls on real OSM stadium footprints |

Heights are **honest**: mapped OSM / floors when present; otherwise calibrated satellite (GlobalBuildingAtlas), GHSL area fallback, or typed defaults. The About panel shows the source mix.

---

## Features

- **WebGL 3D city** — chunk-streamed buildings, terrain, satellite ground, water, roads, bridges, rail, trees, traffic, rooftop props
- **Time of day** — continuous IST slider + Sunrise / Midday / Golden hour / Night presets (sky, sun, fog, night windows)
- **Search** — find localities, stations, bridges and landmarks; fly-to + info card
- **Place chips** — one-click fly camera to curated presets
- **Landmark cards** — EN/MR names, category, short sourced description (major places)
- **Detail levels** — Low → Ultra (shadows, streaming radius, prop distance)
- **Labels** — toggle floating place names
- **Pick a building** — minimal tooltip (height, ~floors, height source)
- **Data-quality mode** — Shift+D for developers (confidence + methodology)
- **About / honesty** — data sources, height breakdown bar, attribution
- **Optional 2D map** — MapLibre + OpenFreeMap (WebGL still required)
- **Fail-closed** — missing bake / WebGL errors surface in UI instead of a blank silent page

---

## Tech stack

### App (browser)

| Layer | Choice | Why |
| --- | --- | --- |
| UI | **React 19** + TypeScript | Component chrome over the canvas |
| Build | **Vite 7** | Fast HMR, ES modules, worker support |
| 3D engine | **Three.js** (~0.187) | Full control of meshes, lights, post-FX |
| State | **Zustand** | Lightweight scene UI store (`timeOfDay`, fly-to, detail, …) |
| Styling | **Tailwind CSS 4** | Utility panels over the WebGL view |
| 2D fallback | **MapLibre GL** + **PMTiles** | Vector basemap / optional extruded map mode |
| Tests | **Vitest** + Testing Library patterns | UI + pure geometry/stream helpers |
| Lint | **ESLint** + typescript-eslint | Strict TS project references |

### 3D runtime details

- Custom **chunk residency** — stream / evict building chunks by camera (keeps Ultra usable)
- **Web Workers** — decode PVB chunks + build road ribbons off the main thread
- **Procedural façade shaders** — windows, chajjas, shops, night emissives via `onBeforeCompile`
- **ACES tone mapping** — Midday capped so the city doesn’t blow out white
- **Sky + sun + bloom** — day/night tied to the IST clock
- **Instancing** — trees, tanks, stair heads, lamps, traffic

### Data bake pipeline (Python)

| Tool | Role |
| --- | --- |
| **Python 3** + NumPy / SciPy / Shapely / Rasterio / DuckDB | Clip, join, rasterize, pack binaries |
| **osmium** | Clip Geofabrik PBF → GeoJSONSeq (roads, buildings, water, land) |
| **tippecanoe** (v2.79) | Optional PMTiles for the 2D MapLibre path |
| **Overture Maps** buildings | Primary footprints for the 3D twin |
| **GlobalBuildingAtlas (GBA)** | Per-building satellite heights (calibrated vs OSM) |
| **GHSL Built-H** | 100 m area-height fallback |
| **Copernicus DEM GLO-30** | Terrain + horizon |
| **Sentinel-2 L2A** | Ground / horizon texture |
| **ESA WorldCover** | Tree candidate mask |
| **OpenStreetMap** | Roads, bridges, layers, names, stadiums, water |

Bake entrypoint: `pipeline/bake_scene.py` → `public/scene/s0/` (chunks, terrain, roads, water, manifest).

### Hosting & CI

| Piece | Choice |
| --- | --- |
| Public site | **GitHub Pages** (`gh-pages` branch) — https://udayjadhav.github.io/puneverse/ |
| Optional | **Cloudflare Pages** (`npm run deploy`) — free unlimited static bandwidth |
| CI | GitHub Actions — lint / typecheck / test / build |
| Secrets | None required for the live static twin |

---

## Repository layout

```
puneverse/
├── config/cities/pune.json     # City lock / layer status
├── public/
│   ├── scene/s0/               # Baked 3D twin (chunks, terrain, roads, …)
│   ├── data/                   # Places index, SAMPLE overlays, fixtures
│   └── tiles/                  # Optional PMTiles for 2D map (local bake)
├── src/
│   ├── scene/                  # Three.js engine + chrome UI
│   ├── map/                    # MapLibre fallback / PMTiles
│   ├── store/                  # Zustand stores
│   └── ui/                     # Shared panels
├── pipeline/                   # Python bake + height helpers
├── tools/                      # tippecanoe binaries, screenshot / reel scripts
└── docs/                       # Architecture, data, deployment, cost
```

---

## Quick start (local)

```bash
git clone https://github.com/udayjadhav/puneverse.git
cd puneverse
npm install
npm run dev          # http://127.0.0.1:5173/
```

The baked scene under `public/scene/s0/` ships with the repo so the 3D twin runs without a local bake.

### Useful scripts

```bash
npm test             # Vitest
npm run typecheck
npm run lint
npm run build        # production bundle → dist/
npm run preview      # preview dist locally
npm run deploy       # optional Cloudflare Pages (needs wrangler login)
```

### Re-bake the 3D scene (optional, heavy)

Needs local `data/raw/` + `data/processed/` (gitignored) — Geofabrik PBF, DEM, Sentinel-2, Overture, GBA, GHSL, WorldCover. See [`pipeline/README.md`](pipeline/README.md) and [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r pipeline/requirements.txt   # if present
python3 pipeline/bake_scene.py             # writes public/scene/s0/
```

---

## Height honesty

Every building carries a **height source**:

| Source | Meaning |
| --- | --- |
| Mapped height | Explicit OSM / Overture height tag |
| Mapped floors × 3 m | `building:levels` / `num_floors` |
| Satellite (GBA, calibrated) | ML height fitted against mapped refs |
| Area (GHSL 100 m) | Neighbourhood-scale fallback |
| Default by size/type | Last resort for tiny / unknown footprints |

Unknown is never silently invented as “surveyed.” The in-app About panel charts the mix.

---

## Hosting notes (site stays up)

- **Do not** force-push or recreate the GitHub repo casually — that can rate-limit or break Pages.
- Updating `README.md` on `main` does **not** redeploy the live 3D site (Pages serves the `gh-pages` branch).
- Full deploy docs: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) · cost: [`docs/COST_ESTIMATE.md`](docs/COST_ESTIMATE.md)

---

## Docs

| Doc | Purpose |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layout, Option 0, engine tradeoffs |
| [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) | OSM / Overture / DEM / satellite |
| [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md) | Height honesty, fail-closed |
| [docs/GEOGRAPHIC_BOUNDARY.md](docs/GEOGRAPHIC_BOUNDARY.md) | Extent / bbox |
| [docs/TOOLING.md](docs/TOOLING.md) | tippecanoe, osmium |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Free hosting |
| [docs/COST_ESTIMATE.md](docs/COST_ESTIMATE.md) | $0 hosting choices |
| [ATTRIBUTION.md](ATTRIBUTION.md) | Credits |
| [SECURITY.md](SECURITY.md) | Reporting / no secrets in git |
| [pipeline/README.md](pipeline/README.md) | Bake pipeline |

---

## Attribution

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).  
Building footprints / attributes also from [Overture Maps](https://overturemaps.org/).  
Terrain: Copernicus DEM. Imagery: Sentinel-2. Heights: GlobalBuildingAtlas + GHSL where labelled.  
Basemap (2D): OpenFreeMap / MapLibre demotiles.

See [ATTRIBUTION.md](ATTRIBUTION.md) for the full list.

---

## License

See [LICENSE](LICENSE).
