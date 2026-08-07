# GraphMind Deployment Security And Ops Guide

Last updated: 2026-08-07

This guide covers the P4 deployment baseline for GraphMind: explicit production
configuration, authentication, CSRF protection, project sharing, import worker
operation, review analytics maintenance, security headers, readiness checks,
Docker Compose packaging, TLS ingress templates, and release smoke tests.

## Deployment Profiles

| Profile | Use Case | Command Path |
| --- | --- | --- |
| Local development | Single developer on localhost. | `README.md` backend/frontend commands. |
| Private team server | One trusted team behind a controlled origin. | `deploy/docker-compose.yml`. |
| Hosted workspace | Browser-authenticated hosted deployment with project share tokens. | `deploy/docker-compose.yml` plus optional `deploy/docker-compose.tls.yml`. |

## Required Production Configuration

Copy the template and replace example domains before starting Compose:

```bash
cp deploy/.env.production.example deploy/.env.production
```

Required settings:

| Variable | Required | Purpose |
| --- | --- | --- |
| `GRAPHMIND_DEPLOYMENT_MODE=production` | Yes | Enables production configuration validation and HSTS headers. |
| `GRAPHMIND_ALLOWED_ORIGINS` | Yes | CORS allowlist. Wildcard origins are rejected in production. |
| `GRAPHMIND_TRUSTED_HOSTS` | Recommended | Host header allowlist for reverse-proxied/private deployments. |
| `GRAPHMIND_URL_IMPORT_ALLOWLIST` | Yes for readiness | Host allowlist for URL import before exposing the API. |
| `GRAPHMIND_URL_IMPORT_DENYLIST` | Optional | Explicit host denylist layered on top of URL safety checks. |
| `GRAPHMIND_AI_PROVIDER_ALLOWLIST` | Yes for readiness | HTTPS host allowlist re-evaluated for every production AI request. |
| `GRAPHMIND_AI_CHAT_API_KEY` | Optional | Production chat-provider key; never store it in project settings. |
| `GRAPHMIND_AI_VECTOR_API_KEY` | Optional | Production vector-provider key; never store it in project settings. |
| `GRAPHMIND_URL_IMPORT_MAX_PER_PROCESS` | Recommended | Process-local URL import quota. |
| `GRAPHMIND_RATE_LIMIT_PER_MINUTE` | Recommended | Process-local API request limit per client. |
| `GRAPHMIND_MAX_UPLOAD_BYTES` | Recommended | Upload limit for file and batch imports. |
| `GRAPHMIND_AUTH_MODE` | Recommended | `disabled`, `shared-token`, or `session`; use `session` for hosted browser access. |
| `GRAPHMIND_SHARED_API_TOKEN` | Required for shared-token auth | Bearer token for simple API-only protection. |
| `GRAPHMIND_SESSION_SECRET` | Required for session auth | HMAC secret for signed administrator sessions. |
| `GRAPHMIND_ADMIN_USERNAME` | Required for session auth | Administrator login username. |
| `GRAPHMIND_ADMIN_PASSWORD` | Required for session auth | Administrator login password. |
| `GRAPHMIND_SESSION_TTL_SECONDS` | Optional | Session lifetime; defaults to 8 hours. |
| `GRAPHMIND_IMPORT_WORKER_MODE` | Recommended | `in-process` for local/private single process, `external` for hosted worker service. |
| `GRAPHMIND_WORKSPACE_ROOT` | Yes in containers | Persistent workspace path; Compose maps it to a named volume. |

Production startup fails when `GRAPHMIND_ALLOWED_ORIGINS` is missing or uses
`*`. Readiness fails when URL or AI provider allowlists are missing, when a
persisted AI endpoint violates the current policy, or when a project still
contains a plaintext AI key. Clear legacy project keys and rotate them into the
environment variables above before upgrading a production workspace.

## Docker Compose Deployment

Run the deployment preflight before starting or upgrading a private server:

```bash
python3 deploy/graphmind-ops.py preflight \
  --env-file deploy/.env.production \
  --workspace-root /tmp/graphmind-preflight-workspace \
  --backup-dir /var/backups/graphmind
```

Host preflight validates configuration and release artifacts against a
temporary workspace. The named volume itself is validated by Compose
`up --wait`, `/api/ready`, and the volume-backed backup command below.

For local validation with the example env, override the workspace path so the
script does not need `/var/lib` permissions:

```bash
python3 deploy/graphmind-ops.py preflight \
  --env-file deploy/.env.production.example \
  --workspace-root /tmp/graphmind-preflight-workspace \
  --backup-dir /tmp/graphmind-preflight-backups
```

Start the stack:

```bash
cd deploy
docker compose --env-file .env.production up --build --wait
```

