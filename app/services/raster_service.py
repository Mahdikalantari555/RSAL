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
    """Load raster as float32 (bands, H, W); nodata/non-finite become NaN."""
    with rasterio.open(path) as ds:
        if ds.count * ds.height * ds.width > max_elements:
            raise RasterError(
                f"Raster too large for synchronous MVP processing "
                f"({ds.count}x{ds.height}x{ds.width} > {max_elements} elements)"
            )
        arr = ds.read().astype(np.float32)
    arr[~np.isfinite(arr)] = np.nan
    if nodata is not None:
        arr[arr == np.float32(nodata)] = np.nan
    return arr


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
