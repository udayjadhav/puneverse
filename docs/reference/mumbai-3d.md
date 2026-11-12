# Mumbai 3D — visual reference for PuneVerse

Site: https://mumbai-3d.easemyhood.workers.dev/ · studied 2026-11-11 · loaded OK, WebGL2.
Screenshots: `docs/reference/mumbai-3d/` (01–08). Observation only — no code, assets or data taken.

## A. City-wide
- [x] Opens on an oblique view (roughly 45–60° tilt) from about 1–3 km up; the whole south Mumbai peninsula fills the frame.
- [x] Detailed 3D covers Greater Mumbai plus neighbours (32 × 48 km). The wider Mumbai region (4,309 km²) is terrain + satellite imagery only. A "Metro region" preset shows it.
- [x] Header counter: "Greater Mumbai · 5,94,244 buildings placed from the map" (Indian digit grouping).
- [x] Colours: warm beige/sand buildings, teal-green sea, soft haze on the horizon. Ground colour comes from satellite imagery.
- [x] Very dense; every footprint is raised. Towers stand out clearly against mid-rise blocks.
- [x] Real terrain: Malabar Hill, Cumballa Hill and the Sanjay Gandhi National Park ridges rise visibly.

## B. Neighbourhood (Worli / Lower Parel / Marine Drive)
- [x] Unbroken footprint coverage, including informal settlements (tight grid of small, colourful low roofs).
- [x] Strong height variety: slums → 4–8 floor chawls → 200–320 m towers.
- [x] Flat roofs, tinted per building from satellite roof colour.
- [x] Road network as dark ribbons; flyovers are raised.
- [x] Labels at two levels: area/landmark names and ward names (spaced caps). Tall towers get name + height ("Palais Royale · 320 m").
- [x] Trees as clustered instanced canopies along streets and in open spaces.

## C. Close-up (eye about 70 m)
- [x] Walls have procedural window grids (lit/unlit cells, floor bands); facade colours vary per building.
- [x] Roof objects: water tanks, sheds and stair heads (generated, per About).
- [x] Asphalt roads with white lane markings; flyover decks with dashed lines; round low-poly trees with shadows.
- [x] Vehicles: small box cars/buses along lanes; parked trucks/containers in yards.
- [ ] Ground at street level is blurry (10 m/px imagery) — the site admits this.
- [x] Soft sun shadows from buildings and trees.

## D. Nature
- [x] Hills from Copernicus 30 m DEM; National Park ridges read clearly with lit slopes.
- [x] Forest: dense instanced tree canopy wherever tree cover is mapped.
- [x] Water: lakes as flat blue-grey surfaces; sea has animated waves (generated); beach strip.
- [x] Coastline, creeks and mangroves follow real shapes.

## E. Transport
- [x] Roads as 3D ribbons with markings; multi-level interchanges with piers.
- [x] Bandra–Worli Sea Link: hand-built cable-stayed towers. Coastal Road on piers.
- [x] Rail yards/corridors visible. Metro listed as real data in About (not checked separately).
- [x] Vehicles on roads (instanced boxes). About lists "traffic" as Generated. Animation not confirmed in automated capture (inference: simulated).
- [ ] No transit labels or popups for trains/vehicles.

## F. UI
- [x] Top-left card: city name in English + Devanagari + building count.
- [x] Top-right: Face north, Labels / Wards / Region toggles, Detail level dropdown (Auto·High, Lite, Low, Medium, High, Ultra), About.
- [x] Bottom-right: 15 preset chips that fly the camera smoothly (landmarks, Whole city, Metro region).
- [x] Time of day: IST clock + slider + Sunrise / Midday / Golden hour / Night presets, animated transition.
- [x] Bottom-left: live place readout ("Worli · G/S Ward / 19.0100° N 72.8150° E · eye 825 m").
- [x] Controls hint: drag / pinch-scroll / right-drag or Ctrl-drag to turn / WASD to fly.
- [ ] No free-text search box.
- [ ] Clicking a building opens no popup; names appear only as floating labels.
- [x] About drawer with "where heights come from" bar chart (Published 0.0%, Mapped 2.0%, Satellite 71.9%, Default 26.1%) plus Real / Generated / Limits / Data lists.

## G. Performance
- [x] Staged loading screen ("Laying out terrain and coastline", "Raising buildings from their footprints").
- [x] Detail-level picker with automatic default (inference: GPU-based quality choice).
- [x] Smooth fly-to and orbit; ~100 fps on the test machine.
- [x] Probable distance-based detail: windows, roof objects and cars only up close; far region terrain + imagery only (inference).

## H. Rendering tech
- [x] Observed: Three.js r170 (`window.__THREE__ = "170"`), WebGL2, single `<canvas id="view">`. No MapLibre / Mapbox / Cesium / deck.gl globals. Hosted on Cloudflare Workers.
- [ ] Inference: custom engine on one local metric grid; footprints extruded into custom meshes; windows in shader; trees, cars, roof objects instanced.
- [ ] Inference: data preprocessed offline into compact binary chunks streamed by camera position.

## I. Real vs generated (quoted from About)
> "Every building, road, rail line, shoreline and hill is placed from real map data in a single metric grid centred on Mumbai. Surfaces are generated on top of that geometry."

**Real:** "Building footprints and positions" · "Terrain, coastline, creeks and lakes" · "Roads, flyovers, sea bridges, rail and metro alignments" · "Ground colour and roof colour, from satellite imagery" · "Tree and mangrove cover" · "Sun position for Mumbai on 15 January"

**Generated:** "Window and facade patterns, room interiors, rooftop tanks, sheds and stair heads" · "Tree shapes, wave motion, traffic, street and window lights" · "Landmark models (Gateway of India, CSMT, BMC tower, Taj dome, Sea Link towers), built by hand on their real footprints"

**Limits:** "Towers between about 100 m and 150 m with no mapped height still read near 100 m…" · "Ground imagery is 10 m per pixel, so streets blur when you are close."

**Heights:** 235 towers ≥150 m from Wikipedia; 12,073 from map tags; the rest from Google Open Buildings 2.5D Temporal (2023).
**Data:** Overture Maps 2026-10-21.0 (OSM, Google Open Buildings, Microsoft ML Buildings); Copernicus DEM GLO-30; Sentinel-2 L2A median (Oct–Dec 2025); ESA WorldCover 2021 v200; OSM relation 13312356.

## J. Top 10 PuneVerse must match (by visual impact)
1. Every building footprint raised in 3D, with believable heights (tagged → satellite → default fallback).
2. Real terrain (Sinhagad / Parvati / Vetal hills, river valleys) plus satellite-coloured ground and roofs.
3. Time-of-day lighting with presets + slider; night city with lit windows and street lights.
4. Procedural facades: window grids, floor bands, varied wall colour; rooftop tanks and stair heads up close.
5. Instanced trees and forest from tree-cover data.
6. Water done well: Mula-Mutha, Khadakwasla, Pashan and riverbank edges.
7. Raised roads and flyovers with markings; landmark bridges and metro viaducts as custom models.
8. A few hand-built landmarks on real footprints (Shaniwar Wada, Dagdusheth, Aga Khan Palace, Pune Station).
9. Preset fly-to chips + live place/ward/coordinate readout + two-level labels.
10. Staged loading + automatic detail level + honest "About: real vs generated" panel with height-source breakdown.

## Not verified
- Traffic animation (cars static between automated frames).
- Metro line rendering.
- Sunrise and Midday presets.
