# GraphMind

GraphMind is a local-first web app for turning spreadsheet files into an editable relationship graph with cited AI-style Q&A.

## Core Capabilities

- Import spreadsheets, JSON, documents, code archives, and governed URLs.
- Profile fields, resolve entities, infer relationships, and preserve source evidence.
- Review relationship suggestions with quality, SLA, trend, and audit workflows.
- Explore and export the graph in 2D or 3D, with searchable evidence navigation.
- Ask rule-backed or provider-enhanced questions that return cited answers.
- Run queued imports, readiness checks, verified backups, and retention maintenance.

## Backend

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
uvicorn graphmind.api.app:app --reload --host 127.0.0.1 --port 8000
```

The API stores local workspace files under `backend/.graphmind/` when run from the backend directory.

Production-oriented settings:

- `GRAPHMIND_DEPLOYMENT_MODE=production`
- `GRAPHMIND_ALLOWED_ORIGINS=https://graphmind.example.com`
- `GRAPHMIND_TRUSTED_HOSTS=graphmind.example.com`
- `GRAPHMIND_URL_IMPORT_ALLOWLIST=docs.example.com,*.trusted.example.com`
- `GRAPHMIND_AUTH_MODE=session`
- `GRAPHMIND_SESSION_SECRET=<strong-random-secret>`
- `GRAPHMIND_ADMIN_USERNAME=admin`
- `GRAPHMIND_ADMIN_PASSWORD=<strong-admin-password>`
- `GRAPHMIND_IMPORT_WORKER_MODE=external`
- `GRAPHMIND_WORKSPACE_ROOT=/var/lib/graphmind/workspace`
- `GRAPHMIND_AI_PROVIDER_ALLOWLIST=api.openai.com`
- `GRAPHMIND_AI_CHAT_API_KEY=<optional-environment-secret>`
- `GRAPHMIND_AI_VECTOR_API_KEY=<optional-environment-secret>`

The API exposes `GET /api/health` for liveness and `GET /api/ready` for
deployment readiness checks.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The Vite dev server proxies `/api` requests to `http://127.0.0.1:8000`.

## Tests

```bash
cd backend
. .venv/bin/activate
pytest -q
ruff check graphmind tests

cd ../frontend
npm test
npm run lint
npm run build
```

## Deployment

The first-stage private deployment package lives under `deploy/`.

```bash
cp deploy/.env.production.example deploy/.env.production
cd deploy
docker compose --env-file .env.production up --build --wait
GRAPHMIND_SMOKE_HOST=graphmind.example.com ./smoke-check.sh
```

For managed HTTPS with Caddy, edit `deploy/Caddyfile` and run:

```bash
cd deploy
docker compose -f docker-compose.yml -f docker-compose.tls.yml --env-file .env.production up --build --wait
```

See `docs/deployment-security-ops.md` for production configuration, readiness
checks, authentication/CSRF, project sharing, import worker operation, TLS
ingress, and rollback notes.

Deployment operations helper:

```bash
python3 deploy/graphmind-ops.py preflight \
  --env-file deploy/.env.production \
  --workspace-root /tmp/graphmind-preflight-workspace \
  --backup-dir /var/backups/graphmind
cd deploy
export GRAPHMIND_BACKUP_DIR=/var/backups/graphmind
sudo install -d -m 0750 -o 10001 -g 10001 "$GRAPHMIND_BACKUP_DIR"
docker compose --env-file .env.production down
docker compose --profile ops --env-file .env.production run --rm ops backup \
  --workspace-root /var/lib/graphmind/workspace \
  --backup-dir /backups \
  --label pre-upgrade \
  --quiesced
```
