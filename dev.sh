#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
REDIS_CONTAINER="pdf-audio-dev-redis"
REDIS_PORT="${REDIS_PORT:-6379}"
ACCESS_TOKEN="${APP_ACCESS_TOKEN:-123321}"

cleanup() {
  echo
  echo "Stopping development services..."
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then kill "$BACKEND_PID" 2>/dev/null || true; fi
  if [[ -n "${WORKER_PID:-}" ]] && kill -0 "$WORKER_PID" 2>/dev/null; then kill "$WORKER_PID" 2>/dev/null || true; fi
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then kill "$FRONTEND_PID" 2>/dev/null || true; fi
  wait 2>/dev/null || true
  if [[ "${STOP_REDIS_ON_EXIT:-1}" == "1" ]]; then
    docker rm -f "$REDIS_CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup INT TERM EXIT

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to run Redis for development." >&2
  exit 1
fi

if [[ ! -d "$BACKEND_DIR/.venv" ]]; then
  echo "Backend virtualenv not found. Creating backend/.venv..."
  python3 -m venv "$BACKEND_DIR/.venv"
fi

source "$BACKEND_DIR/.venv/bin/activate"

if ! python -c "import fastapi, uvicorn, redis, rq" >/dev/null 2>&1; then
  echo "Installing backend dependencies..."
  pip install -r "$BACKEND_DIR/requirements.txt"
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  npm --prefix "$FRONTEND_DIR" install
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$REDIS_CONTAINER"; then
  docker start "$REDIS_CONTAINER" >/dev/null
else
  docker run -d --name "$REDIS_CONTAINER" -p "$REDIS_PORT:6379" redis:7-alpine >/dev/null
fi

echo "Waiting for Redis on localhost:$REDIS_PORT..."
for _ in {1..30}; do
  if docker exec "$REDIS_CONTAINER" redis-cli ping >/dev/null 2>&1; then break; fi
  sleep 0.3
done

export APP_ENV=development
export APP_ACCESS_TOKEN="$ACCESS_TOKEN"
export DATABASE_URL="sqlite:///$ROOT_DIR/storage/app.db"
export STORAGE_DIR="$ROOT_DIR/storage"
export REDIS_URL="redis://localhost:$REDIS_PORT/0"
export WORKER_FALLBACK_TO_THREAD=true
export CORS_ORIGINS="http://localhost:8000,http://localhost:5173"
export PYTHONPATH="$BACKEND_DIR"

mkdir -p "$ROOT_DIR/storage"

echo "Starting backend API on http://localhost:8000"
(
  cd "$BACKEND_DIR"
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
) &
BACKEND_PID=$!

echo "Starting worker with REDIS_URL=$REDIS_URL"
(
  cd "$BACKEND_DIR"
  python -m app.workers.worker
) &
WORKER_PID=$!

echo "Starting frontend on http://localhost:5173"
(
  cd "$FRONTEND_DIR"
  npm run dev
) &
FRONTEND_PID=$!

cat <<EOF

Development stack is starting:
  Frontend: http://localhost:5173
  Backend:  http://localhost:8000
  Redis:    docker container $REDIS_CONTAINER on localhost:$REDIS_PORT
  Access code: $ACCESS_TOKEN

Press Ctrl+C to stop all dev services.
EOF

wait -n "$BACKEND_PID" "$WORKER_PID" "$FRONTEND_PID"
