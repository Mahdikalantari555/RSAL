# RSAL Backend

Active Learning satellite image classification backend, implemented from the
OpenSpec change proposal in [`openspec/changes/rsal-backend/`](openspec/changes/rsal-backend/).

FastAPI + async SQLAlchemy (SQLite by default, Postgres via env) + rasterio +
scikit-learn / LightGBM. Training is synchronous (MVP); heavy raster/ML work runs
in a worker thread so the event loop stays responsive.

## Capabilities

| Capability | Endpoints |
|---|---|
| Project management | `POST/GET /projects`, `GET/PUT/DELETE /projects/{id}` |
| Dataset ingestion | `POST /projects/{id}/upload` (GeoTIFF), `GET /projects/{id}/dataset` |
| Label management | `POST/GET /projects/{id}/labels`, `GET /projects/{id}/history` |
| Active learning query | `POST /projects/{id}/query` (uncertainty / diversity / hybrid) |
| Model training | `POST /projects/{id}/train` (rf / lightgbm), `GET /projects/{id}/metrics` |
| Inference & export | `POST /projects/{id}/predict`, `GET /projects/{id}/download/{hard\|probability}` |

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
docker compose up -d --build          # API on :8000, data in a named volume
# Optional Postgres:
docker compose --profile postgres up -d
# ...and set DATABASE_URL=postgresql+asyncpg://rsal:rsal@db:5432/rsal on the api service
```

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

## Design decisions (resolving the proposal's open questions)

- **Patch grid**: 32×32 px windows, stride = patch size (non-overlapping) by
  default; configurable via `PATCH_SIZE` / `STRIDE` and per-query overrides.
  The last row/column is clamped to the image edge so the full extent is covered.
- **Embeddings**: per-band mean/std/min/max patch statistics (4 × bands features)
  feed both the classical models and the diversity/core-set strategy.
- **Diversity**: greedy k-center (farthest-first) over standardized embeddings,
  seeded with already-labeled patches when available.
- **Hybrid**: top `batch_size × 5` uncertainty pool, then k-center within the pool.
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
tests/               # 73 tests: unit (AL math, raster helpers) + API scenarios
scripts/demo.py      # end-to-end AL loop against a live server
```

## Tests

```bash
.venv/bin/python -m pytest
```

Covers every OpenSpec scenario: project CRUD + 404s, GeoTIFF metadata (multi-band),
label submission/correction/history, all three query strategies + batch semantics,
RF/LightGBM training + checkpoints + metrics, region inference, and GeoTIFF exports
(validated by re-opening with rasterio).
