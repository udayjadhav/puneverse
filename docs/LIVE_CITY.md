# Live City intelligence

Data-driven twin layers for Pune — **free / open sources only**. Never invent readings.

Full cost/licence matrix: [`LIVE_CITY_FREE_DATA.md`](./LIVE_CITY_FREE_DATA.md).

## Architecture

```
Open-Meteo (weather, rainfall, CAMS AQI model)
        │
        ├─ local: browser direct (CORS) when VITE_LIVE_API_BASE unset
        └─ prod: Cloudflare Worker  workers/live-api  (+ cache)
                │
                ▼
        Zustand liveCityStore → Live UI panel / layers
```

**Rejected:** TomTom, HERE, paid OpenWeather, fake congestion colours.

## How to try locally (no deploy)

```bash
npm run dev
```

1. Open the **3D scene**.
2. Top-right → **Live**.
3. Open **Weather** / **Rainfall** / **Air quality**.

Without a Worker, the app calls Open-Meteo directly. Traffic stays **unavailable** (honest).

## Worker (optional, recommended for production cache)

```bash
cd workers/live-api && npm install && npx wrangler dev
# then:
VITE_LIVE_API_BASE=http://127.0.0.1:8787 npm run dev
```

Open-Meteo needs **no secret**. Optional later: `wrangler secret put OPENAQ_API_KEY` for real stations.

## Frontend map

| Piece | Path |
| --- | --- |
| Types | `src/live/types.ts` |
| Open-Meteo adapter | `src/live/providers/openMeteo.ts` |
| Client | `src/live/client.ts` |
| Store / UI | `src/live/liveCityStore.ts`, `src/live/ui/*` |

## Honesty

- Weather = **shared city sample** (centroid), not per building.
- Rainfall = **forecast/model**, not radar, until a free radar feed exists.
- Open-Meteo AQI = **CAMS model cell** (`readingKind: "model"`), not CPCB.
- Traffic congestion = **unavailable** until a credible free speed feed exists.
- Attribution: Open-Meteo (CC-BY 4.0); CAMS for air quality.

## 3D simulation (Phases A–F)

| System | Behaviour | Honesty |
| --- | --- | --- |
| `WeatherSystem` | Rain particles, wet roads, fog/sky, wind on trees, lightning if thunder code | Driven by Open-Meteo when Live is on |
| `TrafficSystem` | OSM graph, car-following, intersection pauses, density modes | Always **SIMULATED** |

UI: **Live** → Sim controls (left) + layer panel (right).

## Phases

1. ✅ Open-Meteo weather + rainfall (+ model AQI labelled)
2. OpenAQ / CPCB **station** markers (free key) — pending registration
3. ✅ OSM road graph traffic (simulated)
4. OSRM routes (never as live congestion) — later
5. Free live congestion — unavailable
6. ✅ Weather FX overlays

Do not deploy without approval.