Check service status:

```bash
docker compose --env-file .env.production ps
```

Run the smoke check:

```bash
GRAPHMIND_SMOKE_BASE_URL=https://graphmind.example.com ./smoke-check.sh
GRAPHMIND_SMOKE_BASE_URL=http://127.0.0.1:8080 \
  GRAPHMIND_SMOKE_HOST=graphmind.example.com \
  ./smoke-check.sh
```

Stop the stack:

```bash
docker compose --env-file .env.production down
```

The workspace is stored at `/var/lib/graphmind/workspace` inside the
`graphmind-workspace` named volume. Keep that volume during upgrades unless
intentionally resetting local data. Its parent directory is also volume-backed,
which lets restore stage a validated replacement beside the active workspace
and activate it with atomic renames. The Compose stack runs an external import
worker service by default, so queued imports are stored in SQLite and processed
by `python -m graphmind.workers.import_worker` against the same workspace
volume.

### Existing Volume Migration

Deployments created before this layout stored application data directly at the
volume root. Before first starting this version, make a verified archive of that
root and restore it to the new `workspace` child. This leaves the original root
data in place until the new stack has passed readiness checks:

```bash
cd deploy
export GRAPHMIND_BACKUP_DIR=/var/backups/graphmind
docker compose --env-file .env.production down
docker compose --profile ops --env-file .env.production run --rm ops backup \
  --workspace-root /var/lib/graphmind \
  --backup-dir /backups \
  --label pre-workspace-layout-migration \
  --quiesced
docker compose --profile ops --env-file .env.production run --rm ops restore \
  --archive /backups/graphmind-workspace-pre-workspace-layout-migration-YYYYMMDDTHHMMSSZ.tar.gz \
  --workspace-root /var/lib/graphmind/workspace
docker compose --env-file .env.production up --build --wait
```

Keep both the archive and the old root-level data through the rollback window.
Only remove the old root-level `state/`, `imports/`, and `import_jobs/` paths
after the new workspace has been independently verified and retention policy
allows it.

## HTTPS Ingress Profile

The optional TLS profile uses Caddy for managed HTTPS and browser security
headers:

```bash
cd deploy
docker compose \
  -f docker-compose.yml \
  -f docker-compose.tls.yml \
  --env-file .env.production \
  up --build --wait
```

Before using it, edit `deploy/Caddyfile` and replace:

- `graphmind.example.com` with the real hostname.
- `ops@example.com` with the certificate notification email.

The TLS profile exposes ports `80` and `443`, stores certificate state in
`caddy-data`, and reverse-proxies `/api/*` to the backend and all other
application routes to the frontend.

## Authentication, CSRF, And Sharing

GraphMind supports three auth modes:

- `disabled`: local development and trusted local-only operation.
- `shared-token`: API clients send `Authorization: Bearer <token>`.
- `session`: browser login via `POST /api/auth/session`; unsafe browser
  requests require the returned `X-CSRF-Token` header.

Session mode sets an HttpOnly `graphmind_session` cookie and returns a CSRF
token to the frontend. `GET /api/health` and `GET /api/ready` remain public so
monitoring can check liveness and readiness.

Administrators can create per-project share tokens:

- `POST /api/projects/{project_id}/share-tokens`
- `GET /api/projects/{project_id}/share-tokens`
- `DELETE /api/projects/{project_id}/share-tokens/{share_token_id}`

Share tokens are returned only once at creation time, stored as hashes, and can
be revoked. Viewer tokens can read only their project. Editor tokens can write
only their project, including relationship suggestion, entity match, and
documented mapping review routes under `/api/projects/{project_id}/...`. Review
routes verify that the reviewed resource belongs to the URL project id. Share
tokens cannot create or revoke other share tokens. In the workbench, the project
sharing panel shows token lifecycle metadata and revoke controls; plaintext
tokens remain one-time-visible only immediately after creation.

## Import Worker Operation

`GRAPHMIND_IMPORT_WORKER_MODE=in-process` keeps the local-first behavior: the
API process submits queued jobs to its own thread pool.

`GRAPHMIND_IMPORT_WORKER_MODE=external` keeps the API process from executing
import jobs. New jobs remain queued until a worker process consumes them:

```bash
python -m graphmind.workers.import_worker --workspace-root /var/lib/graphmind/workspace
python -m graphmind.workers.import_worker --workspace-root /var/lib/graphmind/workspace --once
```

The worker recovers stale running jobs and runs queued jobs from the persistent
SQLite queue. This is the recommended hosted profile because app container
replacement does not erase queued work.

## Review Analytics Snapshot Maintenance

