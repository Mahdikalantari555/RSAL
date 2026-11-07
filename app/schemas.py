"""Pydantic request / response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------- projects
class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    classes: list[str] = Field(min_length=2)
    description: str = ""
    status: str = "active"

    @field_validator("classes")
    @classmethod
    def classes_unique_nonempty(cls, v: list[str]) -> list[str]:
        cleaned = [c.strip() for c in v]
        if any(not c for c in cleaned):
            raise ValueError("class names must be non-empty")
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("class names must be unique")
        return cleaned


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    classes: list[str] | None = None
    description: str | None = None
    status: str | None = None

    @field_validator("classes")
    @classmethod
    def classes_valid(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        return ProjectCreate.classes_unique_nonempty(v)


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str
    classes: list[str]
    status: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------- datasets
class DatasetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    filename: str
    crs: str | None
    transform: list[float] | None
    width: int
    height: int
    bands: int
    dtype: str
    nodata: float | None
    bounds: list[float] | None
    created_at: datetime


# ---------------------------------------------------------------- labels
class Geometry(BaseModel):
    type: Literal["Point", "Polygon"]
    coordinates: list[Any]

    @field_validator("coordinates")
    @classmethod
    def coordinates_match_type(cls, v: list[Any], info) -> list[Any]:
        gtype = info.data.get("type")
        if gtype == "Point":
            if len(v) < 2 or not all(isinstance(c, (int, float)) for c in v[:2]):
                raise ValueError("Point coordinates must be [x, y]")
        elif gtype == "Polygon":
            if not v or not isinstance(v[0], list) or len(v[0]) < 3:
                raise ValueError("Polygon coordinates must be a list of rings with >= 3 positions")
        return v


class LabelCreate(BaseModel):
    sample_id: str | None = None
    geometry: Geometry
    class_name: str = Field(min_length=1)
    iteration: int = Field(default=0, ge=0)
    dataset_id: int | None = None
    coordinate_space: Literal["pixel", "map"] = "pixel"


class LabelBatchCreate(BaseModel):
    labels: list[LabelCreate] = Field(min_length=1)
    auto_train: bool = False
    model_type: Literal["rf", "lightgbm"] = "rf"


class LabelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    dataset_id: int | None
    sample_id: str
    sample_type: str
    geometry: dict
    coordinate_space: str
    class_name: str
    iteration: int
    version: int
    created_at: datetime


# ---------------------------------------------------------------- query
class QueryRequest(BaseModel):
    strategy: Literal["uncertainty", "diversity", "hybrid"] = "uncertainty"
    batch_size: int = Field(default=10, ge=1, le=10000)
    method: Literal["least_confidence", "margin", "entropy"] = "least_confidence"
    dataset_id: int | None = None
    include_embedding: bool = False
    exclude_labeled: bool = True
    hybrid_pool_multiplier: int = Field(default=5, ge=1, le=100)
    patch_size: int | None = Field(default=None, ge=2, le=512)
    stride: int | None = Field(default=None, ge=1, le=512)


class QuerySample(BaseModel):
    sample_id: str
    dataset_id: int
    coords: dict  # patch bbox: row, col, x0, y0, x1, y1 (pixels) + center
    geo_coords: dict | None = None  # bbox/center in dataset CRS when available
    prediction: str | None = None
    confidence: float | None = None
    uncertainty: float | None = None
    embedding: list[float] | None = None


class QueryResponse(BaseModel):
    strategy: str
    method: str | None
    batch_size: int
    model_iteration: int | None
    samples: list[QuerySample]


# ---------------------------------------------------------------- training
class TrainRequest(BaseModel):
    model_type: Literal["rf", "lightgbm"] = "rf"
    iteration: int | None = Field(default=None, ge=0)
    test_size: float | None = Field(default=None, gt=0.0, lt=1.0)
    params: dict[str, Any] = Field(default_factory=dict)


class MetricsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    iteration: int
    model_type: str
    n_samples: int
    accuracy: float
    f1_macro: float
    f1_weighted: float
    confusion_matrix: list[list[int]]
    per_class: dict[str, dict[str, float]]
    classes: list[str]
    evaluation: str
    created_at: datetime


class TrainResponse(BaseModel):
    id: int
    project_id: int
    iteration: int
    model_type: str
    checkpoint: str
    n_samples: int
    metrics: MetricsOut


# ---------------------------------------------------------------- inference
class Region(BaseModel):
    """Pixel-space window: x = column, y = row."""

    x0: int = Field(ge=0)
    y0: int = Field(ge=0)
    x1: int = Field(gt=0)
    y1: int = Field(gt=0)


class PredictRequest(BaseModel):
    dataset_id: int | None = None
    region: Region | None = None
    iteration: int | None = Field(default=None, ge=0)
    include_maps: bool = True


class PredictResponse(BaseModel):
    project_id: int
    dataset_id: int
    model_iteration: int
    classes: list[str]
    region: Region
    grid_shape: list[int]  # [rows, cols] of the patch grid
    patch_size: int
    stride: int
    hard_map: list[list[int]] | None = None
    probability_map: list[list[list[float]]] | None = None  # [class][row][col]
    exports: dict[str, str]  # type -> download URL


class ExportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    dataset_id: int
    training_run_id: int
    type: str
    region: dict | None
    created_at: datetime
