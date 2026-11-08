"""Kohonen Self-Organizing Map (SOM) over raster patch embeddings.

Provides deterministic, vectorized batch Kohonen SOM training with PCA
initialization, U-Matrix boundary computation, quantization & topographic
quality metrics, and per-neuron spectral/label/uncertainty summaries.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass
class SomResult:
    """Trained 2D Kohonen Self-Organizing Map and dataset projections."""

    rows: int
    cols: int
    epochs: int
    weights: np.ndarray  # (rows * cols, D) in standardized feature space
    weights_denorm: np.ndarray  # (rows * cols, D) in original feature space
    mean: np.ndarray  # (D,) feature standardization mean
    std: np.ndarray  # (D,) feature standardization scale
    bmus: np.ndarray  # (N,) flat neuron index (row * cols + col) per input sample
    bmu_dists: np.ndarray  # (N,) Euclidean distance to BMU in standardized space
    u_matrix: np.ndarray  # (rows, cols) normalized [0, 1] neighbor distance matrix
    hit_grid: np.ndarray  # (rows, cols) integer sample counts per neuron
    quantization_error: float
    topographic_error: float

    @property
    def n_neurons(self) -> int:
        return self.rows * self.cols

    def transform(self, embeddings: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Project embeddings (m, D) onto the SOM; returns (bmus, bmu_dists)."""
        X = np.asarray(embeddings, dtype=np.float64)
        if len(X) == 0:
            return np.empty(0, dtype=np.int64), np.empty(0, dtype=np.float64)
        X_std = (X - self.mean) / self.std
        dists = _pairwise_euclidean(X_std, self.weights)
        order = np.argsort(dists, axis=1, kind="stable")
        bmus = order[:, 0].astype(np.int64)
        bmu_dists = dists[np.arange(len(X_std)), bmus]
        return bmus, bmu_dists


def default_som_shape(n_samples: int, max_side: int = 10) -> tuple[int, int]:
    """Choose a balanced 2D SOM grid size via Vesanto's heuristic (M ≈ 5*sqrt(N))."""
    if n_samples <= 4:
        return 2, 2
    target_neurons = max(4.0, 5.0 * math.sqrt(max(1, n_samples)))
    side = int(round(math.sqrt(target_neurons)))
    side = max(2, min(max_side, side))
    return side, side


