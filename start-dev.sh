#!/bin/bash

# راه‌اندازی Backend (Django) و Frontend (Vite) در حالت توسعه
# Usage: ./start-dev.sh

set -o pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ─── Paths ────────────────────────────────────────────────────────────────────
PROJECT_DIR="$HOME/Projects/store-manager"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
VENV_ACTIVATE="$PROJECT_DIR/venv/bin/activate"

BACKEND_LOG="/tmp/faydo-backend-dev.log"
FRONTEND_LOG="/tmp/faydo-frontend-dev.log"

BACKEND_PID=""
FRONTEND_PID=""

# ─── Helpers ──────────────────────────────────────────────────────────────────
error_exit() {
    echo -e "${RED}❌ خطا: $1${NC}" >&2
    if [ -n "$2" ] && [ -f "$2" ]; then
        echo -e "${YELLOW}─── جزئیات خطا ($2) ───${NC}" >&2
        tail -30 "$2" >&2
    fi
    cleanup
    exit 1
}

cleanup() {
    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null
    fi
    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null
    fi
}

trap cleanup INT TERM EXIT

echo -e "${BLUE}🚀 در حال راه‌اندازی پروژه Faydo (حالت توسعه)...${NC}"
echo "مسیر پروژه: $PROJECT_DIR"
echo ""

# ─── Step 1: بررسی مسیر پروژه ─────────────────────────────────────────────────
if [ ! -d "$PROJECT_DIR" ]; then
    error_exit "مسیر پروژه پیدا نشد: $PROJECT_DIR"
fi

# ─── Step 2: فعال‌سازی venv ───────────────────────────────────────────────────
if [ ! -f "$VENV_ACTIVATE" ]; then
    error_exit "محیط مجازی (venv) پیدا نشد: $VENV_ACTIVATE"
fi

# shellcheck source=/dev/null
source "$VENV_ACTIVATE" || error_exit "فعال‌سازی venv با خطا مواجه شد"

# ─── Step 3: راه‌اندازی Django Backend ───────────────────────────────────────
if [ ! -d "$BACKEND_DIR" ]; then
    error_exit "پوشه backend پیدا نشد: $BACKEND_DIR"
fi

if [ ! -f "$BACKEND_DIR/manage.py" ]; then
    error_exit "فایل manage.py در backend پیدا نشد"
fi

echo -e "${BLUE}🔧 راه‌اندازی Django Backend روی 0.0.0.0:8002...${NC}"
cd "$BACKEND_DIR" || error_exit "ورود به پوشه backend ممکن نیست"

python manage.py runserver 0.0.0.0:8002 > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

sleep 2

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    error_exit "Django backend متوقف شد" "$BACKEND_LOG"
fi

if grep -qiE "error|traceback|exception|ModuleNotFoundError|ImportError" "$BACKEND_LOG" 2>/dev/null; then
    if ! grep -q "Starting development server" "$BACKEND_LOG" 2>/dev/null; then
        error_exit "Django backend با خطا مواجه شد" "$BACKEND_LOG"
    fi
fi

echo -e "${GREEN}✅ Django backend در حال اجراست (PID: $BACKEND_PID)${NC}"
echo ""

# ─── Step 4: راه‌اندازی Frontend ──────────────────────────────────────────────
if [ ! -d "$FRONTEND_DIR" ]; then
    error_exit "پوشه frontend پیدا نشد: $FRONTEND_DIR"
fi

if [ ! -f "$FRONTEND_DIR/package.json" ]; then
    error_exit "فایل package.json در frontend پیدا نشد"
fi

echo -e "${BLUE}🎨 راه‌اندازی Frontend (npm run dev)...${NC}"
cd "$FRONTEND_DIR" || error_exit "ورود به پوشه frontend ممکن نیست"

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  node_modules پیدا نشد. در حال نصب وابستگی‌ها...${NC}"
    npm install > "$FRONTEND_LOG" 2>&1 || error_exit "نصب npm dependencies با خطا مواجه شد" "$FRONTEND_LOG"
fi

npm run dev > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

sleep 3

if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    error_exit "Frontend متوقف شد" "$FRONTEND_LOG"
fi

if grep -qiE "error|ERR!|failed|EADDRINUSE" "$FRONTEND_LOG" 2>/dev/null; then
    if ! grep -qiE "Local:|ready in|VITE" "$FRONTEND_LOG" 2>/dev/null; then
        error_exit "Frontend با خطا مواجه شد" "$FRONTEND_LOG"
    fi
fi

echo -e "${GREEN}✅ Frontend در حال اجراست (PID: $FRONTEND_PID)${NC}"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 هر دو سرویس با موفقیت راه‌اندازی شدند${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}🔧 Backend:${NC}  http://0.0.0.0:8002"
echo -e "${BLUE}🎨 Frontend:${NC} (آدرس در لاگ vite نمایش داده می‌شود)"
echo ""
echo "لاگ‌ها:"
echo "  Backend:  tail -f $BACKEND_LOG"
echo "  Frontend: tail -f $FRONTEND_LOG"
echo ""
echo "برای توقف: Ctrl+C"
echo ""

# نمایش زنده لاگ هر دو سرویس
tail -f "$BACKEND_LOG" "$FRONTEND_LOG" &
TAIL_PID=$!

wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
EXIT_CODE=$?

kill "$TAIL_PID" 2>/dev/null

if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo -e "${RED}❌ یکی از سرویس‌ها متوقف شد${NC}"
    [ -f "$BACKEND_LOG" ] && echo -e "${YELLOW}─── Backend log ───${NC}" && tail -20 "$BACKEND_LOG"
    [ -f "$FRONTEND_LOG" ] && echo -e "${YELLOW}─── Frontend log ───${NC}" && tail -20 "$FRONTEND_LOG"
    exit 1
fi
