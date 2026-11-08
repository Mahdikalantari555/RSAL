"""Patch-grid inference and GeoTIFF export.

Maps are produced at patch-grid resolution (one cell per patch — active
learning operates at patch level). GeoTIFF exports carry the dataset CRS and a
transform that keeps cell (row, col) on exactly the ground the backend's patch
grid assigns to it, including the clamped last row/column.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine

from .al_service import uncertainty_scores
from .raster_service import PatchGrid, transform_of

NODATA = 65535

# Single source of truth for class colours. The workspace mirrors this list in
# `frontend/src/lib/palette.ts` (a test asserts they are identical), so a class
# is the same colour on screen and in an exported GeoTIFF.
CLASS_PALETTE: list[str] = [
    "#5cbb96",
    "#e0a458",
    "#7d9bd4",
    "#c97b9b",
    "#9b8cd4",
    "#d4c95c",
    "#6bb8c9",
    "#d47b6b",
    "#8bc96b",
    "#b0b7c3",
    "#c9a0dc",
]


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    v = value.lstrip("#")
    return int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)


# Cool (confident) -> warm (uncertain). The workspace mirrors this ramp in
# `frontend/src/lib/overlay.ts`; a test asserts the two stay identical, so an
# exported uncertainty PNG is the same picture the map shows.
UNCERTAINTY_RAMP: list[str] = ["#3c78c8", "#f0e6a8", "#e0663c"]


def ramp_color(t: float, ramp: list[str] | None = None) -> tuple[int, int, int]:
    """Colour at position `t` (clamped to 0..1) along a multi-stop hex ramp."""
    stops = [hex_to_rgb(c) for c in (ramp or UNCERTAINTY_RAMP)]
    t = min(1.0, max(0.0, float(t)))
    scaled = t * (len(stops) - 1)
    index = min(len(stops) - 2, int(scaled))
    local = scaled - index
    return tuple(  # type: ignore[return-value]
        round(stops[index][i] + (stops[index + 1][i] - stops[index][i]) * local) for i in range(3)
    )


def uncertainty_colors(values: np.ndarray) -> np.ndarray:
    """[rows, cols] uncertainty -> [rows, cols, 3] uint8, stretched over the
    field's own finite range (a trained model's entropy rarely spans 0..1)."""
    finite = values[np.isfinite(values)]
    lo = float(finite.min()) if finite.size else 0.0
    hi = float(finite.max()) if finite.size else 1.0
    span = hi - lo
    out = np.zeros((*values.shape, 3), dtype=np.uint8)
    for r in range(values.shape[0]):
        for c in range(values.shape[1]):
            value = float(values[r, c])
            if not np.isfinite(value):
                continue
            t = (value - lo) / span if span > 0 else 1.0
            out[r, c] = ramp_color(t)
    return out


def class_colors(n: int) -> list[tuple[int, int, int]]:
    """RGB for class indices 0..n-1, cycling the shared palette."""
    if n <= 0:
        return []
    return [hex_to_rgb(CLASS_PALETTE[i % len(CLASS_PALETTE)]) for i in range(n)]


def predict_patches(model, X: np.ndarray) -> np.ndarray:
    return np.asarray(model.predict_proba(X), dtype=np.float64)


def maps_from_probabilities(
    probs: np.ndarray, grid_shape: tuple[int, int]
) -> tuple[np.ndarray, np.ndarray]:
    """Return (hard_map [rows, cols] of class indices, prob_map [classes, rows, cols])."""
    rows, cols = grid_shape
    hard = np.argmax(probs, axis=1).reshape(rows, cols).astype(np.uint16)
    prob = probs.T.reshape(probs.shape[1], rows, cols).astype(np.float32)
    return hard, prob


def uncertainty_map(prob: np.ndarray, method: str = "entropy") -> np.ndarray:
    """Per-cell uncertainty, [rows, cols] float32, from [classes, rows, cols] probs.

    Uses the same maths as the active-learning ranking, so the map cannot
    disagree with the batch it explains.
    """
    k, rows, cols = prob.shape
    flat = np.moveaxis(prob, 0, 1).reshape(rows * cols, k).astype(np.float64)
    if flat.shape[0] == 0:
        return np.zeros((rows, cols), dtype=np.float32)
    return uncertainty_scores(flat, method).reshape(rows, cols).astype(np.float32)


def maps_from_inference(
    probs: np.ndarray,
    valid: np.ndarray,
    grid_shape: tuple[int, int],
    method: str = "entropy",
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(hard, prob, uncertainty) with invalid patches marked in the hard map."""
    hard, prob = maps_from_probabilities(probs, grid_shape)
    unc = uncertainty_map(prob, method)
    hard = hard.copy()
    hard[~valid.reshape(grid_shape)] = NODATA
    unc[~valid.reshape(grid_shape)] = np.nan
    return hard, prob, unc