def _standardize_with_stats(embeddings: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    X = np.asarray(embeddings, dtype=np.float64)
    if len(X) == 0:
        d = X.shape[1] if X.ndim == 2 else 0
        return X.reshape(0, d), np.zeros(d, dtype=np.float64), np.ones(d, dtype=np.float64)
    mu = X.mean(axis=0)
    sigma = X.std(axis=0)
    sigma = np.where(sigma < 1e-9, 1.0, sigma)
    return (X - mu) / sigma, mu, sigma


def _pairwise_euclidean(A: np.ndarray, B: np.ndarray) -> np.ndarray:
    """Compute (len(A), len(B)) Euclidean distances cleanly without negative roundoff."""
    a_sq = np.sum(A * A, axis=1, keepdims=True)
    b_sq = np.sum(B * B, axis=1, keepdims=True).T
    d_sq = np.maximum(a_sq + b_sq - 2.0 * (A @ B.T), 0.0)
    return np.sqrt(d_sq)


def _pca_initialize(
    X_std: np.ndarray,
    rows: int,
    cols: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """Initialize (rows*cols, D) prototype weights along the top 2 principal axes."""
    n, d = X_std.shape
    m = rows * cols
    if n >= 2 and d >= 2 and float(np.linalg.norm(X_std)) > 1e-9:
        _, s, vt = np.linalg.svd(X_std, full_matrices=False)
        # Canonicalize singular vector signs for deterministic grid orientation
        v0 = vt[0].copy()
        if v0[int(np.argmax(np.abs(v0)))] < 0:
            v0 = -v0
        if len(vt) > 1:
            v1 = vt[1].copy()
            if v1[int(np.argmax(np.abs(v1)))] < 0:
                v1 = -v1
            scale1 = float(s[1] / math.sqrt(n)) if s[1] > 1e-9 else 0.1
        else:
            v1 = rng.normal(0.0, 1.0, size=d)
            norm1 = float(np.linalg.norm(v1))
            v1 = v1 / (norm1 if norm1 > 1e-9 else 1.0)
            scale1 = 0.1
        scale0 = float(s[0] / math.sqrt(n)) if s[0] > 1e-9 else 0.1

        ys = np.linspace(-1.0, 1.0, rows)
        xs = np.linspace(-1.0, 1.0, cols)
        yy, xx = np.meshgrid(ys, xs, indexing="ij")
        weights = (
            yy.reshape(m, 1) * (scale0 * v0[None, :])
            + xx.reshape(m, 1) * (scale1 * v1[None, :])
            + rng.normal(0.0, 1e-4, size=(m, d))
        )
        return weights
    return rng.normal(0.0, 0.1, size=(m, d))


def compute_u_matrix(weights_grid: np.ndarray) -> np.ndarray:
    """Compute normalized [0, 1] U-Matrix (mean distance to 8-connected neighbors)."""
    rows, cols, _ = weights_grid.shape
    raw = np.zeros((rows, cols), dtype=np.float64)
    for r in range(rows):
        r0, r1 = max(0, r - 1), min(rows, r + 2)
        for c in range(cols):
            c0, c1 = max(0, c - 1), min(cols, c + 2)
            patch = weights_grid[r0:r1, c0:c1].reshape(-1, weights_grid.shape[2])
            diffs = patch - weights_grid[r, c]
            dists = np.sqrt(np.sum(diffs * diffs, axis=1))
            # Exclude self (which has distance 0); guard 1x1 grids
            if len(dists) > 1:
                raw[r, c] = float(dists.sum() / (len(dists) - 1))
    lo, hi = float(raw.min()), float(raw.max())
    if hi - lo > 1e-12:
        return (raw - lo) / (hi - lo)
    return np.zeros_like(raw)


def fit_som(
    embeddings: np.ndarray,
    *,
    rows: int | None = None,
    cols: int | None = None,
    epochs: int = 50,
    sigma: float | None = None,
    learning_rate: float = 0.7,
    random_state: int = 42,
) -> SomResult:
    """Fit a 2D Kohonen Self-Organizing Map on (N, D) patch embeddings."""
    X = np.asarray(embeddings, dtype=np.float64)
    if X.ndim != 2 or len(X) == 0:
        raise ValueError("SOM requires a non-empty 2D feature matrix")

    n, d = X.shape
    auto_r, auto_c = default_som_shape(n)
    rows = rows if rows is not None else auto_r
    cols = cols if cols is not None else auto_c
    if rows < 1 or cols < 1:
        raise ValueError("SOM rows and cols must be >= 1")
    epochs = max(1, int(epochs))

    X_std, mu, std = _standardize_with_stats(X)
    rng = np.random.default_rng(random_state)
    m = rows * cols
    W = _pca_initialize(X_std, rows, cols, rng)

    grid_r, grid_c = np.divmod(np.arange(m), cols)
    grid_coords = np.column_stack([grid_r, grid_c]).astype(np.float64)
    grid_dist_sq = (
        (grid_coords[:, None, :] - grid_coords[None, :, :]) ** 2
    ).sum(axis=2)

    sigma_0 = float(sigma) if sigma is not None else max(max(rows, cols) / 2.0, 1.0)
    sigma_f = min(0.5, sigma_0)
    lr_0 = float(np.clip(learning_rate, 0.05, 1.0))
    lr_f = max(0.1, lr_0 * 0.25)
    denom_steps = max(epochs - 1, 1)

    for t in range(epochs):
        frac = t / denom_steps
        sigma_t = sigma_0 * ((sigma_f / sigma_0) ** frac)
        lr_t = lr_0 * ((lr_f / lr_0) ** frac)

        dists = _pairwise_euclidean(X_std, W)
        bmus = np.argmin(dists, axis=1)

        counts = np.bincount(bmus, minlength=m).astype(np.float64)
        sums = np.zeros((m, d), dtype=np.float64)
        np.add.at(sums, bmus, X_std)

        H = np.exp(-grid_dist_sq / (2.0 * sigma_t * sigma_t))
        numer = H @ sums
        denom = (H @ counts)[:, None]
        target = np.where(denom > 1e-15, numer / np.maximum(denom, 1e-15), W)
        W = (1.0 - lr_t) * W + lr_t * target

    final_dists = _pairwise_euclidean(X_std, W)
    order = np.argsort(final_dists, axis=1, kind="stable")
    bmu1 = order[:, 0].astype(np.int64)
    bmu_dists = final_dists[np.arange(n), bmu1]
    quant_error = float(bmu_dists.mean())

    if m >= 2:
        bmu2 = order[:, 1].astype(np.int64)
        r1, c1 = np.divmod(bmu1, cols)
        r2, c2 = np.divmod(bmu2, cols)
        non_adjacent = np.maximum(np.abs(r1 - r2), np.abs(c1 - c2)) > 1
        topo_error = float(non_adjacent.mean())
    else:
        topo_error = 0.0

    hit_counts = np.bincount(bmu1, minlength=m).reshape(rows, cols).astype(int)
    u_mat = compute_u_matrix(W.reshape(rows, cols, d))
    W_denorm = W * std[None, :] + mu[None, :]

    return SomResult(
        rows=rows,
        cols=cols,
        epochs=epochs,
        weights=W,
        weights_denorm=W_denorm,
        mean=mu,
        std=std,
        bmus=bmu1,
        bmu_dists=bmu_dists,
        u_matrix=u_mat,
        hit_grid=hit_counts,
        quantization_error=quant_error,
        topographic_error=topo_error,
    )


def normalized_band_profiles(
    embeddings: np.ndarray, weights_denorm: np.ndarray, bands: int
) -> tuple[np.ndarray, np.ndarray]:
    """Extract per-band prototype means and [0, 1] scene-normalized band profiles."""
    band_means = weights_denorm[:, :bands]
    scene_means = np.asarray(embeddings[:, :bands], dtype=np.float64)
    lo = np.percentile(scene_means, 2, axis=0)
    hi = np.percentile(scene_means, 98, axis=0)
    span = hi - lo
    # Fall back to exact min/max for bands with tight percentile spread
    tight = span < 1e-9
    if np.any(tight):
        lo = np.where(tight, scene_means.min(axis=0), lo)
        hi = np.where(tight, scene_means.max(axis=0), hi)
        span = hi - lo
    safe_span = np.where(span < 1e-9, 1.0, span)
    profiles = np.where(span < 1e-9, 0.5, (band_means - lo) / safe_span)
    return band_means, np.clip(profiles, 0.0, 1.0)
