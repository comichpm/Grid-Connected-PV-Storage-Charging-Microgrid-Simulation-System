#!/usr/bin/env bash
# ============================================================
# 并网光储充系统模拟系统 – 一键启动脚本 (Linux / macOS)
# Grid-Connected PV-Storage-Charging Microgrid Simulation System
# One-shot startup script (Linux / macOS)
# ============================================================
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$REPO_ROOT/frontend"
BACKEND_DIR="$REPO_ROOT/backend"

echo ""
echo "=================================================="
echo "  并网光储充系统模拟系统 启动中..."
echo "=================================================="
echo ""

# ── 1. Check prerequisites ─────────────────────────────────
command -v python3 >/dev/null 2>&1 || { echo "❌ 未找到 python3，请先安装 Python 3.10+"; exit 1; }
command -v node    >/dev/null 2>&1 || { echo "❌ 未找到 node，请先安装 Node.js 18+"; exit 1; }
command -v npm     >/dev/null 2>&1 || { echo "❌ 未找到 npm，请先安装 npm"; exit 1; }

PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "✅ Python $PY_VER"
echo "✅ Node $(node --version)  npm $(npm --version)"
echo ""

# ── 2. Install Python dependencies ─────────────────────────
echo "📦 安装 Python 依赖..."
pip install -q -r "$BACKEND_DIR/requirements.txt"
echo "✅ Python 依赖安装完成"
echo ""

# ── 3. Install Node dependencies ───────────────────────────
echo "📦 安装前端依赖..."
cd "$FRONTEND_DIR"
npm install --legacy-peer-deps --silent
echo "✅ 前端依赖安装完成"
echo ""

# ── 4. Build frontend ──────────────────────────────────────
echo "🔨 构建前端..."
npm run build
echo "✅ 前端构建完成 → frontend/dist"
echo ""

# ── 5. Start backend (serves both API and frontend) ────────
cd "$REPO_ROOT"
echo "🚀 启动后端服务 (端口 8000)..."
echo ""
echo "=================================================="
echo "  访问地址：http://localhost:8000"
echo "  API 文档：http://localhost:8000/docs"
echo "  按 Ctrl+C 停止服务"
echo "=================================================="
echo ""

python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
