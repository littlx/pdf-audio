#!/usr/bin/env bash
set -euo pipefail
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Edit APP_ACCESS_TOKEN before exposing the app."
fi
docker compose up -d --build
