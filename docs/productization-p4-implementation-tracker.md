# GraphMind P4 Deployment Security And Ops Tracker

Last updated: 2026-06-07

## Status Legend

- Not started: no code or tests written.
- In progress: tests or implementation started.
- Verifying: implementation exists and verification is running.
- Done: implementation and listed verification passed.

## P4-1 Deployment Security Baseline

Status: Done

- Added deployment settings loader for `development` and `production` modes.
- Production mode rejects missing `GRAPHMIND_ALLOWED_ORIGINS`.
- Production mode rejects wildcard CORS origins.
- Development mode preserves local Vite origins for the existing developer flow.
- API responses include baseline security headers.
- Optional `GRAPHMIND_TRUSTED_HOSTS` enables Host header enforcement.
- Verification: `cd backend && . .venv/bin/activate && pytest tests/test_deployment_security_phase_p4.py -q`

## P4-2 Health And Readiness

Status: Done

- Kept `GET /api/health` as lightweight liveness.
- Added `GET /api/ready` for CORS, trusted host, workspace, and URL import
  allowlist checks.
- Production readiness returns HTTP `503` when URL import is exposed without
  `GRAPHMIND_URL_IMPORT_ALLOWLIST`.
- Added environment-controlled workspace root via `GRAPHMIND_WORKSPACE_ROOT`.
- Verification: `cd backend && . .venv/bin/activate && pytest tests/test_deployment_security_phase_p4.py -q`

## P4-3 Deployment Package

Status: Done

- Added `deploy/.env.production.example`.
- Added backend Dockerfile with non-root runtime user.
- Added frontend Dockerfile for Vite build plus Nginx static serving.
- Added Nginx reverse proxy config for `/api/`, static fallback, and browser
  security headers.
- Added Docker Compose stack with persistent workspace volume and health checks.
- Added `.dockerignore` and ignored local `deploy/.env.production`.
- Added `deploy/smoke-check.sh` for liveness/readiness smoke checks.
- Verification: Compose YAML static parse passed locally; `docker compose config`
  must be run in an environment with Docker CLI before private server release.

## P4-4 Operations Documentation

Status: Done

- Added `docs/deployment-security-ops.md`.
- Updated README with production configuration and deployment pointers.
- Updated release checklist with deployment readiness and smoke checks.
- Updated roadmap to mark P4 completed, with named users, SSO, organization
  tenancy, distributed rate limiting, and managed queue infrastructure kept as
  hosted scale-out work.
- Verification: documentation self-review and final gate commands below.

## P4-5 Deployment Operations Automation

Status: Done

- Added `deploy/graphmind-ops.py` for JSON-emitting deployment operations.
- Added `preflight` to validate production env files, workspace initialization,
  backup directory creation, deploy artifacts, Docker CLI availability, and URL
  import allowlist readiness.
- Added `backup` to create timestamped `.tar.gz` workspace archives.
- Added `restore` to restore workspace archives, refuse non-empty targets by
  default, and reject unsafe tar members or archive links.
- Verification: `cd backend && . .venv/bin/activate && pytest tests/test_deployment_ops_phase_p4.py -q`

## P4-6 Runtime Guardrails

Status: Done

- Added `X-Request-ID` to API responses for operational correlation.
- Preserves safe inbound `X-Request-ID` values and replaces unsafe values.
- Added optional process-local API rate limiting via
  `GRAPHMIND_RATE_LIMIT_PER_MINUTE`.
- Exempted `/api/health` and `/api/ready` from rate limiting for probes.
- Added `Retry-After`, `X-RateLimit-Limit`, and `X-RateLimit-Remaining` headers
  plus the unified error detail shape on `429` responses.
- Verification: `cd backend && . .venv/bin/activate && pytest tests/test_runtime_guardrails_phase_p4.py -q`

## P4-7 Authentication, Session, And CSRF

Status: Done

