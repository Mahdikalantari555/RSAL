"""GeoTIFF I/O, patch grid extraction and feature computation.

Patches are square windows laid out on a regular grid (design decision:
32 px windows, stride = patch size by default, last row/column clamped to
the image edge so the full extent is covered). Each patch is described by
a feature vector of per-band [mean, std, min, max] statistics, which acts
as the embedding for classical models and active learning.
"""

from __future__ import annotations

import math
import re
import warnings
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine

PATCH_ID_RE = re.compile(r"^d(?P<dataset>\d+)_r(?P<row>\d+)_c(?P<col>\d+)$")
STATS = ("mean", "std", "min", "max")


class RasterError(ValueError):
    """Invalid or unreadable raster input."""


@dataclass
class PatchGrid:
    ys: list[int]  # top pixel row of each grid row
    xs: list[int]  # left pixel col of each grid col
    patch_h: int
    patch_w: int

    @property
    def shape(self) -> tuple[int, int]:
        return len(self.ys), len(self.xs)

    def coords(self, row: int, col: int) -> dict:
        y0, x0 = self.ys[row], self.xs[col]
        return {
            "row": row,
            "col": col,
            "x0": x0,
            "y0": y0,
            "x1": x0 + self.patch_w,
            "y1": y0 + self.patch_h,
            "center_x": x0 + self.patch_w / 2.0,
            "center_y": y0 + self.patch_h / 2.0,
        }


def make_grid(height: int, width: int, patch_size: int, stride: int) -> PatchGrid:
    if height < 1 or width < 1:
        raise RasterError("Raster has empty extent")
    ph, pw = min(patch_size, height), min(patch_size, width)

    def axis(dim: int, patch: int) -> list[int]:
        starts = list(range(0, dim - patch + 1, stride))
        if not starts:
            starts = [0]
        if starts[-1] + patch < dim:
            starts.append(dim - patch)  # clamp last patch to the edge
        return starts

    return PatchGrid(ys=axis(height, ph), xs=axis(width, pw), patch_h=ph, patch_w=pw)


def sample_id(dataset_id: int, row: int, col: int) -> str:
    return f"d{dataset_id}_r{row}_c{col}"


def parse_sample_id(sid: str) -> tuple[int, int, int] | None:
    m = PATCH_ID_RE.match(sid)
    if not m:
        return None
    return int(m["dataset"]), int(m["row"]), int(m["col"])


def extract_metadata(path: str | Path) -> dict:
    """Open a GeoTIFF and return its metadata. Raises RasterError if not a GeoTIFF."""
    try:
        with rasterio.open(path) as ds:
            if ds.driver not in ("GTiff", "COG"):
                raise RasterError(f"Unsupported raster driver '{ds.driver}'; expected GeoTIFF")
            return {
                "crs": ds.crs.to_string() if ds.crs else None,
                "transform": [float(v) for v in ds.transform[:6]],
                "width": ds.width,
                "height": ds.height,
                "bands": ds.count,
                "dtype": ds.dtypes[0],
                "nodata": float(ds.nodata) if ds.nodata is not None and math.isfinite(ds.nodata) else None,
                "bounds": [float(v) for v in ds.bounds],
            }
    except RasterError:
        raise
    except Exception as exc:  # rasterio.errors.RasterioIOError etc.
        raise RasterError(f"Could not read GeoTIFF: {exc}") from exc


def load_raster(path: str | Path, nodata: float | None, max_elements: int) -> np.ndarray:
    """Load raster as float32 (bands, H, W); masked/non-finite pixels become NaN."""
    with rasterio.open(path) as ds:
        if ds.count * ds.height * ds.width > max_elements:
            raise RasterError(
                f"Raster too large for synchronous MVP processing "
                f"({ds.count}x{ds.height}x{ds.width} > {max_elements} elements)"
            )
        # read_masks honors per-band GDAL masks as well as nodata metadata.
        masked = ds.read(masked=True, out_dtype="float32")
        arr = masked.filled(np.nan)
    arr[~np.isfinite(arr)] = np.nan
    if nodata is not None:
        arr[arr == np.float32(nodata)] = np.nan
    return arr


