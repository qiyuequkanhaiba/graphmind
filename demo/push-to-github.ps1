# GraphMind × Atria 一键推送到 GitHub
#
# 用法（在仓库根目录或 demo 目录下均可）：
#   powershell -ExecutionPolicy Bypass -File demo\push-to-github.ps1 -RepoUrl "https://github.com/你的用户名/graphmind.git"
#
# 脚本会自动完成：
#   1) 用本机已下载的便携版 Git 2.55（在 G:\work\Atria\tools\PortableGit）
#   2) clone 你的仓库到 G:\work\Atria\graphmind-repo（保留原仓库历史）
#   3) 用 sync-to-repo.ps1 同步本次 Atria 集成的 16 个文件
#   4) 提交并推送（首次推送弹出浏览器进行 GitHub 授权）
#
# 前置条件：仓库已在 GitHub 上存在（公开或私有均可，推送后再改公开）。

param(
    [Parameter(Mandatory = $true)]
    [string]$RepoUrl
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ToolsGit = "G:\work\Atria\tools\PortableGit\cmd\git.exe"
$CloneDir = "G:\work\Atria\graphmind-repo"

$git = $ToolsGit
if (-not (Test-Path $git)) {
    $git = "git"   # 回退到 PATH 中的 git（需 2.x 以上版本）
}
Write-Host "使用 Git: $git" -ForegroundColor Cyan
& $git --version

# ---- 1) clone ----
if (Test-Path $CloneDir) {
    Write-Host "[1/3] 目标目录已存在，直接在本地更新：$CloneDir" -ForegroundColor Yellow
    & $git -C $CloneDir pull --rebase 2>&1 | Select-Object -Last 2
} else {
    Write-Host "[1/3] clone 仓库到 $CloneDir ..." -ForegroundColor Yellow
    & $git clone $RepoUrl $CloneDir
    if ($LASTEXITCODE -ne 0) {
        Write-Host "clone 失败，请检查仓库地址是否正确、网络是否通畅。" -ForegroundColor Red
        exit 1
    }
}

# ---- 2) 同步改动 ----
Write-Host "[2/3] 同步 Atria 集成改动 ..." -ForegroundColor Yellow
& powershell -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "demo\sync-to-repo.ps1") -TargetRepo $CloneDir

# ---- 3) 提交并推送 ----
Write-Host "[3/3] 提交并推送 ..." -ForegroundColor Yellow
& $git -C $CloneDir add -A
$status = & $git -C $CloneDir status --porcelain
if (-not $status) {
    Write-Host "仓库内容已是最新，无需提交（改动可能已经推送过）。" -ForegroundColor Green
} else {
    & $git -C $CloneDir commit -m "feat: integrate Atria-Dawn-Preview chat provider"
}
& $git -C $CloneDir push

Write-Host ""
Write-Host "推送完成！" -ForegroundColor Green
Write-Host "仓库地址：$RepoUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "如果是首次推送，浏览器会弹出 GitHub 授权页，授权后自动完成。" -ForegroundColor DarkGray
Write-Host "推送后记得在 GitHub 仓库 Settings → Danger Zone 把仓库改为 Public。" -ForegroundColor DarkGray
