# GraphMind Productization Release Checklist

Last updated: 2026-08-07

Use this checklist before shipping a productized GraphMind build. It is aligned
with `.github/workflows/productization-gates.yml`, the P3 tracker, and the P4
deployment security, collaboration, and operations baseline.

## Required Gates

| Gate | Command | Required Evidence |
| --- | --- | --- |
| Backend behavior | `cd backend && . .venv/bin/activate && pytest -q` | All backend tests pass. |
| Backend lint | `cd backend && . .venv/bin/activate && ruff check graphmind tests` | Ruff reports all checks passed. |
| URL import safety | `cd backend && . .venv/bin/activate && pytest tests/test_url_import_phase_60.py -q` | URL governance and SSRF guardrail tests pass. |
| Deployment security | `cd backend && . .venv/bin/activate && pytest tests/test_deployment_security_phase_p4.py -q` | Production config validation, security headers, CORS, and readiness checks pass. |
| Auth/session/CSRF | `cd backend && . .venv/bin/activate && pytest tests/test_auth_guardrails_phase_p4.py -q` | Auth modes, session login, CSRF, and project sharing authorization pass. |
| Hosted import worker | `cd backend && . .venv/bin/activate && pytest tests/test_import_worker_mode_phase_p4.py -q` | External worker mode queues in API and consumes from worker. |
| Review analytics maintenance | `cd backend && . .venv/bin/activate && pytest tests/test_review_analytics_maintenance.py -q` | Snapshot cleanup command handles all-project, project-scoped, retention override, dry-run, and audit behavior. |
| TLS ingress static checks | `cd backend && . .venv/bin/activate && pytest tests/test_tls_ingress_phase_p4.py -q` | Caddy and TLS Compose templates include required security controls. |
| Frontend behavior | `cd frontend && npm test` | All frontend tests pass. |
| Frontend type check | `cd frontend && npm run lint` | TypeScript emits no errors. |
| Frontend build | `cd frontend && npm run build` | Production build exits 0. |
| Frontend layout audit | `cd frontend && npm run audit:layout` | Layout audit artifacts show `problemCount: 0`. |
| Quality budget | `cd frontend && npm run audit:quality` | Quality audit passes configured budgets. |
| Dependency review | GitHub `dependency-review` job on pull requests | New or changed dependencies do not introduce high or critical known vulnerabilities; frontend animation, 3D, and import-related packages receive explicit review. |
| Python dependency audit | GitHub `supply-chain-gates` job or `cd backend && uv export --frozen --no-dev --no-emit-project --no-hashes --output-file /tmp/graphmind-production-requirements.txt && uvx --from pip-audit==2.9.0 pip-audit --requirement /tmp/graphmind-production-requirements.txt --no-deps --disable-pip` | The frozen production Python dependency graph has no known vulnerabilities. |
| Deployment preflight | `python3 deploy/graphmind-ops.py preflight --env-file deploy/.env.production --backup-dir <backup-dir>` | Production env, workspace, backup path, deploy artifacts, and URL allowlist are ready. |
| Compose config | `GRAPHMIND_SERVICE_ENV_FILE=.env.production.example docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production.example config` | Deployment package renders valid Compose config. |
| TLS Compose config | `GRAPHMIND_SERVICE_ENV_FILE=.env.production.example docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.tls.yml --env-file deploy/.env.production.example config` | HTTPS ingress profile renders valid Compose config. |

## Artifact Review

- Layout audit artifacts: review `tmp-layout-audit-auto/layout-audit-summary.json`,
  `tmp-layout-audit-auto/layout-audit.json`, and key screenshots for desktop,
  mobile, and compact mobile states.
- Deployment gate artifacts: review `tmp-deployment-gates/deployment-preflight.json`,
  `tmp-deployment-gates/compose-config.json`, and
  `tmp-deployment-gates/compose-tls-config.json` from CI to confirm the
  production example env reports `status: "ready"`, the private-server Compose
  profile includes `backend`, `frontend`, and `worker`, and the TLS ingress
  profile also includes `caddy` before release.
- Compact mobile review: confirm graph default/tools/analysis states keep the
  graph canvas visible above the status bar, and insights AI keeps messages and
  prompt form fully inside the panel.
- Frontend build artifacts: review `frontend/dist` and note any build warnings.
- CI artifacts: confirm `layout-audit`, `deployment-gates`, and `frontend-dist`
  are uploaded when CI runs, including failed runs for debugging.
- Dependency review: inspect dependency changes for frontend animation, 3D, and
  import-related packages, and record any accepted risk in release notes.
- Deployment artifacts: review `deploy/.env.production.example`,
  `deploy/docker-compose.yml`, Dockerfiles, `deploy/nginx.conf`, and
  `deploy/Caddyfile`, `deploy/docker-compose.tls.yml`, and
  `deploy/smoke-check.sh` before private server release.
- Operations artifacts: review `deploy/graphmind-ops.py` and confirm the latest
  backup archive exists before upgrade or rollback-sensitive releases.
