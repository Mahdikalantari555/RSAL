"""SQLAlchemy ORM models."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    classes: Mapped[list] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    datasets: Mapped[list["Dataset"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    labels: Mapped[list["Label"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    training_runs: Mapped[list["TrainingRun"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    exports: Mapped[list["Export"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    path: Mapped[str] = mapped_column(String(1024))
    crs: Mapped[str | None] = mapped_column(String(255), nullable=True)
    transform: Mapped[list | None] = mapped_column(JSON, nullable=True)  # affine 6 coefficients
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    bands: Mapped[int] = mapped_column(Integer)
    dtype: Mapped[str] = mapped_column(String(50))
    nodata: Mapped[float | None] = mapped_column(Float, nullable=True)
    bounds: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project: Mapped[Project] = relationship(back_populates="datasets")


class Label(Base):
    """One version of a label for a sample. Full history is retained."""

    __tablename__ = "labels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    dataset_id: Mapped[int | None] = mapped_column(ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True)
    sample_id: Mapped[str] = mapped_column(String(255), index=True)
    sample_type: Mapped[str] = mapped_column(String(20))  # point | polygon | patch
    geometry: Mapped[dict] = mapped_column(JSON)  # GeoJSON geometry
    coordinate_space: Mapped[str] = mapped_column(String(10), default="pixel")  # pixel | map
    class_name: Mapped[str] = mapped_column(String(255))
    iteration: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project: Mapped[Project] = relationship(back_populates="labels")


class TrainingRun(Base):
    __tablename__ = "training_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    iteration: Mapped[int] = mapped_column(Integer)
    model_type: Mapped[str] = mapped_column(String(50))  # rf | lightgbm
    checkpoint_path: Mapped[str] = mapped_column(String(1024))
    classes: Mapped[list] = mapped_column(JSON)  # class order used by the model
    n_samples: Mapped[int] = mapped_column(Integer)
    metrics: Mapped[dict] = mapped_column(JSON)
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project: Mapped[Project] = relationship(back_populates="training_runs")


class Export(Base):
    __tablename__ = "exports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    dataset_id: Mapped[int] = mapped_column(Integer)
    training_run_id: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(String(20))  # hard | probability
    path: Mapped[str] = mapped_column(String(1024))
    region: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project: Mapped[Project] = relationship(back_populates="exports")
