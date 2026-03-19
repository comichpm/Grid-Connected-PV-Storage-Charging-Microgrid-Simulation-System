@echo off
REM ============================================================
REM 并网光储充系统模拟系统 – 一键启动脚本 (Windows)
REM Grid-Connected PV-Storage-Charging Microgrid Simulation System
REM One-shot startup script (Windows)
REM ============================================================

setlocal enabledelayedexpansion

set "REPO_ROOT=%~dp0"
set "FRONTEND_DIR=%REPO_ROOT%frontend"
set "BACKEND_DIR=%REPO_ROOT%backend"

echo.
echo ==================================================
echo   并网光储充系统模拟系统 启动中...
echo ==================================================
echo.

REM ── 1. Check prerequisites ─────────────────────────────────
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 未找到 python，请先安装 Python 3.10+
    pause
    exit /b 1
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 未找到 node，请先安装 Node.js 18+
    pause
    exit /b 1
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 未找到 npm，请先安装 npm
    pause
    exit /b 1
)

echo [OK] Python found
echo [OK] Node found
echo.

REM ── 2. Install Python dependencies ─────────────────────────
echo [1/3] 安装 Python 依赖...
pip install -q -r "%BACKEND_DIR%\requirements.txt"
if %errorlevel% neq 0 (
    echo [ERROR] Python 依赖安装失败
    pause
    exit /b 1
)
echo [OK] Python 依赖安装完成
echo.

REM ── 3. Install Node dependencies ───────────────────────────
echo [2/3] 安装前端依赖...
cd /d "%FRONTEND_DIR%"
call npm install --legacy-peer-deps --silent
if %errorlevel% neq 0 (
    echo [ERROR] 前端依赖安装失败
    pause
    exit /b 1
)
echo [OK] 前端依赖安装完成
echo.

REM ── 4. Build frontend ──────────────────────────────────────
echo [3/3] 构建前端...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] 前端构建失败
    pause
    exit /b 1
)
echo [OK] 前端构建完成 → frontend\dist
echo.

REM ── 5. Start backend ───────────────────────────────────────
cd /d "%REPO_ROOT%"
echo ==================================================
echo   访问地址：http://localhost:8000
echo   API 文档：http://localhost:8000/docs
echo   按 Ctrl+C 停止服务
echo ==================================================
echo.

python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

pause
