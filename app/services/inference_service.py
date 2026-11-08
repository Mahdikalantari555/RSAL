"""Patch-grid inference and GeoTIFF export.

Maps are produced at patch-grid resolution (one cell per patch — active
learning operates at patch level). GeoTIFF exports carry the dataset CRS
and a transform adjusted for the region origin and grid cell size.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine

from .raster_service import PatchGrid, transform_of


def predict_patches(model, X: np.ndarray) -> np.ndarray:
    return np.asarray(model.predict_proba(X), dtype=np.float64)


def maps_from_probabilities(probs: np.ndarray, grid_shape: tuple[int, int]) -> tuple[np.ndarray, np.ndarray]:
    """Return (hard_map [rows, cols] of class indices, prob_map [classes, rows, cols])."""
    rows, cols = grid_shape
    hard = np.argmax(probs, axis=1).reshape(rows, cols).astype(np.uint16)
    prob = probs.T.reshape(probs.shape[1], rows, cols).astype(np.float32)
    return hard, prob


def grid_transform(
    base_transform: list[float] | None,
    grid: PatchGrid,
    region_x0: int,
    region_y0: int,
    stride: int,
) -> Affine:
    """Approximate uniform transform for the (possibly edge-clamped) patch grid."""
    base = transform_of(base_transform)
    cell_w = stride if len(grid.xs) > 1 else grid.patch_w
    cell_h = stride if len(grid.ys) > 1 else grid.patch_h
    cell_w = min(cell_w, grid.patch_w)
    cell_h = min(cell_h, grid.patch_h)
    return base @ Affine.translation(region_x0, region_y0) @ Affine.scale(cell_w, cell_h)


def pixel_transform(
    base_transform: list[float] | None,
    region_x0: int,
    region_y0: int,
) -> Affine:
    """Exact pixel-level affine transform for a cropped raster region."""
    return transform_of(base_transform) @ Affine.translation(region_x0, region_y0)


def export_som_geotiff(
    path: str | Path,
    cluster_map: np.ndarray,
    cluster_labels: list[str],
    colors: list[tuple[int, int, int]],
    crs: str | None,
    transform: Affine,
) -> None:
    """Write an unsupervised SOM classification GeoTIFF with embedded colormap."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=cluster_map.shape[0],
        width=cluster_map.shape[1],
        count=1,
        dtype="uint16",
        crs=crs,
        transform=transform,
        nodata=65535,
        compress="deflate",
    ) as dst:
        dst.write(cluster_map.astype(np.uint16), 1)
        dst.update_tags(
            classes=json.dumps(cluster_labels),
            description="RSAL unsupervised SOM classification map (pixel value = 0-based cluster index)",
        )
        dst.write_colormap(
            1,
            {i: (int(c[0]), int(c[1]), int(c[2]), 255) for i, c in enumerate(colors)},
        )


def export_hard_geotiff(
    path: str | Path,
    hard: np.ndarray,
    classes: list[str],
    crs: str | None,
    transform: Affine,
) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=hard.shape[0],
        width=hard.shape[1],
        count=1,
        dtype="uint16",
        crs=crs,
        transform=transform,
        nodata=65535,
        compress="deflate",
    ) as dst:
        dst.write(hard.astype(np.uint16), 1)
        dst.update_tags(
            classes=json.dumps(classes),
            description="RSAL hard classification map (pixel value = 0-based index into classes)",
        )
        dst.write_colormap(1, {i: (c[0], c[1], c[2], 255) for i, c in enumerate(_palette(len(classes)))})


def export_probability_geotiff(
    path: str | Path,
    prob: np.ndarray,
    classes: list[str],
    crs: str | None,
    transform: Affine,
) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    k, h, w = prob.shape
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=h,
        width=w,
        count=k,
        dtype="float32",
        crs=crs,
        transform=transform,
        compress="deflate",
    ) as dst:
        dst.write(prob.astype(np.float32))
        for i, name in enumerate(classes):
            dst.set_band_description(i + 1, name)
        dst.update_tags(classes=json.dumps(classes), description="RSAL per-class probability map")


def _palette(n: int) -> list[tuple[int, int, int]]:
    base = [
        (230, 25, 75), (60, 180, 75), (255, 225, 25), (0, 130, 200),
        (245, 130, 48), (145, 30, 180), (70, 240, 240), (240, 50, 230),
        (210, 245, 60), (250, 190, 212), (0, 128, 128), (220, 190, 255),
    ]
    if n <= len(base):
        return base[:n]
    rng = np.random.default_rng(42)
    extra = [tuple(int(v) for v in rng.integers(0, 256, 3)) for _ in range(n - len(base))]
    return base + extra
