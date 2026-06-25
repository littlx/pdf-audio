# Bilingual PDF Audio Player

A personal English-learning web app that converts English PDFs into bilingual English/Chinese audio with synchronized subtitles.

## Features

- Personal access-code protection, no user accounts.
- Upload PDF files up to 200 MB.
- Duplicate PDF detection using SHA-256.
- PDF library with search and sorting by upload time or author.
- PDF preview with embedded browser PDF viewer, basic page navigation, TOC jump, and text selection.
- Convert by page expression such as `1-3, 5, 8-10` or by selected text.
- Maximum 10 pages per conversion by default.
- OpenAI-compatible AI API, default model `deepseek-v4-flash`.
- Output modes: sentence pair or paragraph pair.
- Styles: faithful, plain explanation, child-friendly, exam English, business English.
- edge-tts audio generation with configurable voices, rate, volume, and pauses.
- MP3 output with VTT, SRT, and JSON subtitles.
- Player with bilingual subtitles, subtitle click-to-seek, search, copy, hide English/Chinese, dictation mode, previous/next line, loop current line, speed control, playlist, and progress saving.
- PWA manifest and service worker for static assets and saved audio/subtitle offline playback.
- PDF and audio are decoupled: deleting a PDF does not delete generated audio; audio can be deleted independently.
- Resumable task checkpoints: retry/resume continues from saved artifacts where possible.

## Requirements

For Docker deployment:

- Linux server
- Docker
- Docker Compose

For non-Docker development:

- Python 3.12 recommended. Python 3.14 is not recommended for this project yet because some web/ORM dependencies may not be fully compatible.
- Node.js 22+
- ffmpeg
- Redis

## Quick start with Docker Compose

```bash
cd /home/dg/code/sub-pdf
cp .env.example .env
```

Edit `.env` and change at least:

```env
APP_ACCESS_TOKEN=your-private-access-code
```

Then start:

```bash
./start.sh
```

Open:

```text
http://SERVER_IP:8000
```

Use your `APP_ACCESS_TOKEN` as the access code.

Stop:

```bash
./stop.sh
```

Logs:

```bash
./logs.sh
```

## Nginx / HTTPS

This project only serves HTTP on port `8000`.

If you want HTTPS and a domain, put Nginx/Caddy/another reverse proxy in front of it. PWA installation on public mobile browsers usually requires HTTPS, so HTTPS should be handled by your external proxy.

## Settings

Open the Settings page and configure:

- AI Base URL
- AI API Key
- Model, default `deepseek-v4-flash`
- Default bilingual format
- Default output style
- English voice
- Chinese voice
- Rate and volume
- Pause duration
- Subtitle appearance

DeepSeek-compatible example:

```text
API Base URL: https://api.deepseek.com
Model: deepseek-v4-flash
```

The API format is OpenAI-compatible `/v1/chat/completions`.

## Workflow

1. Open Library.
2. Upload a PDF.
3. Preview the PDF or go directly to Convert.
4. Choose pages like `1-3, 5, 8-10`, or select text in the preview and convert selected text.
5. Start conversion.
6. Watch task progress.
7. If a task fails or pauses, use Resume or Retry. The task will reuse saved checkpoints where possible.
8. Open Player and play generated audio with subtitles.
9. Use Save for offline to cache generated audio/subtitles in the browser.

## Offline playback

Offline mode means:

- Already generated audio/subtitles can be cached in the browser.
- The Player can reuse cached audio/subtitles when offline.
- New PDF upload, AI conversion, and TTS generation still require the server and network access.

## Data storage

Runtime data is stored under:

```text
storage/
  app.db
  pdfs/
  tasks/
  audios/
  cache/
```

`storage/` is mounted into Docker containers as `/app/storage`.

## Task recovery model

Conversion tasks save checkpoints/artifacts:

- extracted text
- edited text
- bilingual segments
- TTS clip manifest
- merged/normalized audio
- subtitles

When retrying/resuming, the worker skips completed artifacts and continues from missing work. TTS generation resumes at missing clip level.

Pause/cancel is cooperative: the worker checks control flags between major stages and between TTS clips.

## Development

Backend:

```bash
cd backend
pip install -r requirements.txt
PYTHONPATH=. uvicorn app.main:app --reload
```

Worker:

```bash
cd backend
PYTHONPATH=. python -m app.workers.worker
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Frontend dev server proxies `/api` to `http://localhost:8000`.

## Validation performed

- Backend Python files compile with `py_compile`.
- Frontend dependencies installed with npm.
- Frontend production build succeeds.
- Docker Compose config validates.

Notes:

- Local `pytest` could not be executed because `pytest` is not installed in the host Python environment. It is listed in `backend/requirements.txt` and will be available inside the Docker image or after installing requirements.
- Docker image build could not be executed in this environment because access to `/var/run/docker.sock` is denied. `docker compose config` was validated successfully.

## Important limitations in this MVP

- OCR is not supported.
- Encrypted PDFs are not supported.
- PDF preview uses the browser PDF viewer rather than a full custom PDF.js canvas/text-layer implementation.
- Double-column extraction and removal of references/tables/formulas are heuristic and may not be perfect for all PDFs.
- Mobile lock-screen/background playback depends on browser and OS support.
- Access code is lightweight protection, not a full authentication system.
