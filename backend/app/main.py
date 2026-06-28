import threading
from contextlib import asynccontextmanager
from pathlib import Path
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.api import audios, auth, pdfs, settings as settings_api, tasks
from app.api.schemas import HealthOut
from app.core.config import settings, validate_runtime_settings
from app.core.utils import ensure_dir
from app.db.session import init_db
from app.services.cleanup_service import run_periodic_cleanup


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_runtime_settings()
    ensure_dir(settings.storage_dir)
    ensure_dir(Path(settings.storage_dir) / "pdfs")
    ensure_dir(Path(settings.storage_dir) / "audios")
    ensure_dir(Path(settings.storage_dir) / "tasks")
    ensure_dir(Path(settings.storage_dir) / "cache")
    init_db()
    
    stop_event = threading.Event()
    cleanup_thread = threading.Thread(
        target=run_periodic_cleanup,
        args=(stop_event,),
        daemon=True,
    )
    cleanup_thread.start()
    
    yield
    stop_event.set()



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


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "media-src 'self' blob:; "
        "connect-src 'self' *; "
        "worker-src 'self' blob:;"
    )
    response.headers["Content-Security-Policy"] = csp
    return response


@app.get("/api/health", response_model=HealthOut)
def health():
    return {"ok": True}


app.include_router(auth.router)
app.include_router(pdfs.router)
app.include_router(tasks.router)
app.include_router(audios.router)
app.include_router(settings_api.router)

static_dir = Path(__file__).resolve().parents[1] / "static"
if static_dir.exists():
    assets_dir = static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path in {"docs", "redoc", "openapi.json"}:
            raise HTTPException(status_code=404, detail="Not found")
        target = static_dir / full_path
        if target.is_file():
            return FileResponse(target)
        index = static_dir / "index.html"
        if index.exists():
            return FileResponse(index)
        return {"ok": True}
