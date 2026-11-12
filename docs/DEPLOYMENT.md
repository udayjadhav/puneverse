# Deployment — free hosting

PuneVerse is a static Vite + Three.js app (~81 MB baked scene). No server, no paid tile API.

## Recommended (best free): Cloudflare Pages

- **Cost:** $0 — unlimited static asset requests / bandwidth on Free
- **Limits that matter:** 25 MiB per file (our largest bake file is ~18 MB), 20 000 files/site (we have ~780)
- **URL:** `https://puneverse.pages.dev` (or a free `*.pages.dev` custom subdomain)

```bash
npx wrangler login          # once — opens browser
npm run deploy              # build + wrangler pages deploy dist
```

Create a free Cloudflare account if needed. No R2 required while `public/scene/` ships inside `dist/`.

## Default CI (also free): GitHub Pages

On every push to `main`, `.github/workflows/deploy-pages.yml` builds with
`VITE_BASE=/<repo>/` and publishes to GitHub Pages.

1. Repo **Settings → Pages → Source: GitHub Actions**
2. After the workflow is green: `https://<user>.github.io/<repo>/`

GitHub Pages is fine for portfolio traffic. If the twin gets heavy visit volume, switch the same `dist/` to Cloudflare Pages (`npm run deploy`) — static egress stays $0 there.

## Local preview (no host)

```bash
npm run build && npm run preview
```

## Not used (keeps cost at $0)

- Cloudflare R2, Workers paid CPU, Vercel/Netlify bandwidth caps
- Paid map tile / geocoding APIs
- Always-on bake machines (`data/raw` and `data/processed` stay local / gitignored)
