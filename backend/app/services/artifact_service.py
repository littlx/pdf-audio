import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.utils import new_id
from app.db.models import TaskArtifact


def get_artifact(db: Session, task_id: str, key: str) -> str | None:
    row = db.query(TaskArtifact).filter(TaskArtifact.task_id == task_id, TaskArtifact.key == key).first()
    return row.value if row else None


def set_artifact(db: Session, task_id: str, key: str, value: str | dict | list) -> None:
    encoded = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    row = db.query(TaskArtifact).filter(TaskArtifact.task_id == task_id, TaskArtifact.key == key).first()
    if row:
        row.value = encoded
    else:
        db.add(TaskArtifact(id=new_id("artifact"), task_id=task_id, key=key, value=encoded))
    db.commit()


def delete_artifacts(db: Session, task_id: str, keys: list[str]) -> None:
    if not keys:
        return
    db.query(TaskArtifact).filter(TaskArtifact.task_id == task_id, TaskArtifact.key.in_(keys)).delete(synchronize_session=False)
    db.commit()


def get_json_artifact(db: Session, task_id: str, key: str):
    value = get_artifact(db, task_id, key)
    if value is None:
        return None
    return json.loads(value)


def path_exists_artifact(db: Session, task_id: str, key: str) -> Path | None:
    value = get_artifact(db, task_id, key)
    if not value:
        return None
    path = Path(value)
    return path if path.exists() else None
