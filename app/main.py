"""RSAL FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .api import datasets, inference, labels, projects, query, training
from .config import Settings, settings as default_settings
from .db import Database
from .storage import ensure_dirs


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or default_settings

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        ensure_dirs(settings)
        db = Database(settings)
        await db.init_db()
        app.state.settings = settings
        app.state.db = db
        yield
        await db.dispose()

    app = FastAPI(
        title="RSAL Backend",
        description=(
            "Active Learning satellite image classification backend: projects, "
            "GeoTIFF ingestion, label management with history, AL batch queries "
            "(uncertainty / diversity / hybrid), classical model training "
            "(RF / LightGBM) with metrics, inference and GeoTIFF export."
        ),
        version=__version__,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(projects.router)
    app.include_router(datasets.router)
    app.include_router(labels.router)
    app.include_router(query.router)
    app.include_router(training.router)
    app.include_router(inference.router)

    @app.get("/health", tags=["health"])
    async def health():
        return {"status": "ok", "version": __version__}

    @app.get("/", tags=["health"])
    async def root():
        return {
            "name": "RSAL Backend",
            "version": __version__,
            "docs": "/docs",
            "health": "/health",
        }

    return app


app = create_app()