Review analytics snapshots are governed by each project's
`review_analytics.retention_days` setting unless an operator passes an explicit
override. API manual cleanup and request-time cleanup use the same backend
maintenance service as the deployment ops helper and worker command below, so
audit rows and retention behavior stay consistent across UI and ops paths.

Preview expired snapshot cleanup without deleting data:

```bash
cd deploy
docker compose --profile ops --env-file .env.production run --rm ops \
  review-analytics-maintenance \
  --workspace-root /var/lib/graphmind/workspace \
  --dry-run
```

Clean expired snapshots for all projects:

```bash
docker compose --profile ops --env-file .env.production run --rm ops \
  review-analytics-maintenance \
  --workspace-root /var/lib/graphmind/workspace
```

Clean one project with a temporary retention override:

```bash
docker compose --profile ops --env-file .env.production run --rm ops \
  review-analytics-maintenance \
  --workspace-root /var/lib/graphmind/workspace \
  --project-id 42 \
  --retention-days 90
```

The ops helper prints JSON with status, processed project count, total removed
and remaining snapshot counts, and per-project cutoff details. `--env-file`
reads `GRAPHMIND_WORKSPACE_ROOT`; pass `--workspace-root` to override it for
temporary validation workspaces. Inside a backend container or virtualenv, the
equivalent worker module remains available:

```bash
python -m graphmind.workers.review_analytics_maintenance \
  --workspace-root /var/lib/graphmind/workspace \
  --dry-run
```

Supported retention overrides are normalized to the same 30, 90, 180, and 365
day windows used by project settings and the UI. Applied runs delete snapshots
older than the effective cutoff and write
`review_analytics_snapshot_cleanup_audits` rows; dry runs only report the
expected removed and remaining counts.

For private deployments, schedule this command with cron, a container job, or
the platform scheduler after backups are configured. GraphMind does not include
a managed recurring scheduler; multi-instance orchestration and centralized
job ownership remain hosted deployment scope.

## Backup And Restore

Backups and restores must run through the `ops` Compose profile. It mounts the
same `graphmind-workspace` named volume as backend and worker, so it operates on
the production data rather than an unrelated host directory. Set the host path
that will hold archive files before invoking the profile:

```bash
cd deploy
export GRAPHMIND_BACKUP_DIR=/var/backups/graphmind
sudo install -d -m 0750 -o 10001 -g 10001 "$GRAPHMIND_BACKUP_DIR"
```

The backend and ops image uses the fixed non-root UID/GID `10001:10001`.
Provision the bind-mounted archive directory for that identity before the first
backup; do not make it world-writable.

Quiesce backend and worker writers first, then create a timestamped backup.
`--quiesced` is an explicit safety assertion; the command refuses a live backup
without it:

```bash
docker compose --env-file .env.production down
docker compose --profile ops --env-file .env.production run --rm ops backup \
  --workspace-root /var/lib/graphmind/workspace \
  --backup-dir /backups \
  --label pre-upgrade \
  --quiesced
```

Every backup includes `manifest.json` and `checksums.sha256`; creation verifies
both before publishing the archive. The command runs SQLite and DuckDB
integrity probes and streams file checksums, so large database files are not
loaded into memory. The manifest covers both databases and the complete
`state/`, `imports/`, and `import_jobs/` directory structure. Keep the archive
output from the command for the restore path.

Restore to an empty workspace directory inside the volume:

```bash
docker compose --profile ops --env-file .env.production run --rm ops restore \
  --archive /backups/graphmind-workspace-pre-upgrade-YYYYMMDDTHHMMSSZ.tar.gz \
  --workspace-root /var/lib/graphmind/workspace
```

If replacing an existing workspace is intentional, pass `--force`. Restore
checks the archive manifest and every checksum before extraction, stages the
replacement under `/var/lib/graphmind` in the named volume, validates that
staged tree again, and uses atomic renames to switch it into place. The prior
workspace is retained as a sibling `.<workspace>.previous-*` directory until
the switch succeeds; any exception rolls the active path back. Restore archives
also reject absolute paths, `..` path segments, archive links, duplicate member
paths, and missing required data.

The restore result reports the retained `previous_workspace` path when replacing
an existing workspace. Keep it through the rollback window and remove it only
after the new workspace has passed readiness and the backup retention policy.

After a successful restore, start the stack and wait for full readiness before
accepting traffic:

```bash
docker compose --env-file .env.production up --build --wait
```

## Health And Readiness

GraphMind exposes two operational endpoints:

| Endpoint | Meaning | Expected Status |
| --- | --- | --- |
| `GET /api/health` | Lightweight process liveness. | `200 {"status":"ok"}` |
| `GET /api/ready` | Deployment readiness and configuration checks. | `200 {"status":"ready", ...}` |

