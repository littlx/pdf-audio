# Bilingual PDF Audio Player

A personal English-learning web app that converts English PDFs into bilingual English/Chinese audio with synchronized subtitles.

## Features

- Personal access-code protection, no user accounts.
- Upload PDF files up to 200 MB.
- Duplicate PDF detection using SHA-256.
- PDF library with search and sorting by upload time or author.
- PDF preview with embedded browser PDF viewer, page navigation, TOC jump, and selected-text workflow.
- Convert by page expression such as `1-3, 5, 8-10` or by selected/pasted text.
- OpenAI-compatible AI API, default model `deepseek-v4-flash`.
- edge-tts audio generation with configurable voices, rate, volume, and pauses.
- MP3 output with VTT, SRT, and JSON subtitles.
- Player with synchronized subtitles, seek/copy/search, hide language toggles, dictation mode, loop, speed control, and progress saving.
- Explicit offline save for generated audio/subtitles; Lock/logout clears protected offline cache.
- Resumable task checkpoints with cooperative pause/cancel/retry.

## Requirements

Docker deployment:

- Docker
- Docker Compose

Non-Docker development:

- Python 3.12 recommended
- Node.js 22+
- ffmpeg
- Redis

## Quick start with Docker Compose

```bash
cd /path/to/pdf-audio
cp .env.example .env
```

Edit `.env` and change at least:

```env
APP_ACCESS_TOKEN=your-private-access-code
```

For production, also set:

```env
APP_ENV=production
CORS_ORIGINS=https://your-domain.example
WORKER_FALLBACK_TO_THREAD=false
```

Start:

```bash
./start.sh
```

Open:

```text
http://SERVER_IP:8000
```

Use `APP_ACCESS_TOKEN` as the access code.

Stop/logs:

```bash
./stop.sh
./logs.sh
```

## Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `APP_ENV` | `development` | Outside development, startup fails if `APP_ACCESS_TOKEN` is empty or `change-me`. |
| `APP_ACCESS_TOKEN` | `change-me` | Required access code. Change before exposing the app. |
| `DATABASE_URL` | `sqlite:///./storage/app.db` | Docker overrides this to `sqlite:////app/storage/app.db`. |
| `STORAGE_DIR` | `./storage` | Docker uses `/app/storage`. |
| `REDIS_URL` | `redis://redis:6379/0` | Required for worker queue in Docker. |
| `WORKER_FALLBACK_TO_THREAD` | `true` | Development convenience. Set `false` in production so Redis failures return 503 instead of running jobs inside the web process. |
| `MAX_PDF_SIZE_MB` | `200` | Upload size limit. |
| `MAX_PROCESS_PAGES` | `10` | Conversion page limit. |
| `CORS_ORIGINS` | local dev origins | Comma-separated explicit origins. If set to `*`, credentialed CORS is disabled. |

## Production hardening notes

- Do not deploy with `APP_ACCESS_TOKEN=change-me`.
- Use explicit `CORS_ORIGINS`; avoid `*` for browser clients that need cookies/media/SSE.
- Put HTTPS reverse proxy (Nginx/Caddy/etc.) in front of port `8000`.
- Docker image runs as a non-root user and uses `/app/storage` for persistent data.
- Docker Compose waits for Redis health before starting `web`/`worker`.
- If using the bind mount `./storage:/app/storage`, ensure the host directory is writable by the container user, or use a named volume.
- Runtime data under `storage/` and `backend/storage/` is ignored by Git and Docker build context.

## Settings

Open Settings and configure:

- AI Base URL, API key, model
- default bilingual format and output style
- English/Chinese voices
- rate, volume, and pause durations
- subtitle appearance

DeepSeek-compatible example:

```text
API Base URL: https://api.deepseek.com
Model: deepseek-v4-flash
```

The API format is OpenAI-compatible `/v1/chat/completions`. The backend does not return raw AI API keys to the browser after saving.

## Workflow

1. Open Library.
2. Upload a PDF.
3. Preview the PDF or go directly to Convert.
4. Choose pages like `1-3, 5, 8-10`, or copy/paste selected PDF text into the selected-text box.
5. Start conversion.
6. Watch task progress.
7. If a task fails or pauses, use Resume or Retry.
8. Open Player and play generated audio with subtitles.
9. Use Save for offline to explicitly cache generated audio/subtitles in the browser.
10. Lock clears token and protected offline audio/subtitle cache.

## Data storage

Runtime data is stored under:

```text
storage/
  app.db
  pdfs/
  tasks/
  audios/
  cache/
  tmp/
```

Docker mounts this as `/app/storage`. Back up this directory to preserve PDFs, generated audio, subtitles, task artifacts, and settings.

## Task recovery model

Conversion tasks save checkpoints/artifacts:

- extracted/edited text
- bilingual segments
- TTS clip manifest
- merged/normalized audio
- subtitles

Retry/resume reuses checkpoints where safe. Editing extracted text invalidates downstream segment/clip artifacts so regenerated output does not reuse stale audio.

Pause/cancel is cooperative: the worker checks control flags between major stages and between TTS clips.

## Development

Fast one-command development startup (Redis runs in Docker):

```bash
./dev.sh
```

This starts:

- Redis container `pdf-audio-dev-redis` on `localhost:6379`
- backend API on `http://localhost:8000`
- worker with `REDIS_URL=redis://localhost:6379/0`
- frontend dev server on `http://localhost:5173`

Default development access code is `123321`; override it with:

```bash
APP_ACCESS_TOKEN=your-code ./dev.sh
```

Stop everything with `Ctrl+C`. The script removes the Redis container on exit by default. Use `STOP_REDIS_ON_EXIT=0 ./dev.sh` to keep it running.

Manual backend:

```bash
cd backend
pip install -r requirements.txt
REDIS_URL=redis://localhost:6379/0 PYTHONPATH=. uvicorn app.main:app --reload
```

Worker:

```bash
cd backend
REDIS_URL=redis://localhost:6379/0 PYTHONPATH=. python -m app.workers.worker
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Frontend dev server proxies `/api` to `http://localhost:8000`.

## Validation commands

```bash
cd backend
PYTHONPATH=. python3 -m compileall app
PYTHONPATH=. ./.venv/bin/pytest app/tests

cd ../frontend
npm run build

cd ..
docker compose config
```

## Important limitations

- OCR is not supported.
- Encrypted PDFs are not supported.
- PDF preview uses the browser PDF viewer rather than a custom PDF.js text layer. Some browsers do not expose embedded PDF selection to the page, so manual copy/paste selected-text conversion is provided.
- Double-column extraction and removal of references/tables/formulas are heuristic.
- Mobile lock-screen/background playback depends on browser and OS support.
- Access code is lightweight protection, not a full multi-user authentication system.