- Review analytics maintenance: confirm operators know the workspace root and
  retention schedule, and dry-run
  `python3 deploy/graphmind-ops.py review-analytics-maintenance --env-file deploy/.env.production --dry-run`
  before enabling a cron, container job, or platform scheduler. Confirm the
  command always prints JSON; missing workspace configuration or unreadable env
  files should return `status: "failed"` with a remediation message.

## Product Smoke Checks

- Create or open a local workspace.
- Import a spreadsheet or sample dataset and confirm the first graph appears.
- Open data import, AI settings, search, command palette, graph tools, graph
  analysis drawer, data module, and insights AI on desktop and mobile widths.
- Trigger a failed import or use an existing failed task and confirm recovery
  actions remain visible and actionable.
- Confirm URL import safety errors return actionable user-facing messages.
- Confirm `GET /api/health` returns `200` and `GET /api/ready` returns
  `status: "ready"` for the target deployment.
- Confirm API responses include `X-Request-ID`; include that value in incident
  notes when debugging failed requests.
- Confirm `GRAPHMIND_RATE_LIMIT_PER_MINUTE` is set for private server releases,
  or document why the reverse proxy/gateway owns rate limiting instead.
- Confirm hosted browser deployments use `GRAPHMIND_AUTH_MODE=session` and a
  strong `GRAPHMIND_SESSION_SECRET` plus administrator password.
- Confirm unsafe browser requests after login include `X-CSRF-Token`.
- Create a viewer project share token and verify it can read only that project.
- Create an editor project share token and verify it can write only that
  project, including relationship suggestion, entity match, and documented
  mapping review actions.
- Verify project share review actions use `/api/projects/{project_id}/...`
  routes and reject resources from another project.
- Revoke a project share token and verify it is rejected.
- For hosted deployments, confirm `GRAPHMIND_IMPORT_WORKER_MODE=external` and
  the `worker` service is running.
- Dry-run review analytics maintenance with
  `python3 deploy/graphmind-ops.py review-analytics-maintenance --env-file deploy/.env.production --dry-run`
  and record the processed project count plus expired snapshot count before
  applying scheduled cleanup.
- If using managed TLS, run the stack with `deploy/docker-compose.tls.yml` and
  verify HTTPS, HSTS, CSP, and `/api/ready`.
- Run `GRAPHMIND_SMOKE_BASE_URL=<deployment-url> deploy/smoke-check.sh`.
- Run a backup drill through `docker compose --profile ops ... run --rm ops backup`
  against `/var/lib/graphmind/workspace` and, for release rehearsals, restore
  into a temporary directory inside the same named volume.

## Closed Non-Blocking Risks

- The previous Vite large chunk warning is closed by production vendor chunk
  splitting. `frontend/quality-budgets.json` requires `maxBuildWarnings: 0`.
- The previous React Flow parent-container warning is closed by avoiding
  GraphCanvas mounting inside hidden responsive modules. Layout audit no longer
  keeps an allowlist for this warning.

### P10 Release Verification Hardening

- Chat evidence-chain duplicate React key warnings are closed by
  regression coverage for repeated citations, repeated retrieved evidence, and
  repeated next steps.
- `data-dialog` layout audit coverage now requires a visible dialog target and
  reports `missingStateTarget` when the named state is not actually open.
- Deployment gate artifacts are uploaded with deployment artifact integrity
  checks: preflight must report `status: "ready"`, the private Compose
  artifact must include `backend`, `frontend`, and `worker`, and the TLS Compose
  artifact must also include `caddy`.
- Local machines without Docker may only validate preflight JSON and static
  workflow structure; real Compose rendering and artifact integrity validation
  run on the GitHub Ubuntu runner.

### P11 Professional Engineering Baseline

- Coverage gate: run `cd backend && . .venv/bin/activate && pytest --cov=graphmind --cov-report=term-missing --cov-fail-under=70 -q`.
- OpenAPI contract: run `cd backend && . .venv/bin/activate && python scripts/export_openapi_contract.py --check`.
- Source lint: run `cd frontend && npm run lint:source`.
- Frontend contract: run `cd frontend && npm run contract:api`.
- E2E smoke: run `cd frontend && npm run test:e2e` after the backend smoke server is healthy.
- Architecture budget: run `cd frontend && npm run audit:architecture`.
- Artifact hygiene: run `cd frontend && npm run clean:artifacts -- --check`.
- Observability: confirm request logs include structured `graphmind.access` records
  and the `X-Process-Time-Ms` response header during smoke validation.

## Remaining Deferred Scope

- P4 now covers strict production CORS, security headers, readiness checks,
  auth/session/CSRF, scoped project sharing, external import worker mode, review
  analytics maintenance commands, JSON env-file failure handling, and TLS
  ingress templates. Named user accounts, SSO, organization tenancy,
  distributed rate limiting, managed recurring jobs, and managed queues remain
  hosted scale-out work.

## Sign-Off

- Backend owner:
- Frontend owner:
- Product/design owner:
- QA/release owner:
