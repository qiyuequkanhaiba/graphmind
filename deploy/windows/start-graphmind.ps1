$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

if (-not $env:GRAPHMIND_HOST) { $env:GRAPHMIND_HOST = "127.0.0.1" }
if (-not $env:GRAPHMIND_PORT) { $env:GRAPHMIND_PORT = "8000" }
$env:GRAPHMIND_STATIC_DIR = Join-Path $PSScriptRoot "frontend-dist"
$env:GRAPHMIND_WORKSPACE_ROOT = Join-Path $PSScriptRoot "workspace"
if (-not $env:GRAPHMIND_DEPLOYMENT_MODE) { $env:GRAPHMIND_DEPLOYMENT_MODE = "development" }

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    throw "Python 3.11+ was not found. Install it from https://www.python.org/downloads/windows/ and retry."
}

$index = Join-Path $env:GRAPHMIND_STATIC_DIR "index.html"
if (-not (Test-Path -LiteralPath $index)) {
    throw "Missing frontend-dist\index.html. This folder is not a complete GraphMind Windows package."
}

$venvPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $venvPython)) {
    & python -m venv .venv
}

& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install (Join-Path $PSScriptRoot "backend")

$url = "http://$($env:GRAPHMIND_HOST):$($env:GRAPHMIND_PORT)/"
Write-Host "GraphMind is starting at $url"
Write-Host "Workspace: $($env:GRAPHMIND_WORKSPACE_ROOT)"
Write-Host "Press Ctrl+C to stop."
Start-Process $url
& $venvPython -m uvicorn graphmind.api.app:app --host $env:GRAPHMIND_HOST --port $env:GRAPHMIND_PORT