def grid_lattice(
    base_transform: list[float] | None,
    step: int,
    region_x0: int,
    region_y0: int,
) -> Affine:
    """Transform of the uniform `step`-pixel lattice the grid cells are written on.

    The backend clamps the last grid row/column to the image edge, so cells are
    not uniformly spaced. A GeoTIFF can only carry one affine, so exports use the
    regular stride lattice and pad the cells the grid does not cover with nodata;
    the true per-cell windows travel in the `grid` tag. That keeps cell (row, col)
    on the same ground the map draws.
    """
    base = transform_of(base_transform)
    return base @ Affine.translation(region_x0, region_y0) @ Affine.scale(step, step)


def grid_transform(
    base_transform: list[float] | None,
    grid: PatchGrid,
    region_x0: int,
    region_y0: int,
    stride: int,
) -> Affine:
    """Kept for callers that only need the lattice; see :func:`grid_lattice`."""
    return grid_lattice(base_transform, max(1, stride), region_x0, region_y0)


def grid_metadata(
    grid: PatchGrid, region_x0: int, region_y0: int, stride: int
) -> dict:
    """Per-cell pixel windows + lattice info, attachable to a GeoTIFF or JSON."""
    rows, cols = grid.shape
    cells = [
        {
            "row": r,
            "col": c,
            "x0": grid.xs[c] + region_x0,
            "y0": grid.ys[r] + region_y0,
            "x1": grid.xs[c] + region_x0 + grid.patch_w,
            "y1": grid.ys[r] + region_y0 + grid.patch_h,
        }
        for r in range(rows)
        for c in range(cols)
    ]
    return {
        "rows": rows,
        "cols": cols,
        "patch_size": grid.patch_w if grid.patch_w == grid.patch_h else [grid.patch_h, grid.patch_w],
        "stride": stride,
        "region": {"x0": region_x0, "y0": region_y0},
        "cells": cells,
    }


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
    grid: dict | None = None,
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
        nodata=NODATA,
        compress="deflate",
    ) as dst:
        dst.write(hard.astype(np.uint16), 1)
        tags = dict(
            classes=json.dumps(classes),
            description="RSAL hard classification map (pixel value = 0-based index into classes)",
        )
        if grid is not None:
            tags["grid"] = json.dumps(grid)
        dst.update_tags(**tags)
        dst.write_colormap(
            1, {i: (*class_colors(len(classes))[i], 255) for i in range(len(classes))}
        )


def export_uncertainty_geotiff(
    path: str | Path,
    unc: np.ndarray,
    classes: list[str],
    crs: str | None,
    transform: Affine,
    method: str,
    grid: dict | None = None,
) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    data = np.nan_to_num(unc, nan=-9999.0).astype(np.float32)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=data.shape[0],
        width=data.shape[1],
        count=1,
        dtype="float32",
        crs=crs,
        transform=transform,
        nodata=-9999.0,
        compress="deflate",
    ) as dst:
        dst.write(data, 1)
        tags = dict(
            classes=json.dumps(classes),
            method=method,
            description=(
                "RSAL per-patch uncertainty map, 0 (confident) .. 1 (uncertain); "
                "nodata marks patches with no valid pixels"
            ),
        )
        if grid is not None:
            tags["grid"] = json.dumps(grid)
        dst.update_tags(**tags)
        dst.set_band_description(1, method)


def export_probability_geotiff(
    path: str | Path,
    prob: np.ndarray,
    classes: list[str],
    crs: str | None,
    transform: Affine,
    grid: dict | None = None,
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
        tags = dict(classes=json.dumps(classes), description="RSAL per-class probability map")
        if grid is not None:
            tags["grid"] = json.dumps(grid)
        dst.update_tags(**tags)
