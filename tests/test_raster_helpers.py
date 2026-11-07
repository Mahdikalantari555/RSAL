"""Unit tests for raster / grid / geometry helpers."""

from __future__ import annotations

import numpy as np
import pytest

from app.services.raster_service import (
    make_grid,
    map_to_pixel,
    parse_sample_id,
    patch_features,
    pixel_to_map,
    points_in_polygon,
    sample_id,
)


class TestGrid:
    def test_exact_fit(self):
        grid = make_grid(64, 64, 8, 8)
        assert grid.shape == (8, 8)
        assert grid.ys == list(range(0, 64, 8))

    def test_edge_clamped(self):
        grid = make_grid(67, 64, 8, 8)
        rows, cols = grid.shape
        assert rows == 9 and cols == 8
        assert grid.ys[-1] == 59  # clamped so 59+8 covers row 66
        assert grid.ys[-1] + grid.patch_h == 67

    def test_image_smaller_than_patch(self):
        grid = make_grid(5, 7, 8, 8)
        assert grid.shape == (1, 1)
        assert grid.patch_h == 5 and grid.patch_w == 7

    def test_overlapping_stride(self):
        grid = make_grid(16, 16, 8, 4)
        assert grid.shape == (3, 3)

    def test_sample_id_roundtrip(self):
        assert parse_sample_id(sample_id(3, 2, 5)) == (3, 2, 5)
        assert parse_sample_id("not-a-patch") is None


class TestFeatures:
    def test_shape_and_values(self):
        arr = np.ones((4, 16, 16), dtype=np.float32) * 5
        grid = make_grid(16, 16, 8, 8)
        feats = patch_features(arr, grid)
        assert feats.shape == (4, 16)  # 4 patches x 4 bands x 4 stats
        f = feats[0].reshape(4, 4)  # stats x bands
        assert np.allclose(f[0], 5)  # mean
        assert np.allclose(f[1], 0)  # std
        assert np.allclose(f[2], 5)  # min
        assert np.allclose(f[3], 5)  # max

    def test_nan_robust(self):
        arr = np.full((2, 8, 8), np.nan, dtype=np.float32)
        grid = make_grid(8, 8, 8, 8)
        feats = patch_features(arr, grid)
        assert np.isfinite(feats).all()


class TestGeo:
    def test_map_pixel_roundtrip(self):
        transform = [10.0, 0.0, 500000.0, 0.0, -10.0, 4649776.0]
        col, row = map_to_pixel(transform, 500040.0, 4649736.0)
        assert col == pytest.approx(4.0)
        assert row == pytest.approx(4.0)
        x, y = pixel_to_map(transform, col, row)
        assert x == pytest.approx(500040.0)
        assert y == pytest.approx(4649736.0)

    def test_points_in_polygon(self):
        square = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]
        xs = np.array([5.0, 15.0, 0.5])
        ys = np.array([5.0, 5.0, 0.5])
        assert points_in_polygon(xs, ys, square).tolist() == [True, False, True]

    def test_polygon_with_hole(self):
        rings = [
            [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
            [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
        ]
        xs = np.array([5.0, 2.0])
        ys = np.array([5.0, 2.0])
        assert points_in_polygon(xs, ys, rings).tolist() == [False, True]
