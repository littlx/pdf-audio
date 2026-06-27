#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  cp .env.example .env
  cat >&2 <<'EOF'
Created .env from .env.example.
Edit .env first, set APP_ACCESS_TOKEN to a long random value, then run ./start.sh again.
The app was not started with the example access code.
EOF
  exit 1
fi

get_env_value() {
  local key="$1"
  local line
  line="$(grep -E "^[[:space:]]*${key}=" .env | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%$'\r'}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf '%s' "$line"
}

token="$(get_env_value APP_ACCESS_TOKEN)"
app_env="$(get_env_value APP_ENV)"

if [ -z "$token" ] || [ "$token" = "change-me" ] || [ "$token" = "replace-with-a-long-random-access-code" ]; then
  cat >&2 <<'EOF'
Refusing to start: APP_ACCESS_TOKEN is missing or still set to an example value.
Edit .env and set APP_ACCESS_TOKEN to a long random value first.
EOF
  exit 1
fi

if [ -z "$app_env" ] || [ "$app_env" = "development" ]; then
  cat >&2 <<'EOF'
Refusing to start Docker with APP_ENV unset or development.
Set APP_ENV=production in .env for Docker deployment.
EOF
  exit 1
fi

docker compose up -d --build
