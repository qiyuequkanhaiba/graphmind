# GraphMind × Atria 仓库同步脚本
#
# 把本次 Atria 集成的全部改动同步到你 clone 下来的仓库目录。
#
# 用法（在仓库根目录或 demo 目录下均可）：
#   powershell -ExecutionPolicy Bypass -File demo\sync-to-repo.ps1 -TargetRepo "G:\work\Atria\graphmind-repo"
#
# 同步后进入仓库目录：git add . && git commit -m "feat: integrate Atria" && git push
# 同步只覆盖下列 16 个文件，不增加、不删除其它任何文件：
#   修改（8）：.gitignore、backend/graphmind/api/schemas.py、
#             backend/graphmind/services/ai_provider.py、
#             backend/graphmind/services/http_json_transport.py、
#             backend/tests/test_ai_provider.py、backend/tests/test_api.py、
#             backend/tests/test_http_json_transport.py、
#             docs/api/openapi-contract-summary.json
#   新增（8）：Demo说明.md、demo/Atria-AI预设.json、demo/pack-demo.ps1、
#             demo/push-to-github.ps1、demo/start-demo.ps1、demo/sync-to-repo.ps1、
#             demo/示例数据-销售订单.csv、demo/邮件模板.md

param(
    [Parameter(Mandatory = $true)]
    [string]$TargetRepo
)

$ErrorActionPreference = "Stop"
$Source = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path (Join-Path $TargetRepo ".git"))) {
    Write-Host "目标目录不是 git 仓库（缺少 .git）: $TargetRepo" -ForegroundColor Red
    Write-Host "请先 clone 你的 graphmind 仓库。" -ForegroundColor Red
    exit 1
}

$files = @(
    ".gitignore",
    "Demo说明.md",
    "backend/graphmind/api/schemas.py",
    "backend/graphmind/services/ai_provider.py",
    "backend/graphmind/services/http_json_transport.py",
    "backend/tests/test_ai_provider.py",
    "backend/tests/test_api.py",
    "backend/tests/test_http_json_transport.py",
    "docs/api/openapi-contract-summary.json",
    "demo/Atria-AI预设.json",
    "demo/pack-demo.ps1",
    "demo/push-to-github.ps1",
    "demo/start-demo.ps1",
    "demo/sync-to-repo.ps1",
    "demo/示例数据-销售订单.csv",
    "demo/邮件模板.md"
)

Write-Host ""
Write-Host "=== 同步 Atria 集成改动到仓库 ===" -ForegroundColor Cyan
Write-Host "源（本地工作副本）: $Source"
Write-Host "目标（你的仓库）    : $TargetRepo"
Write-Host ""

foreach ($rel in $files) {
    $src = Join-Path $Source $rel
    $dst = Join-Path $TargetRepo $rel
    if (-not (Test-Path $src)) {
        Write-Host "  跳过（源不存在）: $rel" -ForegroundColor DarkGray
        continue
    }
    $dstDir = Split-Path -Parent $dst
    if (-not (Test-Path $dstDir)) {
        New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
    }
    Copy-Item $src -Destination $dst -Force
    Write-Host "  已同步: $rel" -ForegroundColor Green
}

Write-Host ""
Write-Host "完成。请在仓库目录执行：" -ForegroundColor Cyan
Write-Host "  git add ." -ForegroundColor Yellow
Write-Host "  git commit -m `"feat: integrate Atria-Dawn-Preview chat provider`"" -ForegroundColor Yellow
Write-Host "  git push" -ForegroundColor Yellow
Write-Host ""
Write-Host "提交前可用 git diff --cached 检查改动范围。" -ForegroundColor DarkGray
