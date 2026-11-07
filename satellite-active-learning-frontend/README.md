# TerraLab

**Human insight. Earth intelligence.** A responsive, map-first satellite classification workspace for active learning and human-in-the-loop review.

## Stack

- Next.js App Router, React 19, strict TypeScript
- Tailwind CSS v4 and shadcn/ui-style, accessible Radix components
- TanStack Query for server state, mutation lifecycles, caching, and invalidation
- Zustand for client workspace state, persisted theme, and local review drafts
- PostgreSQL with Drizzle ORM for projects, datasets, samples, and iterations
- React Leaflet / Leaflet for interactive geospatial labeling
- geotiff.js for GeoTIFF metadata, percentile-stretched RGB, infrared composites, and NDVI
- proj4 for WGS84, Web Mercator, WGS84 UTM, and NAD83 UTM coordinate conversion
- deck.gl for GPU-accelerated, interactive raster inspection
- React Dropzone, Recharts, Lucide icons, and Sonner notifications
- Locally hosted Inter fonts

## Getting started

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and configure `DATABASE_URL`.
3. Start PostgreSQL and apply the schema with `npx drizzle-kit push`.
4. Run `npm run dev` and open http://localhost:3000.

In the managed sandbox, run its build/start tool first to bootstrap PostgreSQL before applying the schema.

### Validation

```sh
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
```

### End-to-end smoke test

With the production app running and the local demo backend enabled:

```sh
npx playwright install --with-deps chromium
npx tsx scripts/smoke.ts
```

This creates a temporary project, writes and uploads a real four-band GeoTIFF, checks RGB/NDVI rendering, exercises manual drawing and batch labeling, verifies retraining and corrections, imports ground truth, exports metrics, and deletes the temporary data in a `finally` block. Set `TEST_BASE_URL` to target a different local preview URL. Do not run it against an external classification service.

## Two backend modes

### Persistent local demo (default)

The Next.js API stores all changes in PostgreSQL. On first use, it seeds three sample projects, an illustrative Sacramento scene, twelve review candidates, and seven historical iterations. The original demo imagery is an illustration, not a measured Sentinel-2 acquisition; displayed demo spectral metadata and model metrics are illustrative.

Creating projects, uploading real files, reading GeoTIFF metadata, rendering bands, drawing geometries, reviewing labels, skipping candidates, importing ground truth, and exporting reports all work locally. **Uncertainty sampling and model retraining are explicitly simulated in local mode.** No claim of actual ML model training is made. Uploaded GeoTIFF RGB and NDVI rendering uses real raster values.

Uploaded files are stored under `storage/uploads/` and served through a filename-validated API route. Persist that directory and PostgreSQL together when deploying. Files are limited to 100 MB each. PostgreSQL transactions and project-level locks protect batch labeling and demo iterations from duplicate concurrent submissions.

### External classification backend

Set this **server-side** environment variable and restart:

```dotenv
SATELLITE_API_URL=http://localhost:8000
# Optional:
SATELLITE_API_TOKEN=your_server_side_bearer_token
```

All `/api/projects` requests are then proxied to the external service, keeping tokens off the client and avoiding browser CORS issues. External connection failures return an actionable 502 error; they do not silently fall back to fabricated results. `localhost` refers to the Next.js server/container, not the user's browser. If your Python API runs elsewhere, use its reachable hostname instead.

The proxy has a 120-second timeout. An upstream API should return the typed contracts in `src/types/index.ts`, or adapt responses in `src/lib/api.ts`. The current training contract is synchronous (response after completion); adapt `useTrain` to poll a job endpoint if your service performs asynchronous training.

### API contract

| Method | Endpoint                           | Body / result                                                       |
| ------ | ---------------------------------- | ------------------------------------------------------------------- |
| GET    | `/projects`                        | `Project[]`                                                         |
| POST   | `/projects`                        | `{ name, description, classes: [{ id, name, color }] }` → `Project` |
| GET    | `/projects/:id`                    | `Project`                                                           |
| POST   | `/projects/:id/upload`             | multipart `file`, optional PNG `preview` → `Dataset`                |
| GET    | `/projects/:id/dataset`            | `Dataset[]`                                                         |
| DELETE | `/projects/:id/dataset/:datasetId` | `{ deleted: true }`                                                 |
| POST   | `/projects/:id/query`              | `{ batchSize: 12, strategy: "entropy" }` → `{ samples, existing }`  |
| GET    | `/projects/:id/predictions`        | `Sample[]`, including reviewed/manual samples                       |
| POST   | `/projects/:id/labels`             | `{ labels: LabelInput[] }` → `{ saved: number }`                    |
| POST   | `/projects/:id/train`              | `{}` → `{ iteration: Iteration, demo: boolean }`                    |
| GET    | `/projects/:id/metrics`            | `Metrics`                                                           |

Browser calls prepend `/api`. Errors use `{ error: string }` and meaningful HTTP status codes. Query strategies: `entropy`, `margin`, and `least-confidence`. The demo preserves a pending batch rather than replacing outstanding work.

`Dataset.bounds` uses `[west, south, east, north]` in WGS84. `SampleGeometry` coordinates follow GeoJSON longitude/latitude order. Class IDs in labels must match the project's returned class definitions.

