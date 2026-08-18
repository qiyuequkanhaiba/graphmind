@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not defined GRAPHMIND_HOST set "GRAPHMIND_HOST=127.0.0.1"
if not defined GRAPHMIND_PORT set "GRAPHMIND_PORT=8000"
set "GRAPHMIND_STATIC_DIR=%~dp0frontend-dist"
set "GRAPHMIND_WORKSPACE_ROOT=%~dp0workspace"
if not defined GRAPHMIND_DEPLOYMENT_MODE set "GRAPHMIND_DEPLOYMENT_MODE=development"

where python >nul 2>nul
if errorlevel 1 (
  echo Python 3.11+ was not found. Install it from https://www.python.org/downloads/windows/ and retry.
  exit /b 1
)

if not exist "%GRAPHMIND_STATIC_DIR%\index.html" (
  echo Missing frontend-dist\index.html. This folder is not a complete GraphMind Windows package.
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  python -m venv .venv
  if errorlevel 1 exit /b 1
)

call ".venv\Scripts\activate.bat"
python -m pip install --upgrade pip
if exist "backend\pyproject.toml" (
  python -m pip install ".\backend"
) else (
  echo Missing backend\pyproject.toml.
  exit /b 1
)

echo.
echo GraphMind is starting at http://%GRAPHMIND_HOST%:%GRAPHMIND_PORT%/
echo Workspace: %GRAPHMIND_WORKSPACE_ROOT%
echo Press Ctrl+C to stop.
echo.
start "" "http://%GRAPHMIND_HOST%:%GRAPHMIND_PORT%/"
python -m uvicorn graphmind.api.app:app --host %GRAPHMIND_HOST% --port %GRAPHMIND_PORT%
