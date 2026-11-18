# RSAL — satellite active learning

Active Learning satellite image classification: a FastAPI backend plus the
**TerraLab** web workspace, implemented from the OpenSpec change proposals in
[`openspec/changes/rsal-backend/`](openspec/changes/rsal-backend/) and
[`openspec/changes/add-terralab-frontend/`](openspec/changes/add-terralab-frontend/).

Backend: FastAPI + async SQLAlchemy (SQLite by default, Postgres via env) +
rasterio + scikit-learn / LightGBM. Training is synchronous (MVP); heavy
raster/ML work runs in a worker thread so the event loop stays responsive.

Frontend: Next.js (App Router) workspace in [`frontend/`](frontend/) — map-based
labeling, batch review with keyboard shortcuts, real training analytics. It
talks to the backend through a server-side adapter; there is no demo mode.

## Capabilities

| Capability | Endpoints |
|---|---|
| Project management | `POST/GET /projects`, `GET/PUT/DELETE /projects/{id}` |
| Dataset ingestion | `POST /projects/{id}/upload` (GeoTIFF), `GET /projects/{id}/dataset`, `GET .../dataset/{did}/file`, `DELETE .../dataset/{did}` |
| Label management | `POST/GET /projects/{id}/labels`, `GET /projects/{id}/history`, `DELETE /projects/{id}/labels/{sample_id}` |
| Active learning query | `POST /projects/{id}/query` (uncertainty / diversity / hybrid / som) |
| Unsupervised SOM | `POST /projects/{id}/som/classify` (pixel/patch spectral clustering + GeoTIFF), `GET/POST /projects/{id}/som` |
| Model training | `POST /projects/{id}/train` (rf / lightgbm), `GET /projects/{id}/metrics` |
| Inference & export | `POST /projects/{id}/predict`, `GET /projects/{id}/download/{hard\|probability\|som}` |

Interactive API docs: **`/docs`** (Swagger UI) and **`/redoc`**.

## Quickstart (local)

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The database and storage directories are created on startup under `STORAGE_DIR`
(default `./storage`). Configuration is via environment or `.env`
(see [`.env.example`](.env.example)).

## Quickstart (Docker)

```bash
docker compose up -d --build          # API on :8000 + TerraLab UI on :3000
# Optional Postgres:
docker compose --profile postgres up -d
# ...and set DATABASE_URL=postgresql+asyncpg://rsal:rsal@db:5432/rsal on the api service
```

Requires Docker with BuildKit (the default on Docker 23+ / Compose v2). The API
image installs the fully pinned [`requirements.lock.txt`](requirements.lock.txt)
for reproducible builds and includes `libgomp1` (needed by LightGBM). The
frontend waits for the API healthcheck before starting.

### Slow or restricted networks

If a build fails with pip errors like
`Could not find a version that satisfies the requirement numpy` /
`(from versions: none)`, or npm stalls, it is almost always a network timeout
fetching the package index — not a bad dependency. The images already use long
timeouts, automatic retries, and BuildKit cache mounts (so a re-run reuses
downloaded packages). If it still fails, build through a mirror by putting this
in a `.env` file next to `docker-compose.yml` (see [`.env.example`](.env.example)):

```bash
PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple   # any PyPI mirror you trust
NPM_REGISTRY=https://registry.npmmirror.com              # any npm mirror you trust
```

then `docker compose up -d --build` again. To refresh the pinned API
dependencies after editing `requirements.txt`, regenerate the lock from a clean
resolve (`pip install --dry-run --ignore-installed --report r.json -r requirements.txt`,
then pin the reported `name==version` set into `requirements.lock.txt`).

## The active learning loop

1. **Create a project** with its class list:
   ```bash
   curl -X POST localhost:8000/projects -H 'content-type: application/json' \
     -d '{"name": "Coastal LC", "classes": ["water", "vegetation"]}'
   ```
