# Cost estimate

## Live hosting (chosen)

| Item | Choice | Cost |
| --- | --- | --- |
| App + baked 3D scene | Cloudflare Pages **or** GitHub Pages | **$0** |
| Source repo | GitHub | **$0** (public) |
| Basemap (2D mode) | OpenFreeMap / MapLibre demo | **$0** (provider terms) |
| Bake inputs (DEM, S2, Overture, OSM, GHSL) | Local `data/` only — not hosted | **$0** download / storage on your machine |

Cloudflare Pages Free: unlimited static bandwidth, 500 builds/month, 25 MiB max file.
GitHub Pages: soft ~100 GB/month bandwidth — enough for sharing, not for a viral CDN.

## Explicitly avoided

| Item | Why |
| --- | --- |
| R2 / S3 egress | Not needed while scene ships in the static site (~81 MB) |
| Vercel / Netlify Hobby | Bandwidth caps; Cloudflare is cheaper for fat 3D assets |
| Paid tile / geocoding APIs | Not used |
| Always-on GPU / bake VMs | Bake stays on the laptop |

Revisit this file if scene size exceeds Pages’ 25 MiB/file limit (then put only oversized binaries on R2 free tier: 10 GB storage, 10 M Class A / month).
