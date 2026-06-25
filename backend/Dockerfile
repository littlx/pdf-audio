FROM node:22-bookworm AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/tsconfig.json frontend/vite.config.ts frontend/index.html ./
COPY frontend/public ./public
COPY frontend/src ./src
RUN npm install && npm run build

FROM python:3.12-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=frontend /src/frontend/dist ./static
ENV PYTHONPATH=/app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
