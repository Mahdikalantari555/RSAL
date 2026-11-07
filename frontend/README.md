# TerraLab — RSAL frontend

Human insight. Earth intelligence. A satellite active-learning workspace wired
**exclusively** to the RSAL FastAPI backend — every query, label, training run,
and metric is real. There is no demo mode and no frontend database.

## What you can do

- **Projects** — create projects with 2–12 land-cover classes; live stats
  (labels, patches, accuracy, F1, model version) come from the backend.
- **Datasets** — drag-and-drop GeoTIFF upload (≤100 MB), metadata inspector,
  2D/3D preview, download-free client-side band rendering (true color, false
  color/NIR, NDVI, custom RGB), dataset deletion (cascades labels + exports).
- **Active learning** — query batches with diversity (cold start), entropy,
  margin, least-confidence, or hybrid strategies; review on a Leaflet map
  (WGS84 basemap, or pixel-space view for scenes without a CRS) with real patch
  outlines and spectral previews.
- **Labeling** — keyboard-first review (`1–9` class, `Enter` accept, `S` skip,
  `←/→` navigate, `N` note, `P` point, `?` help), batch grid mode with
  accept-all, point/polygon/rectangle drawing, GeoJSON/CSV import with class
  mapping, label correction (versioned) and deletion.
- **Analytics** — learning curve from real training history, class
  distribution, confusion matrix, per-class precision/recall/F1/support,
  CSV + JSON export.

## Architecture

```
Browser ── /api/* (Next.js route handlers = BFF adapter) ── RSAL_API_URL ──► FastAPI
```

- `src/lib/server/` — the adapter: translates browser shapes to the RSAL
  contract, reprojects coordinates with proj4 (UTM/NAD83/WGS84), fans out
  project stats, proxies raster bytes, and passes backend errors through
  with actionable messages. `RSAL_API_TOKEN` never reaches the browser.
- `src/stores/review-queue.ts` — RSAL queries are stateless, so the current
  batch persists in the browser (zustand + localStorage) and is reconciled
  with saved labels from `GET /labels`.
- `src/lib/geotiff.ts` — renders band combinations in-browser from the
  original GeoTIFF (2–98% stretch, ≤1200 px).
- Scenes without a usable CRS fall back to a pixel-space map (Leaflet
  `CRS.Simple`, no basemap); labels are stored in pixel coordinates.

## Run locally

Start the backend first (repo root):

```bash
.venv/bin/uvicorn app.main:app --port 8000
```

Then:

```bash
cd frontend
npm install
cp .env.example .env.local        # optional; defaults to http://localhost:8000
npm run dev                       # http://localhost:3000
```

Production: `npm run build && npm start`. Quality gates: `npm run typecheck`,
`npm run lint`.

| Variable | Default | Purpose |
|---|---|---|
| `RSAL_API_URL` | `http://localhost:8000` | Backend base URL (server-side only) |
| `RSAL_API_TOKEN` | — | Optional bearer token, kept server-side |

## Docker

From the repo root: `docker compose up -d --build` starts the API on `:8000`
and this frontend on `:3000` (`RSAL_API_URL=http://api:8000`). The image is a
multi-stage build running the Next.js standalone server as a non-root user.

## End-to-end smoke test

With both services running (repo root):

```bash
.venv/bin/python scripts/frontend_smoke.py --base http://localhost:3000
```

Creates a project, uploads a synthetic GeoTIFF, and exercises the whole loop
through the browser-facing API: cold-start diversity query → labels → train →
metrics → model-based queries → corrections → polygon labels → import →
deletes → cleanup.
