## 1. Backend contracts
- [ ] 1.1 Shared `CLASS_PALETTE` in `inference_service`; replace private `_palette`; test that it matches `frontend/src/lib/palette.ts` CLASS_COLORS
- [ ] 1.2 Grid-correct export transform: uniform stride lattice + nodata padding for clamped edge cells, `grid` tag with true patch windows
- [ ] 1.3 Per-cell `valid` mask from nodata detection in `patch_features`/`load_raster`; invalid cells → nodata in exports
- [ ] 1.4 `GET /projects/{id}/predict/map` (layer=hard|uncertainty, method, iteration, dataset_id) returning `values`, `valid`, `grid`, `classes`, `min/max`, `training_run_id`, `stale`
- [ ] 1.5 Reuse `al_service.uncertainty_scores` verbatim; test that batch ranking matches top uncertainty cells
- [ ] 1.6 `GET /download/uncertainty?method=` (float32 GeoTIFF + `method`/`grid` tags); extend `EXPORT_TYPES`
- [ ] 1.7 PNG + CSV render/serialise from the same field (exactly what the map shows)
- [ ] 1.8 Tests: map endpoint shapes and 409s, export headers/tags, colormap equality, edge-cell geometry re-opened with rasterio

## 2. Data path (client-derived uncertainty)
- [ ] 2.1 Adapter: `/api/projects/{id}/probabilities` — cached `POST /predict` payload (class probabilities + grid metadata) per `(datasetId, iteration)`
- [ ] 2.2 `lib/uncertainty.ts` (browser): entropy / margin / least confidence over the probability tensor, matching `al_service` exactly
- [ ] 2.3 Export routes for hard / uncertainty / probability / png / csv, streamed, never exposing RSAL directly
- [ ] 2.4 React Query keys `(datasetId, layer, method, trainingRunId)`; method switch recomputes locally without a request
- [ ] 2.5 Cross-check test: browser-derived field equals the backend's exported field to 1e-6
- [ ] 2.6 Optional compact `/predict/map` endpoint + adapter route for scenes whose probability tensor exceeds a size budget

## 3. Layer rendering
- [ ] 3.1 `lib/overlay.ts`: cell field → offscreen canvas (classification palette / uncertainty ramp, invalid transparent)
- [ ] 3.2 Leaflet `ImageOverlay` positioned with the shared `pixelToDisplay` transform, `image-rendering: pixelated`
- [ ] 3.3 Classification legend reuses class colours and supports per-class visibility; uncertainty legend is a ramp with min/max and method name
- [ ] 3.4 Hover readout for uncertainty (value + predicted class)
- [ ] 3.5 Render order: imagery → classification → uncertainty → footprints → labels; independent opacity sliders

## 4. Controls and exports in the UI
- [ ] 4.1 Map layers panel: classification toggle, uncertainty toggle, uncertainty method select, per-layer opacity, "1 cell = N px" caption
- [ ] 4.2 Staleness badge + refresh action when a newer training run exists
- [ ] 4.3 Export menu in the layers panel (GeoTIFF / PNG / CSV) for the visible layer
- [ ] 4.4 Analytics "Maps" section: list exports with dataset, layer, iteration, staleness, download links
- [ ] 4.5 Cold-start / no-model messaging; layer unavailable for datasets whose band count does not match the model

## 5. Verification
- [ ] 5.1 `pytest` green (existing 82+ tests plus new ones)
- [ ] 5.2 `npm run typecheck && npm run build` green
- [ ] 5.3 Live smoke: train → toggle both layers → switch method → switch dataset → export all formats → reopen GeoTIFFs and compare a PNG against the on-screen layer
- [ ] 5.4 Update root `README.md` (endpoints + palette/grid contract) and `frontend/README.md` (layers, exports)