def pixel_features(arr: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return one spectral feature vector per pixel and a strict all-band validity mask.

    The first axis is bands; features are row-major pixels by band. Invalid
    pixels are retained in-place as zero vectors and must be masked at inference.
    """
    if arr.ndim != 3:
        raise RasterError("Expected raster array shaped (bands, height, width)")
    valid = np.isfinite(arr).all(axis=0)
    features = np.moveaxis(arr, 0, -1).reshape(-1, arr.shape[0]).astype(np.float32, copy=False)
    features = np.where(np.isfinite(features), features, 0.0)
    return features, valid.reshape(-1)


def validate_grid_compatibility(reference, candidate, *, window=None, atol: float = 1e-9) -> None:
    """Raise RasterError unless candidate matches reference or its integer window grid.

    `window` is (col_off, row_off, width, height) in reference pixels and is
    useful for region exports. No reprojection or resampling is attempted.
    """
    def affine_bounds(width, height, transform):
        corners = [transform * p for p in ((0, 0), (width, 0), (0, height), (width, height))]
        xs, ys = zip(*corners)
        return (min(xs), min(ys), max(xs), max(ys))

    if window is None:
        expected_width, expected_height = reference.width, reference.height
        expected_transform = reference.transform
    else:
        from rasterio.windows import Window
        col_off, row_off, width, height = window
        win = Window(col_off, row_off, width, height)
        expected_width, expected_height = int(width), int(height)
        expected_transform = reference.window_transform(win)
    expected_bounds = affine_bounds(expected_width, expected_height, expected_transform)
    candidate_bounds = affine_bounds(candidate.width, candidate.height, candidate.transform)
    mismatches = []
    if (expected_width, expected_height) != (candidate.width, candidate.height):
        mismatches.append("width/height")
    if reference.crs != candidate.crs:
        mismatches.append("CRS")
    if not np.allclose(tuple(expected_transform), tuple(candidate.transform), rtol=0, atol=atol):
        mismatches.append("affine transform/pixel size")
    if not np.allclose(tuple(expected_bounds), tuple(candidate_bounds), rtol=0, atol=atol):
        mismatches.append("bounds")
    if mismatches:
        raise RasterError("Raster grids are incompatible: " + ", ".join(mismatches))


def patch_validity(arr: np.ndarray, grid: PatchGrid) -> np.ndarray:
    """(n_patches,) bool: True when the patch region contains any valid pixel.

    Patches with no valid pixels produce all-zero features (`patch_features`
    maps NaN to 0) and would otherwise receive a confident but meaningless
    prediction — which is how nodata collars end up painted as land cover.
    """
    valid = np.zeros(len(grid.ys) * len(grid.xs), dtype=bool)
    i = 0
    for y in grid.ys:
        for x in grid.xs:
            patch = arr[:, y : y + grid.patch_h, x : x + grid.patch_w]
            # Scan every pixel; sparse valid edges must not be mistaken for nodata.
            valid[i] = bool(np.any(np.isfinite(patch))) if patch.size else False
            i += 1
    return valid


def patch_features(arr: np.ndarray, grid: PatchGrid) -> np.ndarray:
    """Compute (n_patches, bands*4) feature matrix in row-major grid order."""
    bands = arr.shape[0]
    n = len(grid.ys) * len(grid.xs)
    feats = np.zeros((n, bands * len(STATS)), dtype=np.float64)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)  # all-NaN patches
        i = 0
        for y in grid.ys:
            for x in grid.xs:
                patch = arr[:, y : y + grid.patch_h, x : x + grid.patch_w]
                flat = patch.reshape(bands, -1)
                stats = np.concatenate(
                    [
                        np.nanmean(flat, axis=1),
                        np.nanstd(flat, axis=1),
                        np.nanmin(flat, axis=1),
                        np.nanmax(flat, axis=1),
                    ]
                )
                feats[i] = np.nan_to_num(stats, nan=0.0, posinf=0.0, neginf=0.0)
                i += 1
    return feats


def feature_dim(bands: int) -> int:
    return bands * len(STATS)


def feature_names(bands: int) -> list[str]:
    return [f"b{b + 1}_{s}" for s in STATS for b in range(bands)]


# ----------------------------------------------------------- geo helpers
def transform_of(meta_transform: list[float] | None) -> Affine:
    if meta_transform and len(meta_transform) >= 6:
        return Affine(*meta_transform[:6])
    return Affine.identity()


def map_to_pixel(transform: list[float] | None, x: float, y: float) -> tuple[float, float]:
    """Convert map (CRS) coordinates to pixel (col, row)."""
    inv = ~transform_of(transform)
    col, row = inv @ (x, y)
    return col, row


def pixel_to_map(transform: list[float] | None, col: float, row: float) -> tuple[float, float]:
    x, y = transform_of(transform) @ (col, row)
    return x, y


def points_in_polygon(xs: np.ndarray, ys: np.ndarray, rings: list) -> np.ndarray:
    """Even-odd ray casting; rings[0] is exterior, the rest are holes."""
    inside = np.zeros(len(xs), dtype=bool)
    for idx, ring in enumerate(rings):
        pts = [(float(p[0]), float(p[1])) for p in ring]
        if pts[0] != pts[-1]:
            pts.append(pts[0])
        ring_in = np.zeros(len(xs), dtype=bool)
        for (x1, y1), (x2, y2) in zip(pts[:-1], pts[1:]):
            if y1 == y2:
                continue
            cond = ((ys >= y1) & (ys < y2)) | ((ys >= y2) & (ys < y1))
            if not cond.any():
                continue
            x_intersect = x1 + (ys[cond] - y1) * (x2 - x1) / (y2 - y1)
            ring_in[cond] ^= xs[cond] < x_intersect
        inside = ring_in if idx == 0 else (inside & ~ring_in)
    return inside