- Added `GRAPHMIND_AUTH_MODE=disabled|shared-token|session`.
- Added shared Bearer token protection via `GRAPHMIND_SHARED_API_TOKEN`.
- Added browser session login via `POST /api/auth/session`.
- Session mode sets a signed HttpOnly cookie and returns a CSRF token.
- Unsafe browser methods require `X-CSRF-Token`; health/readiness and CORS
  preflight remain public.
- Frontend now shows a hosted login form only after an auth challenge and
  automatically attaches CSRF to unsafe requests after login.
- Verification:
  `cd backend && . .venv/bin/activate && pytest tests/test_auth_guardrails_phase_p4.py -q`
  and
  `cd frontend && npm test -- --run tests/apiClientImportBatch.test.ts tests/App.test.tsx tests/useWorkspaceBootstrap.test.tsx tests/useImportActions.test.tsx tests/useAiActions.test.tsx tests/useReviewActions.test.tsx`

## P4-8 Project Sharing And Authorization

Status: Done

- Added hashed, revocable per-project share tokens.
- Administrators can create, list, and revoke project share tokens.
- Frontend project sharing panel now shows token lifecycle metadata, including
  creation date, last-used date or never-used state, and revoked date.
- Newly created share tokens remain one-time-visible in the panel with a copy
  action and explicit instruction to store them immediately; listed tokens never
  expose plaintext token values.
- Viewer tokens can read only their project.
- Editor tokens can write only their project.
- Editor tokens can review relationship suggestions, entity matches, and
  documented mappings only through project-scoped review routes, with resource
  ownership checked against the URL project id.
- Share tokens cannot administer other share tokens.
- Verification:
  `cd backend && . .venv/bin/activate && pytest tests/test_auth_guardrails_phase_p4.py -q`

## P4-9 Hosted Import Worker Mode

Status: Done

- Added `GRAPHMIND_IMPORT_WORKER_MODE=in-process|external`.
- External mode keeps API-created import jobs queued until a worker consumes the
  persistent SQLite queue.
- Added `python -m graphmind.workers.import_worker` with continuous and `--once`
  modes.
- Docker Compose now runs a dedicated `worker` service against the shared
  workspace volume.
- Readiness reports import worker mode.
- Verification:
  `cd backend && . .venv/bin/activate && pytest tests/test_import_worker_mode_phase_p4.py -q`

## P4-10 TLS Ingress Profile

Status: Done

- Added `deploy/Caddyfile` with managed HTTPS, HSTS, CSP, security headers, and
  backend/frontend reverse proxying.
- Added `deploy/docker-compose.tls.yml` exposing ports `80` and `443` through
  Caddy while preserving the shared workspace volume.
- Verification:
  `cd backend && . .venv/bin/activate && pytest tests/test_tls_ingress_phase_p4.py -q`
  and Ruby YAML parse for `deploy/docker-compose.yml` plus
  `deploy/docker-compose.tls.yml`.

## Final P4 Deployment Security And Ops Verification

- Backend deployment security tests:
  `cd backend && . .venv/bin/activate && pytest tests/test_deployment_security_phase_p4.py -q`
  -- Passed, 7 tests.
- Backend full suite: `cd backend && . .venv/bin/activate && pytest -q` --
  Passed, 239 tests.
- Backend lint: `cd backend && . .venv/bin/activate && ruff check graphmind tests`
  -- Passed.
- Frontend tests: `cd frontend && npm test` -- Passed, 43 files and 321 tests.
- Frontend type check: `cd frontend && npm run lint` -- Passed.
- Frontend build: `cd frontend && npm run build` -- Passed without large chunk
  warnings after vendor chunk splitting.
- Frontend layout audit: `cd frontend && npm run audit:layout` -- Passed, 60
  viewport/state checks.
- Compact mobile layout regression: graph canvas remains visible, the
  workbench status bar stays pinned to the final grid row, and the insights AI
  prompt form no longer overlaps the status bar; latest audit summary:
  `problemCount=0`, `unexpectedConsoleIssueCount=0`, `allowedConsoleIssueCount=0`.
