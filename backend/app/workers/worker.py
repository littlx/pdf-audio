from rq import SimpleWorker, Worker
from redis import Redis

from app.core.config import settings


if __name__ == "__main__":
    redis = Redis.from_url(settings.redis_url)
    worker_class = SimpleWorker if settings.worker_mode == "simple" else Worker
    worker = worker_class(["default"], connection=redis)
    worker.work()
