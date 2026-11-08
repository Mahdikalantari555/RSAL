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
   confusion matrix, per-class precision/recall/F1/support. Checkpoints are saved
   per iteration under `STORAGE_DIR/models/`.
7. **Predict & export**:
   ```bash
   curl -X POST localhost:8000/projects/1/predict -H 'content-type: application/json' \
     -d '{"region": {"x0": 0, "y0": 0, "x1": 512, "y1": 512}}'   # region optional
   curl -OJ localhost:8000/projects/1/download/hard
   curl -OJ localhost:8000/projects/1/download/probability
   ```
   Maps are produced at patch-grid resolution. Hard maps are uint16 GeoTIFFs
   (pixel = 0-based class index, colormap + `classes` tag included); probability
   maps are float32 with one band per class. Both carry the source CRS/transform.

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
- **Evaluation**: stratified hold-out split when data allows (≥8 samples, ≥2 per
  class), otherwise training-set metrics flagged with `evaluation: "train"`.
  The deployed checkpoint is always refit on all labeled data.
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
tests/               # 82 tests: unit (AL math, raster helpers) + API scenarios
scripts/demo.py      # end-to-end AL loop against a live backend
scripts/frontend_smoke.py  # end-to-end loop through the frontend adapter
frontend/            # TerraLab Next.js workspace (see frontend/README.md)
openspec/            # spec-driven change proposals + capability specs
```

## Tests

```bash
.venv/bin/python -m pytest
```

82 tests covering every OpenSpec scenario: project CRUD + 404s, GeoTIFF metadata
(multi-band), label submission/correction/history/deletion, all three query
strategies + batch semantics, RF/LightGBM training + checkpoints + metrics,
region inference, GeoTIFF exports (validated by re-opening with rasterio), and
the frontend support endpoints (file download, computed metadata, cascading
dataset delete).
