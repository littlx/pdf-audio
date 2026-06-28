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
- Explicit offline save for generated audio/subtitles; Lock/logout clears protected offline cache and local text drafts.
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
APP_ENV=production
APP_ACCESS_TOKEN=your-long-random-access-code
CORS_ORIGINS=https://your-domain.example
WORKER_FALLBACK_TO_THREAD=false
SETTINGS_ENCRYPTION_KEY=<fernet-key-from-python-snippet-below>
```

Generate an encryption key for stored Settings API keys:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Start:

```bash
./start.sh
```

`start.sh` refuses to run if `.env` is missing or `APP_ACCESS_TOKEN` is still an example value. Docker Compose also requires `.env`; `.env.example` is never used as a runtime env file.

Open locally or through your reverse proxy:

```text
http://127.0.0.1:8543
```

By default Docker binds `127.0.0.1:8543:8543`. To publish directly on all interfaces, edit `docker-compose.yml` deliberately and keep a strong `APP_ACCESS_TOKEN`.

Use `APP_ACCESS_TOKEN` as the access code.

Stop/logs:

```bash
./stop.sh
./logs.sh
```

## Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `APP_ENV` | `development` | Docker/systemd deployments should set `production`. Outside development, startup fails for empty/default/short access tokens and wildcard CORS. |
| `APP_ACCESS_TOKEN` | `change-me` | Required access code. Must be changed before the app starts in production. |
| `DATABASE_URL` | `sqlite:///./storage/app.db` | Docker overrides this to `sqlite:////app/storage/app.db`; systemd examples use `/var/lib/pdf-audio/app.db`. |
| `STORAGE_DIR` | `./storage` | Docker uses `/app/storage`; systemd examples use `/var/lib/pdf-audio`. |
| `REDIS_URL` | `redis://localhost:6379/0` | Required for the worker queue outside development. |
| `WORKER_FALLBACK_TO_THREAD` | `true` | Development convenience. Must be `false` outside development. |
| `WORKER_MODE` | `simple` | `simple` avoids RQ fork crashes on macOS development; Docker/systemd should use `fork`. |
| `MAX_ACTIVE_TASKS` | `5` | API admission limit for pending/running/canceling tasks. |
| `RUNNING_TASK_STALE_SECONDS` | `7200` | Worker takeover threshold for stale `running` tasks. |
| `SETTINGS_ENCRYPTION_KEY` | empty | Fernet key used to encrypt saved AI API keys. Required to save API keys outside development. |
| `MAX_PDF_SIZE_MB` | `200` | Upload size limit. |
| `MAX_PROCESS_PAGES` | `10` | Conversion page limit. |
| `CORS_ORIGINS` | local dev origins | Comma-separated explicit origins. `*` is rejected outside development. |
| `COOKIE_SECURE` | empty | Set to `true` or `false` to override cookie Secure attribute. Defaults to `true` outside development. |
| `AUDIO_RETENTION_DAYS` | empty | Automatically clean up generated audios/tasks older than N days. 0 or empty disables auto-deletion (manual deletion only). |

## Production hardening notes

- Do not deploy with `APP_ACCESS_TOKEN=change-me` or the placeholder token from `.env.example`.
- Keep Docker's default `127.0.0.1:8543:8543` binding and put HTTPS reverse proxy (Nginx/Caddy/etc.) in front of port `8543`.
- Use explicit `CORS_ORIGINS`; wildcard CORS is rejected in production.
- Set `SETTINGS_ENCRYPTION_KEY` before saving AI API keys in Settings.
- **Login Rate Limiting & Cooldown**: Login endpoints feature a 1.5s delay on failures and block client IPs for 15 minutes after 5 consecutive failures to prevent brute force attacks.
- **Session Tokens**: Authenticated sessions utilize cryptographically signed tokens containing a timestamp and HMAC-SHA256 signature, keeping the raw access code safe from XSS storage extraction.
- **SSRF Prevention**: Outside development, requests to loopback addresses, local/private ranges, multicast, or cloud metadata endpoints (e.g., `169.254.169.254`) for AI Base URLs are strictly forbidden.
- Docker image runs as a non-root user and uses `/app/storage` for persistent data.
- Docker Compose waits for Redis health before starting `web`/`worker`.
- If using the bind mount `./storage:/app/storage`, ensure the host directory is writable by the container user, or use a named volume.
- Runtime data under `storage/` and `backend/storage/` is ignored by Git and Docker build context.

## systemd deployment notes

The unit templates in `deploy/` expect:

- application code at `/opt/pdf-audio`
- a dedicated `pdf-audio` user/group
- runtime storage at `/var/lib/pdf-audio`
- secrets/config in `/etc/pdf-audio/pdf-audio.env`

Example `/etc/pdf-audio/pdf-audio.env`:

```env
APP_ACCESS_TOKEN=your-long-random-access-code
DATABASE_URL=sqlite:////var/lib/pdf-audio/app.db
STORAGE_DIR=/var/lib/pdf-audio
REDIS_URL=redis://localhost:6379/0
WORKER_FALLBACK_TO_THREAD=false
WORKER_MODE=fork
CORS_ORIGINS=https://your-domain.example
SETTINGS_ENCRYPTION_KEY=your-fernet-key
COOKIE_SECURE=true
AUDIO_RETENTION_DAYS=0
AI_API_KEY=
```

Create the env file with restrictive permissions, for example `sudo chmod 600 /etc/pdf-audio/pdf-audio.env`.

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
10. Lock clears token, protected offline audio/subtitle cache, saved player selection, and local text drafts.

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

Text editor drafts are stored in browser `localStorage` as plaintext until Lock/logout clears them.

## Task recovery model

Conversion tasks save checkpoints/artifacts:

- extracted/edited text
- bilingual segments
- TTS clip manifest
- merged/normalized audio
- subtitles

Retry/resume reuses checkpoints where safe. Editing extracted text is allowed only for paused/failed tasks and invalidates downstream segment/clip/audio artifacts so regenerated output does not reuse stale audio.

Pause/cancel is cooperative: the worker checks control flags before and after AI/TTS/ffmpeg/subtitle stages and between TTS clips. `running` tasks also maintain heartbeat metadata so stale work can be taken over after `RUNNING_TASK_STALE_SECONDS`.

## Development

Fast one-command development startup (Redis runs in Docker):

```bash
./dev.sh
```

This starts:

- Redis container `pdf-audio-dev-redis` on `localhost:6379`
- backend API on `http://localhost:8543`
- worker with `REDIS_URL=redis://localhost:6379/0` and `WORKER_MODE=simple` to avoid macOS fork crashes
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
REDIS_URL=redis://localhost:6379/0 PYTHONPATH=. uvicorn app.main:app --reload --port 8543
```

Worker:

```bash
cd backend
REDIS_URL=redis://localhost:6379/0 PYTHONPATH=. python -m app.workers.worker
```

Frontend:

```bash
cd frontend
npm ci
npm run dev
```

Frontend dev server proxies `/api` to `http://localhost:8543`.

## Validation commands

```bash
cd backend
PYTHONPATH=. python3 -m compileall app
PYTHONPATH=. ./.venv/bin/pytest

cd ../frontend
npm run build
```
