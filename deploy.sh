#!/bin/bash
# Bilingual PDF Audio Player Native Deployment Automation Helper
# Suitable for Systemd / Native host deployments

set -e

# Color output helpers
info() { echo -e "\033[1;34m[INFO]\033[0m $*"; }
success() { echo -e "\033[1;32m[SUCCESS]\033[0m $*"; }
error() { echo -e "\033[1;31m[ERROR]\033[0m $*"; exit 1; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
STATIC_DIR="$BACKEND_DIR/static"

info "Starting native deployment compilation..."

# 1. Build Frontend Static Assets
info "Building frontend React/Vite assets..."
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
    info "Installing frontend dependencies..."
    npm install
fi

info "Compiling production bundle..."
npm run build

# 2. Sync to Backend Static Directory
info "Syncing compiled bundle to backend/static folder..."
rm -rf "$STATIC_DIR"
mkdir -p "$STATIC_DIR"
cp -r dist/* "$STATIC_DIR/"

success "Frontend built and mounted successfully into: backend/static"

# 3. Setup Python Backend Environment
info "Setting up Python virtual environment..."
cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
    info "Creating virtual environment (.venv)..."
    python3 -m venv .venv
fi

info "Installing backend dependencies..."
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

# 4. Initialize Database & Run Migrations
info "Initializing database and applying migrations..."
PYTHONPATH=. .venv/bin/python -c "from app.db.session import init_db; init_db()"

success "Backend virtual environment and SQLite database initialized successfully!"

# 5. Print Next Steps
echo ""
echo -e "\033[1;32;40m========================================================================\033[0m"
echo -e "\033[1;32m                  DEPLOYMENT PREPARATION COMPLETE!                      \033[0m"
echo -e "\033[1;32;40m========================================================================\033[0m"
echo ""
echo "All assets have been built and compiled into the unified FastAPI backend."
echo "You can now run the entire application natively using Uvicorn or Systemd."
echo ""
echo "To test run locally:"
echo "----------------------------------------------------"
echo "1. Run Redis locally (or verify it is running on 6379)"
echo "2. Start Backend:  cd backend && PYTHONPATH=. .venv/bin/uvicorn app.main:app --port 8543"
echo "3. Start Worker:   cd backend && PYTHONPATH=. .venv/bin/python -m app.workers.worker"
echo "4. Open Browser:   http://localhost:8543"
echo ""
echo "To deploy in production via Systemd:"
echo "----------------------------------------------------"
echo "Copy the pre-configured systemd service files from the 'deploy/' directory:"
echo "  sudo cp deploy/pdf-audio-backend.service /etc/systemd/system/"
echo "  sudo cp deploy/pdf-audio-worker.service /etc/systemd/system/"
echo ""
echo "Then enable and start them:"
echo "  sudo systemctl daemon-reload"
echo "  sudo systemctl enable pdf-audio-backend pdf-audio-worker"
echo "  sudo systemctl start pdf-audio-backend pdf-audio-worker"
echo ""
echo "Templates for systemd service configurations are also saved in your report file:"
echo "  /Users/dg/.gemini/antigravity-cli/brain/d10a7b81-cb6b-46f6-9acc-2e16e7a8dd34/mobile_pwa_adaptation_report.md"
echo ""
echo -e "\033[1;32m========================================================================\033[0m"
