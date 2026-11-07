"""Classical model training (Random Forest / LightGBM), metrics, checkpoints."""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)
from sklearn.model_selection import train_test_split

SUPPORTED_MODELS = ("rf", "lightgbm")


class TrainingError(ValueError):
    """Not enough data or invalid training configuration."""


def build_model(model_type: str, params: dict, random_state: int):
    if model_type == "rf":
        defaults = {"n_estimators": 200, "n_jobs": 2, "random_state": random_state}
        defaults.update(params)
        return RandomForestClassifier(**defaults)
    if model_type == "lightgbm":
        from lightgbm import LGBMClassifier

        defaults = {"n_estimators": 200, "verbosity": -1, "n_jobs": 2, "random_state": random_state}
        defaults.update(params)
        return LGBMClassifier(**defaults)
    raise TrainingError(f"Unsupported model_type '{model_type}'; choose from {SUPPORTED_MODELS}")


def compute_metrics(y_true, y_pred, class_names: list[str]) -> dict:
    labels = list(range(len(class_names)))
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=labels, zero_division=0
    )
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "f1_macro": float(f1_score(y_true, y_pred, labels=labels, average="macro", zero_division=0)),
        "f1_weighted": float(f1_score(y_true, y_pred, labels=labels, average="weighted", zero_division=0)),
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=labels).tolist(),
        "per_class": {
            name: {
                "precision": float(precision[i]),
                "recall": float(recall[i]),
                "f1": float(f1[i]),
                "support": int(support[i]),
            }
            for i, name in enumerate(class_names)
        },
    }


def train_model(
    X: np.ndarray,
    y: list[int],
    class_names: list[str],
    model_type: str,
    params: dict,
    test_size: float,
    random_state: int,
) -> tuple[object, dict, str]:
    """Fit a classifier and return (fitted_model, metrics, evaluation_mode).

    Uses a stratified hold-out split when the data supports it; otherwise
    falls back to training-set evaluation (flagged as evaluation="train").
    The returned model is always refit on ALL labeled data.
    """
    y_arr = np.asarray(y)
    present, counts = np.unique(y_arr, return_counts=True)
    if len(present) < 2:
        raise TrainingError(
            f"Training needs labels for at least 2 classes; found {len(present)}. "
            "Submit more labels across classes."
        )
    if len(y_arr) < 4:
        raise TrainingError(f"Training needs at least 4 labeled samples; found {len(y_arr)}.")

    evaluation = "train"
    can_split = len(y_arr) >= 8 and counts.min() >= 2
    if can_split:
        try:
            X_tr, X_te, y_tr, y_te = train_test_split(
                X, y_arr, test_size=test_size, random_state=random_state, stratify=y_arr
            )
            if len(np.unique(y_te)) >= 2:
                eval_model = build_model(model_type, params, random_state)
                eval_model.fit(X_tr, y_tr)
                metrics = compute_metrics(y_te, eval_model.predict(X_te), class_names)
                evaluation = "holdout"
        except ValueError:
            evaluation = "train"

    model = build_model(model_type, params, random_state)
    model.fit(X, y_arr)
    if evaluation == "train":
        metrics = compute_metrics(y_arr, model.predict(X), class_names)
    metrics["n_train"] = int(len(y_arr))
    return model, metrics, evaluation


def save_checkpoint(
    path: str | Path,
    model,
    *,
    model_type: str,
    classes: list[str],
    iteration: int,
    patch_size: int,
    stride: int,
    bands: int,
) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": model,
            "model_type": model_type,
            "classes": classes,
            "iteration": iteration,
            "patch_size": patch_size,
            "stride": stride,
            "bands": bands,
            "format": "rsal-checkpoint-v1",
        },
        path,
    )


def load_checkpoint(path: str | Path) -> dict:
    return joblib.load(path)


def align_probabilities(probs: np.ndarray, model_classes: list, all_classes: list[str]) -> np.ndarray:
    """Expand model probabilities to the full project class list (missing classes = 0)."""
    out = np.zeros((len(probs), len(all_classes)), dtype=np.float64)
    index = {c: i for i, c in enumerate(all_classes)}
    for j, c in enumerate(model_classes):
        if c in index:
            out[:, index[c]] = probs[:, j]
    totals = out.sum(axis=1, keepdims=True)
    totals[totals == 0] = 1.0
    return out / totals