- Frontend quality audit: `cd frontend && npm run audit:quality` -- Passed;
  latest budget requires `buildWarningCount=0`.
- Deployment package static checks: `sh -n deploy/smoke-check.sh` and Ruby YAML
  parse for `deploy/docker-compose.yml` -- Passed.
- Local production smoke check: real Uvicorn process with
  `GRAPHMIND_DEPLOYMENT_MODE=production`, trusted host, URL import allowlist, and
  workspace root -- Passed; `health: 200 ok`, `ready: 200 ready`.
- Deployment ops automation tests:
  `cd backend && . .venv/bin/activate && pytest tests/test_deployment_ops_phase_p4.py -q`
  -- Passed, 6 tests.
- Runtime guardrail tests:
  `cd backend && . .venv/bin/activate && pytest tests/test_runtime_guardrails_phase_p4.py -q`
  -- Passed, 6 tests.
- Auth/session/CSRF/project sharing tests:
  `cd backend && . .venv/bin/activate && pytest tests/test_auth_guardrails_phase_p4.py -q`
  -- Passed, 19 tests.
- Hosted import worker mode tests:
  `cd backend && . .venv/bin/activate && pytest tests/test_import_worker_mode_phase_p4.py -q`
  -- Passed, 4 tests.
- TLS ingress static tests:
  `cd backend && . .venv/bin/activate && pytest tests/test_tls_ingress_phase_p4.py -q`
  -- Passed, 2 tests.
- Frontend hosted auth integration tests:
  `cd frontend && npm test -- --run tests/apiClientImportBatch.test.ts tests/App.test.tsx tests/useWorkspaceBootstrap.test.tsx tests/useImportActions.test.tsx tests/useAiActions.test.tsx tests/useReviewActions.test.tsx`
  -- Passed, 48 tests.
- Runtime guardrail smoke: real Uvicorn process with
  `GRAPHMIND_RATE_LIMIT_PER_MINUTE=1` preserved `X-Request-ID=runtime-smoke-1`
  and returned `429` with `Retry-After: 60` on the second non-health request.
- Deployment ops lint:
  `cd backend && . .venv/bin/activate && ruff check tests/test_deployment_ops_phase_p4.py ../deploy/graphmind-ops.py`
  -- Passed.
- Deployment preflight smoke:
  `python3 deploy/graphmind-ops.py preflight --env-file deploy/.env.production.example --workspace-root /tmp/graphmind-p4-preflight-workspace --backup-dir /tmp/graphmind-p4-preflight-backups`
  -- Passed with `status: "ready"` and Docker CLI warning on this machine.
- Deployment backup/restore smoke: `deploy/graphmind-ops.py backup` created a
  timestamped workspace archive, and `deploy/graphmind-ops.py restore` recovered
  the workspace files into a clean target directory.
- Compose config validation: not run locally because `docker`, `podman`,
  `nerdctl`, and `yq` are unavailable in this environment. Before a private
  server release, run
  `GRAPHMIND_SERVICE_ENV_FILE=.env.production.example docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production.example config`.

## Review Notes

- This workspace is not a git repository, so review could not use `git diff` or
  commit SHAs. File-level review used explicit file reads, targeted tests, full
  gates, smoke checks, and documentation placeholder scans.
- The smoke script disables Python `urllib` proxy auto-discovery so localhost
  deployment checks are not routed through developer-machine HTTP proxies.
- P4 now covers the previously deferred hosted baseline: authentication,
  session/CSRF, scoped project sharing, external import worker operation, and a
  TLS ingress template.

## Remaining Hosted Hardening

- Named multi-user accounts, SSO, organization tenancy, and per-user audit logs
  remain future hosted/SaaS work.
- Distributed ingress/API-gateway rate limiting is still required for
  multi-instance public deployments.
- Redis/RQ, Celery, or a managed external queue should be added only if the
  SQLite-backed worker queue is no longer enough.
- Compose config validation still must be run in a Docker-capable environment;
  this local machine does not provide Docker, Podman, nerdctl, or yq.
