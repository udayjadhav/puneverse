# PuneVerse analytics (PostHog Cloud)

Private product analytics for the public site. Visitor data is **not** shown in the PuneVerse UI. You read insights only in your PostHog account.

## Architecture

| Piece | Role |
| --- | --- |
| `src/analytics/client.ts` | Lazy PostHog SDK init; fail-closed without config/consent |
| `src/analytics/events.ts` | Typed `pv_*` event registry |
| `src/analytics/consent.ts` | Local preference (`pv_analytics_consent_v1`) |
| `src/analytics/ConsentBanner.tsx` | Accept / reject + later prefs |
| `src/analytics/session.ts` | Meaningful interaction counter + throttled heartbeat |
| `src/analytics/clickDetect.ts` | Click vs camera-drag for 3D building picks |

Analytics never block scene load. SDK import is deferred. Workers are not instrumented.

## 1. Create a PostHog project

1. Sign up at [posthog.com](https://posthog.com) (Cloud US or EU).
2. Create a project (e.g. `PuneVerse`).
3. Enable **MFA** on your account.
4. Copy the **project API key** (`phc_…`) — *not* a personal API key.
5. Note the ingest host:
   - US: `https://us.i.posthog.com`
   - EU: `https://eu.i.posthog.com`
6. Do **not** invite others or share dashboards publicly unless you intend to.

## 2. Local env (optional)

```bash
cp .env.example .env.local
# edit:
# VITE_ANALYTICS_ENABLED=true
# VITE_POSTHOG_KEY=phc_…
# VITE_POSTHOG_HOST=https://us.i.posthog.com
npm run dev
```

Analytics stay **off** in local/dev unless `VITE_ANALYTICS_ENABLED=true` and a key are set. Missing config never breaks the site.

## 3. GitHub Pages production

Repository → **Settings → Secrets and variables → Actions**:

| Name | Type | Value |
| --- | --- | --- |
| `VITE_POSTHOG_KEY` | Secret | `phc_…` project key |
| `VITE_POSTHOG_HOST` | Variable (optional) | `https://us.i.posthog.com` or EU host |
| `VITE_ANALYTICS_ENABLED` | Variable (optional) | `true` (workflow default) |

The deploy workflow (`.github/workflows/deploy-pages.yml`) injects these into the Vite build. Redeploy after setting secrets.

## 4. Consent & privacy

- Banner appears only when analytics is configured and preference is unset.
- **Accept** → opt-in capture + session replay (inputs masked).
- **Reject** → opt-out; no product events.
- Preference persists in `localStorage`; small “Analytics: on/off” control to change later.
- Respects browser DNT (`respect_dnt`).
- No names, emails, passwords, or raw search text (only `query_len` / `hit_count`).
- Page views omit raw query strings; UTM params are allow-listed.
- IP capture disabled in client init (`ip: false`); confirm project IP anonymisation in PostHog → Project settings.
- Retention / deletion: PostHog → Project settings → Data management (set retention and delete persons as needed).

Anonymous analytics uses a pseudonymous browser id. It does **not** reveal a visitor’s real-world identity. Do not attempt fingerprinting.

## 5. Event taxonomy

| Event | When |
| --- | --- |
| `pv_page_view` | First capture after consent |
| `pv_session_started` | Consent grant / init |
| `pv_scene_loaded` / `pv_scene_load_failed` | 3D load outcome |
| `pv_view_changed` | 3D ↔ 2D |
| `pv_search_submitted` | Search result chosen (`query_len`, `hit_count`) |
| `pv_search_result_selected` | Chosen place name/type |
| `pv_place_selected` / `pv_landmark_selected` | Preset / curated landmark |
| `pv_building_selected` | Intentional click (3D or 2D), not hover |
| `pv_camera_exploration` | Throttled distance/pitch buckets |
| `pv_time_of_day_changed` / `pv_time_preset_selected` | Time controls |
| `pv_detail_level_changed` / `pv_labels_toggled` | Scene chrome |
| `pv_map_theme_changed` / `pv_map_view_mode_changed` | 2D map |
| `pv_about_opened` | About panel |
| `pv_session_engagement` | Heartbeat while active |
| `pv_consent_changed` | Consent change |

Not tracked: hover, FPS, chunk streaming, worker messages, pointer moves.

## 6. Session replay

Enabled only after consent. Inputs and `[data-ph-mask]` are masked.

**Limitation:** WebGL / MapLibre canvas pixels are generally **not** reconstructed in replay. Rely on custom `pv_*` events for 3D/2D actions. Validate a real replay in your project after deploy.

## 7. Suggested dashboards (create in PostHog UI)

### A — Overview
Unique users, sessions, new vs returning, referrers, countries, devices, `pv_page_view` trends.

### B — Pune exploration
Breakdowns of `pv_landmark_selected`, `pv_place_selected`, `pv_building_selected`, `pv_search_result_selected`, `pv_view_changed` (scene vs map), time/detail prefs.

### C — Engagement
`pv_session_engagement`, session duration (PostHog sessionization), paths between place → building → about.

### D — Product quality
`pv_scene_loaded` vs `pv_scene_load_failed` rate; 2D fallback (`pv_view_changed` → map); device × engagement.

Do not claim dashboard numbers until events appear in **Activity** after a consented production visit.

## 8. Verify

1. Production (or local with env on) → Accept consent.
2. PostHog → **Activity** → confirm `pv_page_view`, `pv_scene_loaded`, interactions.
3. Reject consent → confirm events stop.
4. Session replay list → open a recording (canvas may be blank; events should still show).

## 9. Disable

- Remove `VITE_POSTHOG_KEY` secret / set `VITE_ANALYTICS_ENABLED=false` and redeploy.
- Or reject consent in the UI (visitor-level).

## 10. Known limits

- Browser-close end-of-session is not reliable; use PostHog sessionization + heartbeats.
- Idle tabs do not inflate engagement (5‑minute idle gate).
- Building click needs intentional tap (movement &gt; 8 px = drag, ignored).
- No public admin analytics UI in PuneVerse by design.