## Workspace features

### Projects

Search and filter projects by status, create projects with 2–12 named/color-coded classes, switch projects, and track cumulative progress. Switching away from unsubmitted reviews requires an explicit confirmation.

### Data

Drag and drop multiple `.tif` / `.tiff` files. Uploads show real transfer progress and metadata processing. Inspect dimensions, band count, resolution, CRS, size, and georeferencing. Pan, zoom, and tilt an image in the deck.gl inspector. Remove scenes without deleting training labels or iteration history.

GeoJSON import accepts `Point` and `Polygon` features with a `class`, `class_name`, or `label` property. CSV imports accept `latitude`/`lat`, `longitude`/`lng`/`lon`, and `class`/`label` columns; quoted fields are supported. Optional `note` fields are retained. Coordinates must be WGS84. Up to 1,000 labels / 10 MB per import. Shapefile import is not included; convert to GeoJSON first.

### Maps and spectral rendering

- Pan, zoom, fit bounds, focus a sample, and expand the map.
- Toggle suggestions and labeled samples; adjust raster opacity.
- Draw points, polygons (double-click to finish), and rectangles (two opposite corners).
- Choose the drawing class from the class legend.
- True color, infrared false color, NDVI, and custom RGB band indices.
- The demo image offers an explicitly illustrative false-color preview. NDVI is disabled for it because a JPEG contains no near-infrared measurements.
- For rasters with 8+ bands, defaults assume Sentinel-style band order (RGB indices 3/2/1, NIR index 7). For 3–7 bands, defaults assume RGB indices 0/1/2 and NIR index 3. Use custom RGB to match a sensor's actual ordering. NDVI requires at least four bands; verify sensor ordering before interpreting it scientifically.
- Browser preview rasters are resampled to at most 1,200 pixels on the longest side and normalized using 2nd/98th percentile contrast stretching. Raw files remain unchanged.
- Unsupported/missing coordinate systems can be inspected but cannot be accurately placed on the map. Add an appropriate proj4 definition for other projections.
- Original demo imagery is hosted locally; uploaded scenes use Esri World Imagery for surrounding basemap context.

### Human review

Accept or correct predictions, mark difficult samples as skipped, add notes, navigate backward to correct reviews, and use batch mode to accept/select multiple labels. Drafts persist in browser local storage until submitted. A label-save failure retains drafts; a subsequent training failure leaves the already saved labels available for retry.

| Shortcut  | Action                                             |
| --------- | -------------------------------------------------- |
| `1`–`9`   | Choose a class                                     |
| `Enter`   | Accept label and select the next unreviewed sample |
| `S`       | Mark hard / skip                                   |
| `←` / `→` | Previous / next sample                             |
| `N`       | Add a note                                         |
| `P`       | Draw points                                        |
| `Escape`  | Cancel drawing / leave expanded map                |
| `?`       | Show the shortcut guide                            |

Shortcuts are ignored while typing in a form or when a dialog is open.

### Analytics

Interactive learning curves, class distribution, confusion matrix, confidence distribution, expandable iteration history, JSON reports, and individual iteration exports. All charts use actual stored iteration records; the local model's evaluation data is clearly labeled as simulated.

## Project structure

```text
src/
  app/
    api/
      health/route.ts
      files/[filename]/route.ts
      projects/route.ts
      projects/[id]/route.ts
      projects/[id]/[action]/route.ts
      projects/[id]/[action]/[itemId]/route.ts
    error.tsx
    loading.tsx
    globals.css
    layout.tsx
    page.tsx
  components/
    ui/                    # shadcn-compatible Button, Radix Dialog, shared states
    shell/                 # Sidebar, top bar, project selector, notifications
    map/                   # Leaflet map, drawing tools, band controls, deck.gl inspector
    analytics.tsx
    datasets.tsx
    learning-workspace.tsx
    metric-cards.tsx
    project-dashboard.tsx
    providers.tsx
    sample-review.tsx
    workspace-app.tsx
    workspace-dialogs.tsx
  db/
    index.ts
    schema.ts
  hooks/use-projects.ts    # Typed queries and mutations
  lib/
    server/handler.ts      # API dispatch, upload validation, upstream proxy
    server/repository.ts   # Drizzle persistence and demo active-learning workflow
    api.ts                 # Fetch/XHR client and normalized errors
    demo.ts                # Deterministic initial dataset
    geotiff.ts             # Metadata extraction, projections, band rendering
    import-labels.ts       # Validated CSV / GeoJSON ground truth
    utils.ts
  stores/workspace.ts      # Persisted Zustand client state
  types/index.ts
public/
  fonts/
  images/
storage/uploads/           # Created at runtime; persist this volume
```

## Deployment notes

This is a single-user research workspace, not a multi-tenant authentication product. Add authentication and project-scoped authorization before exposing sensitive imagery on a public server. Apply request body limits and rate limiting at the deployment proxy, persist uploads on durable/object storage for multi-instance deployments, and serve over HTTPS. Keep `SATELLITE_API_TOKEN` and `DATABASE_URL` server-only. A real backend should provide its own trained-model storage, evaluation pipeline, and background training jobs.
