# GraphMind × Atria 一键演示启动脚本
#
# 用法（在仓库根目录或 demo 目录下均可）：
#   powershell -ExecutionPolicy Bypass -File demo\start-demo.ps1
#
# 首次运行会自动：创建后端 venv → 装依赖 → 构建前端（需要 Node）
# 之后直接启动：http://127.0.0.1:8000

$ErrorActionPreference = "Stop"

# 仓库根目录（脚本在 demo/ 下，向上一级）
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$FrontendDir = Join-Path $RepoRoot "frontend"
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"
$DistIndex = Join-Path $FrontendDir "dist\index.html"

function Find-Python {
    # 1) PATH（排除 WindowsApps 商店占位）
    foreach ($cmd in @("python", "python3", "py")) {
        $found = Get-Command $cmd -ErrorAction SilentlyContinue |
            Where-Object { $_.Source -notmatch "WindowsApps" }
        if ($found) { return $found.Source }
    }
    # 2) 常规安装位置
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Python\Python3*",
        "C:\Python3*",
        "C:\Program Files\Python3*",
        "C:\Program Files (x86)\Python3*"
    ) | ForEach-Object { Get-Item $_ -ErrorAction SilentlyContinue }
    foreach ($c in $candidates) {
        $exe = Join-Path $c.FullName "python.exe"
        if (Test-Path $exe) { return $exe }
    }
    return $null
}

function Find-Node {
    $found = Get-Command node -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    $dshNode = "$env:LOCALAPPDATA\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
    if (Test-Path $dshNode) { return $dshNode }
    return $null
}

function Find-Pnpm {
    $found = Get-Command pnpm -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    # DSH 运行时自带的 pnpm（与 node 同级目录的 pnpm\bin 下）
    $dshPnpm = "$env:LOCALAPPDATA\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"
    if (Test-Path $dshPnpm) { return $dshPnpm }
    return $null
}

Write-Host ""
Write-Host "=== GraphMind × Atria 演示环境 ===" -ForegroundColor Cyan
Write-Host ""

# ---- 1) 后端 Python 环境 ----
if (-not (Test-Path $VenvPython)) {
    Write-Host "[1/4] 创建后端虚拟环境..." -ForegroundColor Yellow
    $python = Find-Python
    if (-not $python) {
        Write-Host "未找到 Python 3.11+，请安装后重试：https://www.python.org/downloads/windows/" -ForegroundColor Red
        exit 1
    }
    Write-Host "  使用 Python: $python"
    & $python -m venv (Join-Path $BackendDir ".venv")
    & $VenvPython -m pip install --upgrade pip
    & $VenvPython -m pip install $BackendDir
} else {
    Write-Host "[1/4] 后端虚拟环境已就绪" -ForegroundColor Green
}

# ---- 2) 前端构建产物 ----
if (-not (Test-Path $DistIndex)) {
    Write-Host "[2/4] 构建前端（仅首次，约 1 分钟）..." -ForegroundColor Yellow
    $node = Find-Node
    if (-not $node) {
        Write-Host "构建前端需要 Node.js 16+，请安装后重试：https://nodejs.org/" -ForegroundColor Red
        Write-Host "（后端 API 不受影响，可直接访问 http://127.0.0.1:8000/api/health）" -ForegroundColor DarkGray
        exit 1
    }
    Write-Host "  使用 Node: $node"
    # tsc/vite 的命令行包装会调用 PATH 中的 node，这里确保它在
    $env:PATH = "$(Split-Path $node);$env:PATH"

    $pnpm = Find-Pnpm
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    Push-Location $FrontendDir
    if ($pnpm -and $pnpm -like "*.mjs") {
        & $node $pnpm install
        & $node $pnpm run build
    } elseif ($pnpm) {
        & pnpm install
        & pnpm run build
    } elseif ($npm) {
        & npm install --no-audit --no-fund
        & npm run build
    } else {
        Write-Host "未找到 npm/pnpm，无法构建前端" -ForegroundColor Red
        exit 1
    }
    Pop-Location
} else {
    Write-Host "[2/4] 前端构建产物已就绪" -ForegroundColor Green
}

# ---- 3) 沙箱/透明代理提示 ----
$env:GRAPHMIND_STATIC_DIR = $DistIndex | Split-Path
$env:GRAPHMIND_WORKSPACE_ROOT = Join-Path $RepoRoot "workspace"
$env:GRAPHMIND_DEPLOYMENT_MODE = "development"
# 若你的网络把公网域名解析到内网地址（透明代理/NAT），取消下一行注释：
# $env:GRAPHMIND_AI_DEV_ALLOW_PRIVATE_ENDPOINT = "1"

Write-Host "[3/4] 工作区: $($env:GRAPHMIND_WORKSPACE_ROOT)" -ForegroundColor Green

# ---- 4) 启动服务 ----
Write-Host "[4/4] 启动 GraphMind：http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host "      按 Ctrl+C 停止服务。" -ForegroundColor DarkGray
Write-Host ""

Start-Process "http://127.0.0.1:8000"
Push-Location $BackendDir
& $VenvPython -m uvicorn graphmind.api.app:app --host 127.0.0.1 --port 8000
Pop-Location