2. **Upload a GeoTIFF** (multi-band supported; CRS, transform, shape, bands, dtype extracted):
   ```bash
   curl -X POST localhost:8000/projects/1/upload -F 'file=@scene.tif'
   ```
3. **Cold start**: query a diversity batch (no model needed):
   ```bash
   curl -X POST localhost:8000/projects/1/query -H 'content-type: application/json' \
     -d '{"strategy": "diversity", "batch_size": 10}'
   ```
4. **Label** the returned patches (point or polygon, pixel or map coordinates).
   Re-submitting the same `sample_id` (or a point in the same patch) stores a
   corrected version; full history is kept at `GET /projects/1/history`:
   ```bash
   curl -X POST localhost:8000/projects/1/labels -H 'content-type: application/json' \
     -d '{"labels": [{"geometry": {"type": "Point", "coordinates": [4, 4]}, "class_name": "water", "iteration": 0}], "auto_train": true}'
   ```
   `auto_train` triggers training on the current labels immediately; alternatively
   call `POST /projects/1/train {"model_type": "rf"}` (or `"lightgbm"`).
5. **Query with the model**: `strategy: "uncertainty"` (methods: `least_confidence`,
   `margin`, `entropy`) or `"hybrid"` (uncertainty pool + core-set diversification).
   Already-labeled patches are excluded by default. Each sample carries patch
   coordinates, georeferenced coords, prediction, confidence, uncertainty and an
   optional embedding.
6. **Inspect metrics**: `GET /projects/1/metrics` → accuracy, F1 macro/weighted,
   confusion matrix, per-class precision/recall/F1/IoU/support, plus the context
   the score belongs to (`resolution`, `evaluation_strategy`, `n_train`,
   `n_test`, `held_out_groups`). Checkpoints are saved per iteration under
   `STORAGE_DIR/models/` with their feature schema.
7. **Predict & export**:
   ```bash
   curl -X POST localhost:8000/projects/1/predict -H 'content-type: application/json' \
     -d '{"region": {"x0": 0, "y0": 0, "x1": 512, "y1": 512}}'   # region optional
   curl -OJ localhost:8000/projects/1/download/hard
   curl -OJ localhost:8000/projects/1/download/probability
   curl -OJ 'localhost:8000/projects/1/download/uncertainty?method=entropy'
   ```
   Maps carry one value per patch cell, painted over each cell's true pixel
   window **on the source grid** (nearest-neighbour block fill, never
   interpolated), so the export has the region's exact width/height, CRS, affine
   and bounds — including the clamped last row/column. Pixels covered by no cell
   (`stride > patch_size`) are nodata. For patch maps the `grid` tag lists every
   cell's pixel window in absolute source pixels; for pixel maps it records
   `cells_are_pixels: true` instead (a per-pixel cell list would be pointless and
   enormous). `resolution` says `patch-cells` or `pixel`.
   Hard maps are uint16 GeoTIFFs (pixel = 0-based class index, nodata 65535,
   colormap + `classes`/`grid`/`method`/`resolution` tags); probability maps are
   float32 with one band per class (nodata -9999); uncertainty maps are float32
   scalars (nodata -9999). All carry the source CRS/transform and are reopened
   and compared with the source window before the export row is created.
   Datasets without a CRS are refused (422) rather than written with a made-up
   georeference; the JSON map layers and CSV still work for them.

   The same fields drive the map UI and the lighter exports:

   | Endpoint | Purpose |
   |---|---|
   | `GET /projects/{id}/predict/map?layer=hard\|uncertainty&method=&dataset_id=&iteration=` | One scalar field (`values`, `valid`, `grid`, `classes`, `colors`, `min`/`max`, `stale`) for painting the layer |
   | `GET /projects/{id}/exports/{hard\|uncertainty}.{png,csv}` | Rendered/row-wise export of exactly that field (`probability` is GeoTIFF-only) |
   | `GET /projects/{id}/exports` | Newest artifact per `(dataset, type, method)`, with `iteration`, `method`, `stale` |
   | `GET /legends/classes` | The palette, so a class has one colour everywhere |

   Reading a field, a PNG, a CSV or a legend never writes an export row; only
   `GET /download/{type}` persists a GeoTIFF. A download never hands back an
   artifact from an older run: if a newer training run exists it re-runs
   inference first, and every response states `X-RSAL-Model-Iteration` and
   `X-RSAL-Export-Stale`.

