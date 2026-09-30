# GraphMind × Atria 参赛提交打包脚本
#
# 用法（在仓库根目录或 demo 目录下均可）：
#   powershell -ExecutionPolicy Bypass -File demo\pack-demo.ps1 -VideoPath "G:\work\Atria\Demo录制视频.mp4"
#
# 可选参数：
#   -WorkName  作品名称（默认 GraphMind，影响 zip 文件名与内部目录）
#   -Author    作者/团队名（默认 qiyue）
#
# 产出：G:\work\Atria\AtriaDemo_{WorkName}_{Author}.zip
#       内含 Demo说明.md + Demo录制视频.mp4（源码不在包内，仓库链接放邮件正文）

param(
    [Parameter(Mandatory = $true)]
    [string]$VideoPath,
    [string]$WorkName = "GraphMind",
    [string]$Author = "qiyue",
    [string]$OutDir = "G:\work\Atria"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Readme = Join-Path $RepoRoot "Demo说明.md"
$ZipName = "AtriaDemo_${WorkName}_${Author}.zip"
$ZipPath = Join-Path $OutDir $ZipName

if (-not (Test-Path $VideoPath)) {
    Write-Host "找不到视频文件: $VideoPath" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $Readme)) {
    Write-Host "找不到 Demo说明.md: $Readme" -ForegroundColor Red
    exit 1
}

# 临时暂存目录（打包后删除）
$Staging = Join-Path $env:TEMP "graphmind-demo-pack"
Remove-Item $Staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $Staging -Force | Out-Null

Copy-Item $Readme -Destination $Staging
Copy-Item $VideoPath -Destination (Join-Path $Staging "Demo录制视频.mp4")

Write-Host ""
Write-Host "=== 打包参赛材料 ===" -ForegroundColor Cyan
Write-Host "说明文档: Demo说明.md"
Write-Host "演示视频 : $VideoPath"
Write-Host "作品名称 : $WorkName"
Write-Host "作者     : $Author"
Write-Host ""

if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path (Join-Path $Staging "*") -DestinationPath $ZipPath -CompressionLevel Optimal
Remove-Item $Staging -Recurse -Force

Write-Host "已生成: $ZipPath" -ForegroundColor Green
Write-Host ""
Write-Host "邮件主题：[Atria Demo共建] $WorkName - $Author" -ForegroundColor Yellow
Write-Host "收件人  ：atria_ai@163.com" -ForegroundColor Yellow
Write-Host "附件    ：$ZipName" -ForegroundColor Yellow
Write-Host "正文    ：填写 GitHub 仓库链接（源码不在压缩包内）" -ForegroundColor Yellow