Readiness checks include:

- CORS origin configuration.
- Trusted host configuration status.
- Workspace directory initialization.
- URL import allowlist status.
- AI provider allowlist and persisted endpoint/key policy.
- API auth mode status.
- Database connectivity, free disk space, and import worker heartbeat freshness.

Compose uses `/api/ready` for backend health and the worker heartbeat for worker
health. The worker waits for backend `/api/health`, rather than backend
readiness, before initializing the shared database and publishing its
heartbeat. This avoids both the readiness dependency cycle and concurrent
startup migrations. Frontend and optional Caddy ingress wait for both backend
and worker health; `docker compose up --wait` therefore returns only after the
full serving path is ready.

A production deployment with missing URL import allowlist returns HTTP `503`
from `/api/ready` with `status: "not_ready"`.

## Security Baseline

P4 enforces or templates these controls:

- Production CORS requires explicit origins and rejects `*`.
- API responses include `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, `Cache-Control`, and production HSTS.
- Compose frontend serves static assets through Nginx with matching browser
  security headers and a restrictive CSP.
- Optional trusted host enforcement is wired through `GRAPHMIND_TRUSTED_HOSTS`.
- URL import readiness requires an allowlist in production.
- API responses include `X-Request-ID`; safe inbound request ids are preserved
  for log correlation.
- `GRAPHMIND_RATE_LIMIT_PER_MINUTE` enables process-local API rate limiting.
  `/api/health` and `/api/ready` are exempt so monitoring probes remain stable.
- Session auth protects hosted browser deployments with signed HttpOnly cookies
  and CSRF tokens.
- Project share tokens are scoped by project and role, stored only as hashes,
  revocable by administrators, and required to use project-scoped review routes
  for collaborative relationship and source review actions.
- External import worker mode keeps queued imports durable across API process
  replacement.
- Review analytics snapshot maintenance can be run as an operator-controlled
  command with dry-run support before applying retention cleanup.
- Caddy TLS ingress templates provide automatic certificates, HSTS, CSP, and
  reverse proxying.
- Containers run the backend as a non-root `graphmind` user.
- Local workspace state is excluded from Docker build context by `.dockerignore`.

Process-local rate limiting is a private-server baseline. For multi-instance or
public deployments, add shared rate limiting at the reverse proxy, ingress, or
API gateway layer before exposing the API.

## Release Verification

Run these before shipping a P4 private or hosted deployment:

```bash
cd backend
. .venv/bin/activate
pytest tests/test_deployment_security_phase_p4.py -q
pytest tests/test_review_analytics_maintenance.py -q
pytest -q
ruff check graphmind tests

cd ../frontend
npm test
npm run lint
npm run build
npm run audit:layout
npm run audit:quality

cd ..
GRAPHMIND_SERVICE_ENV_FILE=.env.production.example \
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production.example config
GRAPHMIND_SERVICE_ENV_FILE=.env.production.example \
  docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.tls.yml \
  --env-file deploy/.env.production.example config
python3 deploy/graphmind-ops.py preflight \
  --env-file deploy/.env.production.example \
  --workspace-root /tmp/graphmind-preflight-workspace \
  --backup-dir /tmp/graphmind-preflight-backups
```

For a running private deployment, also run:

```bash
GRAPHMIND_SMOKE_BASE_URL=https://graphmind.example.com deploy/smoke-check.sh
GRAPHMIND_SMOKE_BASE_URL=http://127.0.0.1:8080 \
  GRAPHMIND_SMOKE_HOST=graphmind.example.com \
  deploy/smoke-check.sh
```

## Rollback

- Back up the `graphmind-workspace` volume before upgrades that change import,
  evidence, or database behavior.
- Record the deployed Git commit and keep its source checkout available for a
  deterministic rebuild; Dockerfiles, build helpers, and service images are
  pinned by digest.
- If `/api/ready` returns `not_ready`, inspect the failing `checks` entry before
  restarting repeatedly.
- For hosted use, keep `GRAPHMIND_AUTH_MODE=session`,
  `GRAPHMIND_IMPORT_WORKER_MODE=external`, strict CORS, trusted hosts, rate
  limiting, and TLS ingress enabled.

## Remaining Hosted Hardening

These are the remaining scale-out and compliance items after the P4 baseline:

- Replace the single administrator account with named users if audit trails,
  offboarding, or per-user accountability are required.
- Add a shared/distributed rate limiter at the ingress or API gateway for
  multi-instance public deployments.
- Add external queue infrastructure such as Redis/RQ, Celery, or a managed queue
  only if SQLite-backed worker processing is no longer enough.
- Add managed identity, SSO, and organization-level tenancy before public
  self-service SaaS exposure.