A full scripted walkthrough against a running server:

```bash
.venv/bin/python scripts/demo.py --base-url http://localhost:8000
```

## Frontend — TerraLab

```bash
cd frontend
npm install
npm run dev            # http://localhost:3000 (backend expected on :8000)
```

Set `RSAL_API_URL` (and optionally `RSAL_API_TOKEN`) to point at your backend;
see [`frontend/README.md`](frontend/README.md) for features, architecture, and
Docker usage. With both services running, the browser-facing adapter is
verified end-to-end by:

```bash
.venv/bin/python scripts/frontend_smoke.py --base http://localhost:3000
```

## Classification resolution and evaluation

Training remains patch-based by default for backward compatibility. To explicitly
train a pixel-feature RF/LightGBM checkpoint, pass `"resolution": "pixel"` to
`POST /projects/{id}/train`. Pixel models use the source pixel's band values,
labels rasterized to source pixel centers (points use their containing pixel).
When collecting multiple point labels within a legacy patch for pixel-mode
training, submit each with `sample_resolution: "pixel"` so they are stored as
distinct pixel identities; without it, a second point in the same patch is stored
as a *correction* of the first (patch identity), which is the documented versioning
behaviour but silently reduces the pixel-mode training set. The model then predicts
every source pixel directly; this is not an upsampled patch map. Their hard,
probability and uncertainty GeoTIFFs use the source pixel/window affine and the
region dimensions, and a pixel that is nodata in any band is nodata in the output.
Pixel mode requires the same band count at inference and remains subject to the
synchronous whole-raster memory guard.

Every response that describes a map states its `resolution` (`pixel` or `patch`),
so a patch-cell map is never presented as pixel-level classification. Patch-mode
`/query` and the SOM explorer need a patch-feature checkpoint: with a
pixel-resolution checkpoint, `/query` returns 409 for uncertainty/hybrid and runs
diversity/SOM without model scores (`model_iteration: null`, explained in
`notes`), while the SOM explorer returns `model_iteration: null` with
`model_note` instead of failing.

Training accepts `"evaluation_strategy": "spatial"` to attempt a block-grouped
holdout (256 px blocks of the patch origin, counted as `held_out_groups`); with
insufficient independent blocks the response labels the result
`insufficient_train_metrics`, sets `evaluation_warning`, and marks the metrics as
in-sample fit, not independent validation. The default `random` strategy is a
stratified random holdout with a fixed `random_state`. Blocks are a coarse proxy:
adjacent blocks share a boundary, so spatial grouping reduces — but does not
prove the absence of — spatial leakage. Per-class metrics include IoU and support,
so an absent class is visible instead of looking like a perfect score. Neither
strategy is a claim of improved accuracy.

Labels with `coordinate_space: "map"` are interpreted in the dataset's own CRS;
this is not an implicit WGS84 conversion. Point labels outside the selected
raster are rejected. Polygon labels must be closed finite rings and overlap the
dataset. `LICENSE` applies to repository code only; third-party components keep
their own licenses, which require a separate redistribution review.

## Known limitations

- **Patch-mode rasters are cell maps, not pixel classifications.** Each cell's
  value is replicated over its pixel window; do not read per-pixel structure into
  them. Use `resolution: "pixel"` when per-pixel predictions are required.
- **Rotated/skewed rasters** are exported by copying the source affine verbatim
  (they stay correctly georeferenced), but the PNG previews and the browser
  overlay are north-up pictures of the cell grid. There is no resampling path.
