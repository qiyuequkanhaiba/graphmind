#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
version="${GRAPHMIND_PACKAGE_VERSION:-0.1.1}"
dist_root="${GRAPHMIND_PACKAGE_OUT:-$root/artifacts}"
stage="$dist_root/graphmind-windows-$version"
archive="$dist_root/graphmind-windows-$version.zip"

export PATH="/opt/homebrew/bin:${PATH}"

mkdir -p "$dist_root"
rm -rf "$stage" "$archive"
mkdir -p "$stage/backend" "$stage/frontend-dist" "$stage/workspace"

(
  cd "$root/frontend"
  npm run build
)

rsync -a \
  --exclude '.venv' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '.pytest_cache' \
  --exclude '.ruff_cache' \
  --exclude '*.egg-info' \
  --exclude '.graphmind' \
  --exclude 'tests' \
  "$root/backend/" "$stage/backend/"

rsync -a "$root/frontend/dist/" "$stage/frontend-dist/"
cp "$root/deploy/windows/start-graphmind.bat" "$stage/"
cp "$root/deploy/windows/start-graphmind.ps1" "$stage/"
cp "$root/deploy/windows/README.txt" "$stage/"

python3 - "$stage" "$archive" <<'PY'
from pathlib import Path
import sys
import zipfile

stage_dir = Path(sys.argv[1])
archive = Path(sys.argv[2])
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for path in stage_dir.rglob("*"):
        if path.is_file():
            zf.write(path, path.relative_to(stage_dir.parent))
print(archive)
PY

shasum -a 256 "$archive" | tee "$archive.sha256"
echo "Windows package: $archive"
