#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${GRAPHMIND_SMOKE_BASE_URL:-http://127.0.0.1:8080}"
API_URL="${GRAPHMIND_SMOKE_API_URL:-${BASE_URL%/}/api}"

python - "$API_URL" <<'PY'
import json
import os
import sys
import urllib.error
import urllib.request

api_url = sys.argv[1].rstrip("/")
smoke_host = os.environ.get("GRAPHMIND_SMOKE_HOST", "").strip()
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def fetch_json(path: str) -> tuple[int, dict[str, object]]:
    headers = {"Host": smoke_host} if smoke_host else {}
    request = urllib.request.Request(f"{api_url}/{path}", headers=headers)
    try:
        with opener.open(request, timeout=8) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


health_status, health_payload = fetch_json("health")
print(f"health: {health_status} {health_payload.get('status')}")
if health_status != 200 or health_payload.get("status") != "ok":
    raise SystemExit("GraphMind health check failed")

ready_status, ready_payload = fetch_json("ready")
print(f"ready: {ready_status} {ready_payload.get('status')}")
if ready_status != 200 or ready_payload.get("status") != "ready":
    print(json.dumps(ready_payload, indent=2, ensure_ascii=False))
    raise SystemExit("GraphMind readiness check failed")
PY
