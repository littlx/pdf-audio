from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.api import audios, pdfs, settings as settings_api, tasks
from app.api.schemas import HealthOut
from app.core.config import settings, validate_runtime_settings
from app.core.utils import ensure_dir
from app.db.session import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_runtime_settings()
    ensure_dir(settings.storage_dir)
    ensure_dir(Path(settings.storage_dir) / "pdfs")
    ensure_dir(Path(settings.storage_dir) / "audios")
    ensure_dir(Path(settings.storage_dir) / "tasks")
    ensure_dir(Path(settings.storage_dir) / "cache")
    init_db()
    yield


app = FastAPI(title="Bilingual PDF Audio Player", lifespan=lifespan)

origins = [item.strip() for item in settings.cors_origins.split(",") if item.strip()]
allow_credentials = "*" not in origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or [],
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthOut)
def health():
    return {"ok": True}


app.include_router(pdfs.router)
app.include_router(tasks.router)
app.include_router(audios.router)
app.include_router(settings_api.router)

static_dir = Path(__file__).resolve().parents[1] / "static"
if static_dir.exists():
    assets_dir = static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
    public_files = ["manifest.webmanifest", "sw.js", "vite.svg"]

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        target = static_dir / full_path
        if full_path in public_files and target.exists():
            return FileResponse(target)
        index = static_dir / "index.html"
        if index.exists():
            return FileResponse(index)
        return {"ok": True}