- **No streaming inference.** Pixel inference reads the source in 256×256 blocks
  but keeps the full probability cube in memory; `MAX_RASTER_ELEMENTS` is the only
  guard, and training is synchronous.
- **Spatial evaluation is block-based** (256 px boxes) and is not buffered against
  boundary leakage.
- **The review queue lives in the browser** (`localStorage`, zustand persist).
  Pending suggestions survive a refresh on that browser/profile, but they are not
  shared between browsers and are lost if site data is cleared; labels are only
  durable once submitted to `/labels`.
- **Pixel-mode training is API-only.** The workspace trains patch models; its
  adapter forwards `resolution`/`evaluation_strategy` when a caller supplies them.
- **Unsupervised SOM** still loads the full raster and uses at most
  `max_train_samples` observations for the fit; its cluster map is a
  nearest-neuron assignment, not a supervised classification.
- **Checkpoints are joblib files** written by the server. There is no upload
  endpoint for them, and loading validates format/keys/classes/bands/resolution
  but is not a sandbox for hostile files on disk.

## Design decisions (resolving the proposal's open questions)

- **Patch grid**: 32×32 px windows, stride = patch size (non-overlapping) by
  default; configurable via `PATCH_SIZE` / `STRIDE` and per-query overrides.
  The last row/column is clamped to the image edge so the full extent is covered.
- **Embeddings**: per-band mean/std/min/max patch statistics (4 × bands features)
  feed both the classical models and the diversity/core-set strategy.
- **Diversity**: greedy k-center (farthest-first) over standardized embeddings,
  seeded with already-labeled patches when available.
- **Hybrid**: top `batch_size × 5` uncertainty pool, then k-center within the pool.
- **Self-organizing map (SOM)**: PCA-initialized batch Kohonen SOM over standardized
  patch embeddings with U-Matrix boundary distances, quantization & topographic
  error metrics, per-neuron spectral prototypes, and topological active-learning
  sampling (`strategy: "som"`, including single-neuron `som_cell` targeting).
- **Evaluation**: stratified random hold-out when data allows (≥8 samples, ≥2
  per class) or a block-grouped spatial hold-out on request; otherwise
  training-set metrics flagged `insufficient_train_metrics` with a warning. The
  deployed checkpoint is always refit on all labeled data.
- **Synchronous training** runs in a thread pool with a raster-size guard rail
  (`MAX_RASTER_ELEMENTS`); migrate to Celery + Postgres for production scale.

## Project layout

```
app/
  main.py            # FastAPI factory, lifespan (init_db), CORS
  config.py          # env settings (.env supported)
  db.py              # async engine/session, init_db
  models.py          # Project, Dataset, Label (versioned), TrainingRun, Export
  schemas.py         # Pydantic request/response models
  storage.py         # STORAGE_DIR layout helpers
  api/               # routers: projects, datasets, labels, query, training, inference
  services/          # raster/grid, AL strategies, label resolution, training, export
tests/               # 158 tests: unit (AL math, raster helpers) + API scenarios
scripts/demo.py      # end-to-end AL loop against a live backend
scripts/frontend_smoke.py  # end-to-end loop through the frontend adapter
frontend/            # TerraLab Next.js workspace (see frontend/README.md)
openspec/            # spec-driven change proposals + capability specs
```

## Tests

```bash
.venv/bin/python -m pytest
```

158 tests covering every OpenSpec scenario: project CRUD + 404s, GeoTIFF metadata
(multi-band), label submission/correction/history/deletion, all four query
strategies + batch semantics, RF/LightGBM training + checkpoint validation +
metrics, region inference, pixel- and patch-mode GeoTIFF exports (re-opened and
compared with the source grid), invalid-pixel masking, SOM exploration and
classification, and the frontend support endpoints (file download, computed
metadata, cascading dataset delete).

The frontend suite is `cd frontend && npm test` (25 node:test cases: shared
pixel↔display transform, overlay colours, adapter payload builders).
