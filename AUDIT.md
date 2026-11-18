# RSAL stabilization audit

## Confirmed bugs fixed
- Added a supervised pixel resolution alongside legacy patch mode. Pixel models use per-pixel spectral vectors, exact row-major alignment, block-wise source reads, strict all-band input validity and direct per-pixel prediction. They do not upsample patch outputs.
- Pixel hard/probability/uncertainty exports inherit the reference/window affine and are reopened and checked for width, height, CRS, affine/pixel size and bounds. Invalid class pixels use the class NoData sentinel; probability NoData is explicit. Categorical maps are never interpolated.
- Legacy patch validity sampled every fourth pixel and could miss valid sparse pixels. It now checks full validity; training and unsupervised patch SOM exclude fully invalid patches.
- `load_raster` ignored GDAL masks. Reads now honor band masks in addition to explicit NoData.
- Pixel labels previously shared patch IDs and distinct points in one patch could overwrite. `sample_resolution: pixel` creates per-pixel point IDs. Pixel polygons target pixel centers.
- Out-of-bounds points and malformed/non-finite/unclosed/self-intersecting polygon rings are rejected. A label may optionally declare `coordinate_crs` for reprojection into the dataset CRS; legacy `map` labels continue to mean dataset CRS.
- Evaluation previously only used random patch holdout and otherwise reported fit scores as `train`. Spatial-group holdout, per-class IoU, recorded evaluation configuration/seed/datasets and a clear insufficient-independent-data response are now supported.
- Right-side sample-review thumbnails used a CSS background sized `100% 100%`, distorting crops whose aspect ratio differed from the fixed card. They now use a contained image preserving intrinsic raster aspect ratio and no longer draw a misleading border around letterbox space.

## Data-flow findings and pipeline distinctions
- Supervised legacy patch path: label geometry -> patch ID -> per-band mean/std/min/max -> RF/LightGBM -> one prediction per patch cell -> legacy patch-lattice exports.
- Supervised pixel path: point/polygon labels -> pixel indices -> raw band values -> RF/LightGBM -> one prediction per source pixel -> source-grid GeoTIFFs.
- Active-learning queries and SOM explorer remain patch-oriented. Unsupervised SOM classification is a separate route: it supports pixel (default) or patch values, validates pixel output against the reference window, and uses patch validity rather than classifying all-NoData patches.
- No observed endpoint default was silently shifted: patch supervised training remains the default. `resolution=pixel` is explicit.

## Remaining limitations / review notes
- Legacy patch exports remain intentionally patch-grid products and do not match the source grid dimensions. Consumers needing reference-aligned rasters must train/use pixel mode. The patch export still has its documented clamped-edge lattice semantics.
- Pixel inference reads the source in 256×256 windows, but full output probability arrays are still retained because the current API/export path returns full maps. The synchronous element guard remains. Full streaming GeoTIFF inference is future work.
- Spatial blocks are fixed at 256 source pixels and may not represent the domain's autocorrelation distance. Insufficient splits are explicitly marked.
- Ring self-intersection checks do not perform full OGC topology validation between holes and shells. CRS transformation errors are caught, but callers should supply the actual CRS.
- Pixel RF and LightGBM have regression coverage. The unsupervised SOM still uses full-array loading and its `any valid band` policy with per-band imputation for partially masked pixels; consider stricter semantics for a target domain.
- Automated frontend dependency inventory found custom Esri/amCharts terms, a Hippocratic-2.1 license declaration in React-Leaflet packages, LGPL-3.0-or-later Sharp/libvips optional native binaries, and several content/dual licenses. See `THIRD_PARTY_LICENSES.md`; legal review of the actual distributed tree remains necessary. `npm ci` also reported 29 security advisories (10 moderate, 19 high); these are not license findings and need separate triage.

## Verification
- Python: 139 passed in the full suite. Rasterio/Starlette/Pillow deprecation warnings remain.
- Frontend: `npm run typecheck`, `npm run lint`, `npm test` (21 passed), and `npm run build` passed. Lint reports 7 existing warnings; no lint errors.
