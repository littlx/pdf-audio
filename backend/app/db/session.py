from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.core.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)


@event.listens_for(engine, "connect")
def set_sqlite_pragmas(dbapi_connection, connection_record):
    if not settings.database_url.startswith("sqlite"):
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


from contextlib import contextmanager

@contextmanager
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app.db import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    
    if settings.database_url.startswith("sqlite"):
        with engine.connect() as conn:
            res = conn.execute(text("PRAGMA table_info(conversion_tasks)")).fetchall()
            cols = [r[1] for r in res]
            migrations = {
                "custom_title": "ALTER TABLE conversion_tasks ADD COLUMN custom_title VARCHAR",
                "attempt": "ALTER TABLE conversion_tasks ADD COLUMN attempt INTEGER DEFAULT 0",
                "rq_job_id": "ALTER TABLE conversion_tasks ADD COLUMN rq_job_id VARCHAR",
                "worker_id": "ALTER TABLE conversion_tasks ADD COLUMN worker_id VARCHAR",
                "started_at": "ALTER TABLE conversion_tasks ADD COLUMN started_at DATETIME",
                "heartbeat_at": "ALTER TABLE conversion_tasks ADD COLUMN heartbeat_at DATETIME",
                "extract_mode": "ALTER TABLE conversion_tasks ADD COLUMN extract_mode VARCHAR DEFAULT 'auto'",
            }
            for col, sql in migrations.items():
                if col not in cols:
                    conn.execute(text(sql))
            conn.commit()

            indexes = conn.execute(text("PRAGMA index_list(bilingual_segments)")).fetchall()
            index_names = {row[1] for row in indexes}
            if "uq_bilingual_segments_task_index" not in index_names:
                try:
                    conn.execute(text("CREATE UNIQUE INDEX uq_bilingual_segments_task_index ON bilingual_segments (task_id, segment_index)"))
                    conn.commit()
                except Exception:
                    conn.rollback()
