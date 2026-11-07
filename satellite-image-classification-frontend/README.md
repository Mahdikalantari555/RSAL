# TerraLoop — Active Learning Studio

A production-quality Next.js 16 (App Router) frontend **and** demo backend for human-in-the-loop
satellite image classification. Projects, GeoTIFF datasets, map labeling, the active-learning review
loop, training rounds and analytics all run against a local PostgreSQL database through Drizzle ORM.

## Stack

| Concern            | Choice                                                    |
| ------------------ | --------------------------------------------------------- |
| Framework          | Next.js 16 App Router, React 19, TypeScript (strict)       |
| Styling            | Tailwind CSS v4 + shadcn-style primitives (CVA + tailwind-merge) |
| Server state       | TanStack React Query v5                                   |
| Client state       | Zustand (`use-ui-store`, `use-map-store`, `use-labeling-store`) |
| Map                | Leaflet + Esri World Imagery tiles                        |
| GeoTIFF            | `geotiff.js` (client-side metadata parsing with graceful fallback) |
| Charts             | Recharts                                                  |
| Upload             | React Dropzone + Axios upload progress                    |
| Toasts             | Sonner                                                    |
| Database           | PostgreSQL + Drizzle ORM (`src/db/schema.ts`)             |

## Getting started

```bash
npm install
npx drizzle-kit push      # create tables
npm run dev               # http://localhost:3000
```

Demo projects, scenes, labels, query batches and training rounds are seeded lazily on the first
`GET /api/projects` request (`src/db/seed.ts`). Delete all rows from `projects` to re-seed.

### Pointing at an external backend

`src/lib/api-client.ts` reads `NEXT_PUBLIC_API_BASE_URL` (default: the in-app `/api` routes), so the
UI can target a FastAPI service (e.g. `http://localhost:8000`) that implements the same contract.

## Routes

| Page | Description |
| ---- | ----------- |
| `/` | Project dashboard: portfolio KPIs, review queue, recent rounds |
| `/projects/[id]` | Project overview: metrics, learning curve, confusion matrix, iteration log |
| `/projects/[id]/data` | GeoTIFF upload (drag & drop, progress, real metadata), dataset table, label import |
| `/projects/[id]/map` | Leaflet viewer, band combinations incl. custom RGB, opacity, drawing tools, label correction |
| `/projects/[id]/active-learning` | Uncertainty query, batch review with keyboard shortcuts, submit & retrain |
| `/projects/[id]/analytics` | Learning curve, confidence drift, per-class metrics, iteration log, CSV export |

## API contract

All handlers live under `src/app/api` and return JSON.

| Method | Endpoint | Purpose |
| ------ | -------- | ------- |
| `GET/POST` | `/api/projects` | List projects + summary / create project |
| `GET/DELETE` | `/api/projects/{id}` | Project detail / delete |
| `GET` | `/api/projects/{id}/dataset` | Scenes, samples, batches |
| `POST` | `/api/projects/{id}/upload` | Register a GeoTIFF (multipart `file` + `metadata` JSON, or JSON only) |
| `POST` | `/api/projects/{id}/query` | Create/reuse an uncertainty-ranked query batch (`size`, `strategy`, `force`) |
| `GET` | `/api/projects/{id}/predictions` | Current batch suggestions, labels, scenes, pool size |
| `POST` | `/api/projects/{id}/labels` | Submit reviewed suggestions and/or drawn samples |
| `POST` | `/api/projects/{id}/labels/import` | Bulk import GeoJSON/CSV samples |
| `PATCH/DELETE` | `/api/projects/{id}/samples/{sampleId}` | Correct or remove a label |
| `POST` | `/api/projects/{id}/train` | Run a training round and version metrics |
| `GET` | `/api/projects/{id}/metrics` | Iterations, learning curve, class distribution, confidence history |
| `GET` | `/api/health` | DB readiness probe |

## Project structure

```
src/
├─ app/
│  ├─ api/…                     # route handlers (projects, dataset, labels, query, train, metrics)
│  ├─ projects/[id]/            # overview, data, map, active-learning, analytics
│  ├─ layout.tsx, page.tsx      # shell + dashboard
│  └─ globals.css               # Tailwind v4 theme tokens (dark + light)
├─ components/
│  ├─ ui/                       # button, card, dialog, form controls, feedback primitives
│  ├─ layout/                   # app shell + theme toggle
│  ├─ projects/, data/, map/, active-learning/, charts/
├─ db/                          # Drizzle client, schema, deterministic seed
├─ hooks/                       # React Query hooks (projects, dataset, loop, metrics)
├─ lib/                         # api client, simulated model, raster, geotiff metadata, helpers
├─ store/                       # Zustand stores (ui, map, labeling drafts)
└─ types/                       # shared domain + API types
```

## Notes on the demo model

Training metrics and suggestion confidences are produced by a deterministic simulation
(`src/lib/simulation.ts`) so the full loop is explorable without a GPU. Training accuracy follows a
logarithmic data-efficiency curve, confusion matrices are class-aware, and suggestion batches are
ranked by simulated predictive entropy. Swap the simulate functions for real inference calls to move
to production.
