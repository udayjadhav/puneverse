# Live City — zero-cost data sources

**Policy:** no paid subscriptions, no TomTom/HERE, no recurring API spend.  
**Honesty:** never invent readings. Missing → `unavailable` / `planned`.

Commercial note: Open-Meteo’s **free** tier is **non-commercial** (CC-BY 4.0). PuneVerse as a free, ad-free open-data exploration project fits that definition today. If the project later adds ads, subscriptions, or commercial sponsorship, Open-Meteo requires a paid plan — stop free-tier use first.

## Cost matrix

| Source | Class | Licence / terms | Attribution | Refresh (our cache) | Coverage (Pune) | Limits | Hosting cost | Commercial? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Open-Meteo Forecast** | Free with rate limits | Free API non-commercial; data CC-BY 4.0 | Open-Meteo + underlying NWP models | 10–15 min | Full scene (model grid ~1–11 km) | 10k/day, 5k/h, 600/min (IP / CF user) | ₹0 (API); Worker free tier optional | **Free tier: non-commercial only** |
| **Open-Meteo Air Quality** | Free with rate limits | Same as above; CAMS ENSEMBLE | Open-Meteo + CAMS | 30–60 min | Model grid ~45 km (global CAMS) | Same free limits | ₹0 | Non-commercial free tier |
| **OpenAQ v3** | Free with registration | Free within rate limits; **source licences vary** | OpenAQ + original agency | 30–60 min | Station-based (verify Pune locations) | Key required; ~60/min, 2k/h | ₹0 API; key in Worker secret | Free general use; attribute sources |
| **CPCB / data.gov.in** | Open gov / registration | Indian open-gov terms (verify per dataset) | CPCB / India | As published | Official stations if feed works | Portal / API dependent | ₹0 | Usually OK with attribution — validate each feed |
| **OpenStreetMap** | Open data + attribution | ODbL | © OpenStreetMap contributors | Bake / static | Roads, POIs already in twin | Overpass politeness | ₹0 (already baked) | Share-alike applies to derivatives |
| **OSRM** (public demo / self-host) | Free with rate limits | Routing on OSM | OSM + OSRM | On demand | Routes, not live speed | Public demo: polite use; prefer self-host later | ₹0 demo / CF or own host | Do **not** label as live traffic |
| **TomTom / HERE / Google traffic** | **Paid — reject** | — | — | — | — | — | Recurring | Rejected under zero-cost policy |
| **OpenWeather paid tiers** | **Paid — reject** | — | — | — | — | — | Recurring | Rejected (Open-Meteo replaces) |

## Layer decisions

### Weather & rainfall — Open-Meteo (Phase 1) ✅

- One shared sample at scene centroid (not per building).
- Optional multi-point rainfall samples across the bbox for spatial variation.
- Fields: temp, feels-like, humidity, wind, clouds, precip, precip probability, hourly forecast, WMO weather codes.
- Rainfall layer uses precipitation intensity / probability from the same fetch — labelled **forecast/model**, not radar observation.
- Attribution in UI meta + About.

### Air quality — Phase 2

| Approach | Status | Honesty |
| --- | --- | --- |
| Open-Meteo CAMS (no key) | Implement as **model grid** | `readingKind: "model"` — **not** a CPCB station |
| OpenAQ stations | Preferred for markers | Needs free API key in Worker; CORS blocks browser-direct |
| CPCB / data.gov.in | Investigate | Station truth when a stable open feed exists |

No AQI heatmap until multiple real stations (or a documented model surface) justify it.

### Traffic — Phase 5 investigation

- OSM geometry: already in the 3D scene.
- OSRM: routing / ETA only — **never** painted as congestion colours.
- Live congestion: **unavailable** until a credible **free** speed feed exists (none selected yet).
- Reject fake green/yellow/red.

### Flood — Phase 6+

- Elevation/terrain: already Copernicus DEM in scene.
- Modelled susceptibility only with a documented open method + clear “modelled, not observed” label.
- No “live flood detection” without observations.

### Infrastructure — Phase 3

- Continue improving OSM-derived roads, rail, metro, parks, water, amenities (existing bake + future OSM refreshes).
- ODbL attribution already in About.

## Architecture (unchanged shape)

```
Open-Meteo (no key) ──┐
OpenAQ (optional key)─┼─► Cloudflare Worker /v1/live  ──► liveCityStore ──► UI
OSM / OSRM (later) ───┘         ↑
                         Cache-Control / Cache API
```

Local fallback: if `VITE_LIVE_API_BASE` is empty, the frontend may call Open-Meteo **directly** (CORS allowed) for weather/rainfall/model AQI so `npm run dev` shows real data without deploying a Worker. Production should prefer the Worker for shared caching and OpenAQ.

## Cloudflare free-tier notes

- Workers free tier is enough for a cached city snapshot every 10–15 minutes for a hobby site.
- Open-Meteo rate limits are friendlier when requests come from a Cloudflare Worker (limits applied per CF user).
- Do not poll per camera move or per building click.

## Rejected (zero-cost policy)

- TomTom Traffic, HERE Traffic, Google Roads live traffic.
- Any weather/AQI vendor that requires a paid subscription for basic current conditions.
- Fake congestion colours presented as live.
- Fabricated AQI / weather readings.

## 3D simulation honesty

| Effect | Driven by | Label |
| --- | --- | --- |
| Rain particles, wet roads, fog, wind sway, lightning | Open-Meteo when Live is on | LIVE / FORECAST |
| Vehicles on OSM roads | Procedural microscopic sim | Always **SIMULATED** |
| Live congestion colours | — | **UNAVAILABLE** |
