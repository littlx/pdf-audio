from rq import Worker
from redis import Redis

from app.core.config import settings


if __name__ == "__main__":
    redis = Redis.from_url(settings.redis_url)
    worker = Worker(["default"], connection=redis)
    worker.work()
