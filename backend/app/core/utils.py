from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def ensure_dir(path: str | Path) -> Path:
    target = Path(path)
    target.mkdir(parents=True, exist_ok=True)
    return target


def safe_path_under(path: str | Path, base: str | Path) -> Path:
    base_path = Path(base).resolve(strict=False)
    candidate = Path(path).resolve(strict=False)
    try:
        candidate.relative_to(base_path)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="File not found") from exc
    return candidate
