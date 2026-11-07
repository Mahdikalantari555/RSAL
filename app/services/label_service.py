"""Resolve human labels (points / polygons) to patch-level training samples.

Sample identity: labels sharing a `sample_id` are versions of the same
sample; the latest (iteration, version, id) wins. Points auto-derive their
sample_id from the patch they fall into, so re-labeling the same patch is
automatically a correction.
"""

from __future__ import annotations

import hashlib
import json

import numpy as np

from ..models import Dataset, Label
from .raster_service import (
    PatchGrid,
    map_to_pixel,
    parse_sample_id,
    points_in_polygon,
    sample_id,
)


def latest_labels(labels: list[Label]) -> list[Label]:
    """Keep only the newest version of each sample_id."""
    best: dict[str, Label] = {}
    for lab in labels:
        cur = best.get(lab.sample_id)
        key = (lab.iteration, lab.version, lab.id)
        if cur is None or key > (cur.iteration, cur.version, cur.id):
            best[lab.sample_id] = lab
    return list(best.values())


def _geometry_hash(label: Label) -> str:
    payload = json.dumps({"g": label.geometry, "d": label.dataset_id, "s": label.coordinate_space})
    return hashlib.sha1(payload.encode()).hexdigest()[:16]


def label_to_pixel_geometry(label: Label, dataset: Dataset | None) -> dict:
    """Return the label geometry converted to pixel space (col=x, row=y)."""
    geom = label.geometry
    if label.coordinate_space == "pixel" or dataset is None:
        return geom
    if geom["type"] == "Point":
        x, y = map_to_pixel(dataset.transform, float(geom["coordinates"][0]), float(geom["coordinates"][1]))
        return {"type": "Point", "coordinates": [x, y]}
    rings = []
    for ring in geom["coordinates"]:
        rings.append([list(map_to_pixel(dataset.transform, float(p[0]), float(p[1]))) for p in ring])
    return {"type": "Polygon", "coordinates": rings}


def _axis_index(starts: list[int], value: float, patch: int, dim: int) -> int:
    """Index of the grid window containing value (clamped to the grid)."""
    v = min(max(value, 0.0), dim - 1e-6)
    idx = 0
    for i, s in enumerate(starts):
        if s <= v < s + patch:
            idx = i  # last matching window wins for overlapping strides
    # if value lies in a stride gap (stride > patch), snap to nearest start
    if not (starts[idx] <= v < starts[idx] + patch):
        idx = int(np.argmin([abs(v - (s + patch / 2)) for s in starts]))
    return idx


def resolve_label_patches(
    label: Label,
    dataset: Dataset | None,
    grid: PatchGrid | None,
) -> list[tuple[int, int, int]]:
    """Map a label to (dataset_id, grid_row, grid_col) patch addresses."""
    geom = label_to_pixel_geometry(label, dataset)

    if geom["type"] == "Point":
        x, y = float(geom["coordinates"][0]), float(geom["coordinates"][1])
        if dataset is not None and grid is not None:
            if 0 <= x < dataset.width and 0 <= y < dataset.height:
                col = _axis_index(grid.xs, x, grid.patch_w, dataset.width)
                row = _axis_index(grid.ys, y, grid.patch_h, dataset.height)
                return [(dataset.id, row, col)]
        parsed = parse_sample_id(label.sample_id)
        return [parsed] if parsed else []

    if geom["type"] == "Polygon":
        if dataset is None or grid is None:
            parsed = parse_sample_id(label.sample_id)
            return [parsed] if parsed else []
        centers_x, centers_y, addresses = [], [], []
        for r, y in enumerate(grid.ys):
            for c, x in enumerate(grid.xs):
                centers_x.append(x + grid.patch_w / 2.0)
                centers_y.append(y + grid.patch_h / 2.0)
                addresses.append((dataset.id, r, c))
        mask = points_in_polygon(np.asarray(centers_x), np.asarray(centers_y), geom["coordinates"])
        result = [addr for addr, m in zip(addresses, mask) if m]
        if not result:
            # tiny polygon: fall back to the patch containing its first vertex
            p = geom["coordinates"][0][0]
            x, y = float(p[0]), float(p[1])
            if 0 <= x < dataset.width and 0 <= y < dataset.height:
                col = _axis_index(grid.xs, x, grid.patch_w, dataset.width)
                row = _axis_index(grid.ys, y, grid.patch_h, dataset.height)
                result = [(dataset.id, row, col)]
        return result

    parsed = parse_sample_id(label.sample_id)
    return [parsed] if parsed else []


def derive_sample_id(label_data, dataset: Dataset | None, grid: PatchGrid | None) -> tuple[str, str]:
    """Return (sample_id, sample_type) for an incoming label."""
    gtype = label_data.geometry.type
    stype = "point" if gtype == "Point" else "polygon"
    if label_data.sample_id:
        return label_data.sample_id, stype

    if gtype == "Point" and dataset is not None and grid is not None:
        geom = label_data.geometry.model_dump()
        if label_data.coordinate_space == "map":
            x, y = map_to_pixel(
                dataset.transform, float(geom["coordinates"][0]), float(geom["coordinates"][1])
            )
        else:
            x, y = float(geom["coordinates"][0]), float(geom["coordinates"][1])
        if 0 <= x < dataset.width and 0 <= y < dataset.height:
            col = _axis_index(grid.xs, x, grid.patch_w, dataset.width)
            row = _axis_index(grid.ys, y, grid.patch_h, dataset.height)
            return sample_id(dataset.id, row, col), stype

    prefix = "pt" if gtype == "Point" else "poly"
    payload = json.dumps(
        {"g": label_data.geometry.model_dump(), "d": label_data.dataset_id, "s": label_data.coordinate_space}
    )
    return f"{prefix}_{hashlib.sha1(payload.encode()).hexdigest()[:16]}", stype


def build_training_targets(
    labels: list[Label],
    datasets: dict[int, Dataset],
    default_dataset: Dataset | None,
    grids: dict[int, PatchGrid],
    class_names: list[str],
) -> tuple[list[str], list[int], list[str]]:
    """Return (patch_sample_ids, y, y_names) from the latest label versions.

    Conflicts on the same patch are resolved by label recency
    (iteration, version, id).
    """
    class_index = {name: i for i, name in enumerate(class_names)}
    latest = latest_labels(labels)
    latest.sort(key=lambda l: (l.iteration, l.version, l.id))  # oldest first; later overwrites
    targets: dict[str, int] = {}
    for lab in latest:
        if lab.class_name not in class_index:
            continue
        ds = datasets.get(lab.dataset_id) if lab.dataset_id is not None else default_dataset
        grid = grids.get(ds.id) if ds is not None else None
        for ds_id, row, col in resolve_label_patches(lab, ds, grid):
            targets[sample_id(ds_id, row, col)] = class_index[lab.class_name]
    sids = list(targets.keys())
    y = [targets[s] for s in sids]
    return sids, y, [class_names[i] for i in y]
