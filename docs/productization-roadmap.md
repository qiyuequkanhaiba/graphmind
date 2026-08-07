# GraphMind Productization Roadmap

Last updated: 2026-06-14

This roadmap records the productization state after the P0/P1/P2/P3/P4/P5/P6/P7/P8/P9/P10
implementation tracks. Use the phase trackers for execution status and this
document for ownership, operating gates, and the next product direction.

## Productization Principles

- Keep GraphMind local-first, evidence-first, and inspectable.
- Make graph exploration the primary work surface; move secondary analysis into
  drawers, tabs, command flows, and lazy-loaded panels.
- Prefer user-facing recovery actions over generic error states.
- Keep motion useful and quiet: GSAP animation should use transform and opacity,
  respect reduced motion, and never block focus or keyboard navigation.
- Treat import as a governed workflow with observable jobs, diagnostics, safety
  limits, retry paths, and evidence navigation.
- Product quality must be repeatable through tests, layout audits, quality
  budgets, lint, and build gates.

## Completed Baseline

### P0 Stabilization

- Workspace first-load snapshot API reduces bootstrap request fan-out.
- Unified backend error contract exposes `code`, `message`, `user_action`,
  `retryable`, and `field_errors`.
- Import task event stream adds real-time progress updates with polling fallback.
- Frontend workbench state is split into bootstrap, import, review, and AI action
  hooks.
- Mobile layout stability is guarded by automated layout audit coverage.

### P1 Product Experience

- GSAP motion system is scoped through workbench motion helpers and tested for
  transform, opacity, cleanup, and reduced-motion behavior.
- Workflows now surface next steps, import completion guidance, prioritized
  review queues, and evidence-to-inspector-to-graph navigation.
- Backend API routing and import services are split by domain while public paths
  stay compatible.
- Evidence and data views support lazy loading, pagination, and graph filtering
  so large workspaces do not force full eager hydration.

### P2 Operational Hardening

- Workspace versioning supports incremental refresh instead of full state reloads
  after every change.
- Performance and quality gates now include layout audit, visual state coverage,
  bundle budget checks, dialog focus coverage, compact mobile coverage, and
  GSAP motion regression tests.
- URL import security blocks unsupported schemes, credentials, blocked/private
  networks, unsafe redirects, disallowed ports, oversized responses, unsupported
  content types, and fetches without timeout enforcement.
- URL import governance supports configurable host allowlist/denylist,
  per-process quotas, production readiness checks, safety diagnostics, and
  parser-based static HTML text extraction that removes page chrome.
- This roadmap records ownership, verification gates, completed scope, and
  deferred productization work.

### P3 Release And Governance

- CI gates cover backend tests/lint, frontend tests/type check/build, layout
  audit, and quality audit.
- Release checklist maps each gate to required evidence and smoke checks.
- Frontend quality budgets govern bundle size and known build warnings.
- URL import governance supports host allowlist/denylist and process-local
  quotas.

### P4 Deployment Security, Collaboration, And Ops

- Production deployment mode validates CORS origins and rejects wildcard hosted
  origins.
- API security headers are applied to responses, with production HSTS.
- `/api/ready` reports deployment readiness for CORS, trusted hosts, workspace,
  URL import allowlist, auth mode, and import worker mode.
- Docker Compose packaging covers a private team server profile with persistent
  workspace storage, frontend Nginx serving, backend Uvicorn, dedicated import
  worker service, and smoke checks.
- Hosted browser authentication supports administrator session login, signed
  HttpOnly cookies, and CSRF protection.
- Shared Bearer token auth remains available for API-only private deployments.
- Project share tokens are hashed, revocable, role-scoped, and limited to a
  single project. The workbench project sharing panel exposes lifecycle
  metadata, one-time token copy, and revoke controls without listing plaintext
  token values after creation.
- External worker mode lets imports survive API container replacement through
  the persistent SQLite queue and workspace volume.
- Caddy TLS ingress templates provide HTTPS, automatic certificate management,
  HSTS, CSP, and reverse proxying.
- Operational guidance lives in `docs/deployment-security-ops.md`.

### P5 Review Ops And Quality Command Center

- The relationship review panel now includes a compact operations summary for
  current review workload, high-priority relationships, low-quality pending
  risk, evidence coverage, and accepted/rejected/edited distribution.
- Review filters are saved locally so analyst workflows can return to the last
  selected review queue unless a shortcut explicitly opens a specific queue.
- Reviewers can export a JSON audit report for the current filtered review
  view, including summary metrics, governance data, visible suggestion ids,
  quality labels, quality reasons, confidence, evidence summaries, and evidence
  payloads.
- P5 remains API-compatible and frontend-first. It set the review operations
  surface that P6 later extends with durable timestamps and aging analytics.

### P5 User Onboarding And Recovery

- The import intake surface includes first-graph templates for spreadsheet,
  document, code repository, and URL use cases.
- Selecting a first-graph template now reveals a compact next-step panel with
  source-specific guidance and the matching action, keeping onboarding inside
  the actual workbench instead of a landing page.
- The same template panel now shows a non-mutating project preset
  recommendation: conservative rules/no-vector defaults for spreadsheet and
  URL starts, and vector-enhanced OpenAI Compatible defaults for document and
  code starts.
- The graph canvas empty state shows first-graph source categories before data
  exists, and the relationship review panel shows a low-confidence recovery
  playbook when evidence quality is weak.
- Failed import tasks now preserve structured frontend `ApiError` recovery
  details from the unified backend error contract: code, user action, retryable
  flag, and field errors.
- The import task list renders recovery actions and field-specific problems
  beside the existing file/URL recovery playbooks, so unsupported source types
  and failed uploads point to the next repair step instead of a generic error.
- Retry, running, and success transitions clear stale recovery metadata to keep
  the task history trustworthy during repeated import attempts.

### P6 Review Analytics Timestamps

- Relationship suggestions now persist UTC `created_at` and `updated_at`
  timestamps, with SQLite migration/backfill for existing workspaces.
- Relationship suggestion API responses expose `created_at` and `updated_at`
  so frontend review analytics can use durable server-backed time sources.
- The relationship review operations summary now reports overdue pending
  suggestions and the oldest pending age when timestamp evidence exists.
- Review audit JSON exports include `createdAt` and `updatedAt` per visible
  suggestion for handoff and downstream operations analysis.
- P6-A established the durable timestamp foundation that P7-A uses for
  backend-owned review analytics.

### P7 Review Analytics SLA

- `GET /api/projects/{project_id}/review-analytics?window=30d` returns
  project-scoped review analytics with pending SLA totals, overdue pending
  counts, oldest pending age, aging buckets, status trend distribution,
  quality distribution, and evidence coverage.
- Workspace snapshot and incremental refresh payloads include
  `review_analytics`, so first load and post-action refreshes do not rely on
  frontend-only recomputation.
- Workspace versioning includes relationship suggestion `updated_at` changes,
  ensuring review decisions refresh analytics consumers.
- The frontend loads analytics from the snapshot or fallback endpoint, refreshes
  it after review, cleanup, and import workflows, and passes it through
  `App`, `Workspace`, `InsightPanel`, and `RelationshipReview`.
- The review panel renders a compact SLA trend view with a 30-day window, SLA
  threshold, overdue count, oldest pending age, decision trend, evidence
  coverage, and pending aging buckets.
- Review audit JSON exports include the backend analytics payload for handoff
  and operations review.
- P7-B persists daily review analytics snapshots by project, date, and window
  when trend data is requested.
- `GET /api/projects/{project_id}/review-analytics/trend?window=30d&days=14`
  returns persisted snapshot sequences for compact historical review trends.
- The frontend refreshes review analytics trend data after legacy bootstrap,
  review actions, cleanup, and import refreshes, then renders snapshot count,
  overdue movement, and evidence coverage movement in the SLA trend panel.
- P7-5 renders persisted SLA trend snapshots as compact rows with snapshot
  date, overdue count, oldest pending age, and evidence coverage meters, while
  keeping richer reporting out of scope.
- P7-C hydrates `review_analytics_trend` through workspace snapshot and delta
  responses, so first load and incremental refresh can show persisted trend
  context without an extra legacy-only request.
- Review audit JSON exports include `reviewAnalyticsTrend` beside current
  analytics, preserving historical movement for handoff.
- Review audit JSON exports also include `reviewAnalyticsTrendSummary`, a
  derived first/latest snapshot comparison with overdue, oldest-pending, and
  evidence-coverage deltas for readable handoff reports.
- Review audit JSON exports include fixed trend-range context with selected
  trend days, backend analytics window, snapshot count, and first/latest
  snapshot dates beside raw trend payloads and summaries.
- The SLA trend panel can request backend-supported fixed trend windows of 7,
  14, 30, or 90 days. The selected window is preserved across review, cleanup,
  import, sample, batch/URL import, and retry refresh paths.
- Project data reset clears current analytics, trend snapshots, snapshot
  governance summary, and cleanup events together so stale SLA reporting data
  cannot survive a reset.
- Relationship review supports local-first reviewer attribution through an
  optional reviewer label on review decisions, persisted `reviewed_by` values,
  suggestion API responses, and JSON audit exports.
- P7-D adds explicit snapshot governance with
  `GET /api/projects/{project_id}/review-analytics/snapshots` and
  `POST /api/projects/{project_id}/review-analytics/snapshots/cleanup`.
- Workspace snapshot and delta responses include
  `review_analytics_snapshot_summary`, and the frontend hydrates it through
  `reviewAnalyticsSnapshotSummary`.
- The SLA trend panel now shows snapshot count, expired snapshot count, the
  active retention window, and a manual cleanup action for expired snapshots.
- Snapshot retention stays local-first and explicit: no background scheduler is
  introduced, and accepted retention windows are limited to 30, 90, 180, and
  365 days.

### P8 Review Analytics Governance UX

- P8-A parameterizes snapshot cleanup retention in the frontend API client and
  review action flow while preserving the backend whitelist contract.
- The relationship review SLA panel lets operators choose 30, 90, 180, or 365
  day retention before cleanup.
- Cleanup actions now produce accessible success feedback and a compact
  browser-local cleanup history with retention days, expired snapshot count,
  total snapshot count, and cleanup timestamp.
- P8-B persists manual cleanup audit events in
  `review_analytics_snapshot_cleanup_audits` and exposes them through
  `GET /api/projects/{project_id}/review-analytics/snapshots/cleanup-events`.
- Snapshot cleanup records retention days, cutoff date, removed snapshot count,
  remaining snapshot count, and created time in the same transaction as
  snapshot deletion.
- Workspace snapshot and delta responses include
  `review_analytics_snapshot_cleanup_events`, and workspace version signatures
  include cleanup audit rows so incremental refreshes pick up new cleanup
  events.
- The SLA trend panel now prefers backend cleanup history and falls back to the
  P8-A browser-local history when no backend event exists.
- P8-C adds project-level review analytics governance settings:
  `review_analytics.retention_days` and
  `review_analytics.auto_cleanup_enabled`.
- Snapshot summary and manual cleanup defaults now read the project retention
  window when no explicit retention value is supplied.
- When request-time auto cleanup is enabled, review analytics trend hydration
  removes expired snapshots and records the same cleanup audit event as manual
  cleanup.
- Frontend settings hydration normalizes older workspace snapshots and legacy
  settings payloads so missing `review_analytics` values safely fall back to
  the 30 day, no-auto-cleanup default.
- The settings dialog explains that automatic snapshot cleanup is request-time:
  enabled projects clean expired snapshots on the next trend load/refresh, while
  disabled projects can still use manual cleanup from the SLA trend panel.
- P8-E extracts review analytics snapshot retention cleanup into a reusable
  backend maintenance service and adds the
  `graphmind-review-analytics-maintenance` command for cron, container jobs, or
  platform schedulers.
- The maintenance command supports workspace selection, project filtering,
  retention override, and dry-run reporting while sharing the same cleanup audit
  behavior used by API manual cleanup and request-time cleanup.
- Review audit JSON exports include snapshot governance context with retention,
  snapshot counts, expired counts, oldest/latest snapshot dates, and the latest
  backend cleanup audit event when loaded.
- `deploy/graphmind-ops.py review-analytics-maintenance` wraps the shared
  maintenance service for private deployments with JSON output, dry-run,
  project filtering, retention override, env-file workspace loading, explicit
  workspace-root override, and JSON failures for missing or unreadable
  workspace configuration.
- P8 remains local-first and operator-driven. Built-in hosted scheduling,
  distributed job orchestration, named-user reviewer ownership, and
  organization-level audit logs remain future work.
- P5-9 adds graph-quality-to-review shortcuts for pending relationships and
  duplicate governance, so quality signals can open the existing review queues
  without a separate navigation path.
- P5-10 adds a graph quality duplicate cleanup action that reuses the existing
  governed duplicate cleanup handler when duplicate groups are visible.
- P5-11 adds entity-match and documented-mapping quality preview rows that
  focus the related graph node for inspection while leaving accept/reject
  decisions in the existing source inspector controls.
- P5-12 wraps frontend Vitest runs with a project-local Node localStorage file
  so test output stays warning-free on Node 25 while preserving targeted test
  arguments.
- P5-13 adds non-duplicate graph quality bulk remediation guardrails for
  isolated nodes, weak-evidence relationships, entity matches, and mapping
  reviews. These surfaces make readiness and manual-review requirements
  explicit while keeping bulk mutation locked.
- P5-14 adds a safe project preset export from AI/vector settings. The preset
  captures reusable model, vector, and review-governance defaults without API
  keys; automatic template application or overwriting saved settings remains a
  future governed workflow.
- P5-15 adds guarded project preset import: valid preset JSON renders a preview
  and can apply reusable settings to the dialog draft while preserving API keys
  and requiring an explicit save.
- P5-16 adds template-level preset recommendations in the first-graph template
  guidance panel. Recommendations are explanatory only and do not apply, save,
  or overwrite AI/vector settings.

### P9 Searchable Guided Repair Help

- The import workbench includes a local searchable help and repair panel for
  failed imports, URL safety, first-graph templates/project presets, and graph
  quality governance without adding a backend documentation service.
- Help topics can route operators into existing safe workflows, including
  failed-import focus and pending-review queues, while keeping remediation
  explicit and manual.
- URL safety help can focus the existing URL field for correction without
  submitting imports, bypassing URL checks, or changing allowlist/settings state.
- First-graph/preset help can open the existing AI/vector settings dialog from
  data intake without applying presets, saving settings, or replacing API keys.

### P10 Release Verification Hardening

- ChatPanel duplicate React key warnings are closed with a regression covering
  repeated citations, repeated retrieved evidence, and repeated next steps.
- The layout audit now treats named UI states as required browser state, so
  `data-dialog` must expose a visible `.data-actions-dialog` target and failures
  are reported as `missingStateTarget` instead of silently capturing the wrong
  screen.
- The layout audit captures dialog screenshots before keyboard Escape checks can
  close the dialog, keeping `data-dialog` screenshots aligned with their state
  names.
- Productization CI now runs release-critical backend checks as named steps:
  URL import safety, deployment security, auth/session/sharing, hosted import
  worker mode, review analytics maintenance, and TLS ingress static checks.
- A dedicated `deployment-gates` job runs deployment preflight, renders the
  private-server Compose profile and TLS Compose profile, uploads
  `tmp-deployment-gates`, and keeps those artifacts available for release
  review.
- `Verify deployment gate artifacts` checks that preflight JSON reports
  `status: "ready"`, the private-server Compose artifact contains `backend`,
  `frontend`, and `worker`, and the TLS artifact also contains `caddy`.

### P11 Professional Engineering Baseline

- The next quality slice is coverage, OpenAPI contract, E2E smoke, architecture budget, observability, and artifact hygiene. These gates do not change product behavior; they make drift visible before it becomes a release problem.
- Backend coverage now reports `graphmind` line coverage with a 70% floor.
- The OpenAPI contract snapshot keeps the public API shape reviewable as a
  checked-in artifact.
- Frontend source lint and architecture audit keep the large workbench and CSS
  surfaces from growing without review.
- Browser smoke validation exercises search, command palette, data intake, and
  AI settings against a running backend before release.
- Artifact hygiene separates transient build outputs from product source and
  gives release reviewers a predictable cleanup command.

## Ownership Model

| Area | Owner Role | Responsibilities |
| --- | --- | --- |
| Product UX | Product/design owner | Workflow priority, empty states, recovery copy, onboarding, and user-facing acceptance criteria. |
| Frontend platform | Frontend owner | Workbench composition, GSAP motion, responsive layout, accessibility, command flows, and frontend quality gates. |
| Backend platform | Backend owner | API contracts, router boundaries, job/event infrastructure, workspace versioning, URL safety, and service tests. |
| Knowledge graph quality | Data/graph owner | Import parsing, relationship scoring, evidence refs, review priority, graph filtering, and source diagnostics. |
| Release quality | QA/release owner | CI gate wiring, audit artifacts, regression review, release checklist, and verification sign-off. |

## Verification Gates

Run these from the repo root unless a command says otherwise.

| Gate | Command | Owner Role |
| --- | --- | --- |
| Backend behavior | `cd backend && . .venv/bin/activate && pytest -q` | Backend owner |
| Backend lint | `cd backend && . .venv/bin/activate && ruff check graphmind tests` | Backend owner |
| URL import security | `cd backend && . .venv/bin/activate && pytest tests/test_url_import_phase_60.py -q` | Backend owner |
| Deployment security | `cd backend && . .venv/bin/activate && pytest tests/test_deployment_security_phase_p4.py -q` | Backend owner |
| Auth and sharing | `cd backend && . .venv/bin/activate && pytest tests/test_auth_guardrails_phase_p4.py -q` | Backend owner |
| Hosted import worker | `cd backend && . .venv/bin/activate && pytest tests/test_import_worker_mode_phase_p4.py -q` | Backend owner |
| TLS ingress static checks | `cd backend && . .venv/bin/activate && pytest tests/test_tls_ingress_phase_p4.py -q` | Backend owner |
| Frontend behavior | `cd frontend && npm test` | Frontend owner |
| Frontend type check | `cd frontend && npm run lint` | Frontend owner |
| Frontend production build | `cd frontend && npm run build` | Frontend owner |
| Layout regression | `cd frontend && npm run audit:layout` | Frontend owner and QA/release owner |
| Quality budgets | `cd frontend && npm run audit:quality` | Frontend owner and QA/release owner |

Targeted checks for focused work:

- Motion and dialog changes: `cd frontend && npm test -- motionSystem.test.js useDialogFocusTrap.test.tsx CommandPalette.test.tsx`
- Compact mobile layout changes: `cd frontend && npm test -- mobileLayoutCss.test.js graphStyles.test.js`
- Workspace bootstrap changes: `cd frontend && npm test -- workspaceStore.test.ts useWorkspaceBootstrap.test.tsx useImportActions.test.tsx`
- Import API changes: `cd backend && . .venv/bin/activate && pytest tests/test_api.py tests/test_url_import_phase_60.py -q`
- Review analytics changes: `cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_workspace_snapshot_endpoint_returns_first_load_payload tests/test_api.py::test_review_analytics_endpoint_reports_sla_trends_and_project_scope tests/test_api.py::test_review_analytics_endpoint_returns_404_for_missing_project tests/test_api.py::test_review_analytics_trend_endpoint_persists_today_and_returns_snapshots tests/test_api.py::test_review_analytics_trend_endpoint_returns_404_for_missing_project tests/test_api.py::test_review_analytics_snapshot_summary_and_cleanup tests/test_api.py::test_review_analytics_snapshot_summary_returns_404_for_missing_project tests/test_storage.py::test_initialize_database_creates_review_analytics_snapshot_table -q`; `cd frontend && npm test -- reviewOps.test.ts RelationshipReview.test.tsx InsightPanel.test.tsx Workspace.test.tsx workspaceStore.test.ts apiClientImportBatch.test.ts useReviewActions.test.tsx useWorkspaceBootstrap.test.tsx --run`

## Definition Of Done

- Behavior changes start with a failing regression or acceptance test.
- Backend public API changes preserve the unified error contract or document the
  migration path.
- Frontend UI changes preserve keyboard access, focus restoration, reduced-motion
  handling, and responsive containment.
- Any import feature records diagnostics and keeps evidence refs navigable.
- Layout-sensitive changes pass `npm run audit:layout`.
- Performance-sensitive frontend changes pass `npm run audit:quality` and do not
  hide bundle growth behind unreviewed dependencies.
- Tracker and roadmap are updated when product scope, ownership, or gates change.

## Deferred Productization Roadmap

These items are intentionally outside the completed P0/P1/P2/P3/P4/P5/P6/P7/P8/P9/P10
implementation tracks. They are the recommended next increments, not current
gaps.

### P3 Release And CI Hardening

- Completed P3 CI gates wire backend tests/lint, frontend tests/type check,
  production build, layout audit, and quality audit into GitHub Actions.
- Completed P3 CI artifacts persist layout audit output and frontend build
  output for release review and failed-run debugging.
- Completed P3 release checklist entries cover browser smoke testing, import
  smoke testing, URL import safety review, deployment preflight, and artifact
  review.
- Completed P3 dependency review gate runs on pull requests and flags high-risk
  dependency changes, with explicit release attention for frontend animation,
  3D, and import-related packages.
- Completed P10 release verification hardening keeps CI and release evidence
  aligned by naming release-critical backend checks, validating deployment gate
  artifacts, and documenting local Docker limitations separately from GitHub
  runner Compose validation.

### P3 Import Governance

- URL host allowlist/denylist, process-local URL import quotas, production
  readiness checks, and parser-based static HTML extraction are complete for
  local/private deployments.
- Add shared rate limits, per-project URL import quotas, or gateway-level
  controls if the API becomes shared or hosted across multiple instances.
- Consider a richer HTML/readability extractor only when real-world pages exceed
  the current dependency-free parser quality.
- Keep recursive crawling, authenticated connectors, dynamic browser rendering,
  and custom request headers as explicit connector projects with separate threat
  models.

### P5 User Onboarding And Recovery

- Extend the completed import recovery help surface with searchable docs or
  guided repair flows only after repeated real-world failures show the need.
- Completed P9-A adds a local searchable `Help and repair` panel to the import
  workbench for failed imports, URL safety checks, first-graph templates/project
  presets, and graph quality governance. Future help work should focus on
  deeper guided automation only after real usage shows repeatable repair paths.
- Completed P9-B adds action buttons from help topics into existing safe
  workflows, such as failed import focus and pending relationship review,
  without introducing automatic mutation or bulk remediation.
- Completed P9-C adds a URL safety help action that focuses the existing URL
  input for repair while preserving the same URL safety checks and manual submit
  flow.
- Completed P9-D adds a first-graph/project preset help action that opens the
  existing AI and vector settings dialog without applying presets or saving
  settings.
- Keep automatic preset application from first-graph templates as future
  governed work unless teams prove that template-selected settings are safe to
  apply without surprising users or replacing secrets.

### P5 Graph Quality And Review Operations

- Completed P5: review operations summary, saved review filters, and
  exportable JSON review/audit reports.
- Completed P5 onboarding: first-graph templates, source-specific template
  next steps, graph empty-state source guide, and low-confidence relationship
  recovery playbook.
- Completed P5 recovery: structured import API errors render recovery action,
  field-level issues, error code, and stale-metadata cleanup in import tasks.
- Completed P5 graph quality extension: graph quality operations now include
  unresolved entity-match and documented-mapping review counts backed by current
  workspace review state.
- Completed P5 import health extension: persisted import jobs carry `updated_at`
  into frontend state, and import health counts queued/running jobs as stuck
  after the backend recovery threshold of 30 minutes without an update.
- Completed P5 graph quality guidance: quality filters now show focused
  next-step guidance for isolated nodes, weak-evidence relationships, pending
  reviews, duplicates, entity matches, and mapping reviews.
- Completed P5 graph quality preview lists: isolated-node and weak-evidence
  filters now expose compact node/relationship examples from the current graph.
- Completed P5 graph quality selection linking: preview rows select the matching
  node or relationship and return reviewers to the evidence tab.
- Completed P5 graph quality bulk-remediation guardrails: non-duplicate quality
  slices show readiness guidance and a disabled bulk action until real review
  workflows justify governed batch execution.
- Completed P5 project preset export: AI/vector settings can export a reusable
  preset JSON without API keys, giving teams a safe handoff artifact before
  preset import/apply workflows exist.
- Completed P5 project preset import preview: valid preset JSON can be previewed
  and applied to the settings draft without saving or replacing API keys.
- Completed P5 template preset recommendations: first-graph template guidance
  now suggests source-appropriate project preset posture while keeping settings
  unchanged until users explicitly use the settings dialog.
- Completed P9-A: the import workbench includes a local searchable help and
  repair panel for failed imports, URL safety, first-graph presets, and quality
  governance without adding a backend docs service.
- Completed P9-B: searchable help topics can route operators into existing
  failed-import and pending-review workflows while keeping remediation manual.
- Completed P9-C: URL safety help focuses the URL input for repair without
  submitting imports or changing allowlist/settings state.
- Completed P9-D: first-graph/preset help opens the existing AI/vector settings
  dialog and preserves explicit user-controlled preset import/apply/save steps.
- Completed P6-A: durable relationship suggestion timestamps, API exposure,
  first-pass overdue pending metrics, oldest pending age, and timestamped review
  audit exports.
- Completed P7-A: backend-owned review analytics API, workspace analytics
  hydration, SLA trend view, aging buckets, decision distribution, evidence
  coverage, and analytics-backed review audit exports.
- Completed P7-B: persisted daily analytics snapshots, trend API, trend state
  refresh, and compact historical movement indicators in the SLA panel.
- Completed P7-C: workspace snapshot/delta trend hydration and trend-aware
  review audit exports.
- Completed P7-D: snapshot governance summary/cleanup APIs, workspace hydration,
  and manual cleanup action.
- Completed P7-E: compact SLA trend snapshot chart backed by persisted trend
  data.
- Completed P7-I: review audit JSON exports include fixed trend-range context
  with selected trend days, analytics window, snapshot count, and first/latest
  snapshot dates beside the raw trend payload and delta summary.
- Completed P7-F: review audit JSON exports include a readable trend summary
  derived from persisted snapshots, while raw trend data remains available for
  downstream tooling.
- Completed P7-G: operators can select backend-supported 7/14/30/90 day SLA
  trend windows in the frontend, and refresh/reset paths preserve or clear that
  reporting state correctly.
- Completed P7-H: local-first reviewer attribution records an optional reviewer
  label on relationship decisions and includes it in suggestion payloads and
  audit exports.
- Completed P8-A: cleanup retention selector, cleanup success feedback, and
  browser-local cleanup history.
- Completed P8-D: settings copy clarifies request-time cleanup versus manual
  cleanup, reducing operations ambiguity without adding a scheduler.
- Completed P8-E: review analytics snapshot cleanup is available as a reusable
  backend service and operator-run maintenance command for external scheduling.
- Completed P8-F: review audit JSON exports include snapshot governance context
  with retention, snapshot counts, expired counts, first/latest snapshot dates,
  and latest backend cleanup audit event.
- Completed P8-G: `deploy/graphmind-ops.py review-analytics-maintenance`
  provides a JSON-emitting private-deployment wrapper around the shared snapshot
  maintenance service.
- Completed P8-H: the deployment ops maintenance command can read
  `GRAPHMIND_WORKSPACE_ROOT` from an env file while preserving explicit
  `--workspace-root` override behavior.
- Completed P8-I: deployment ops maintenance returns machine-readable JSON
  failures when workspace configuration is missing or the env file cannot be
  read, so release automation can parse configuration problems consistently.
- Add richer time-series aggregation only when historical reporting must compare
  arbitrary custom date ranges, multiple windows side by side, or exported
  reporting periods beyond the fixed 7/14/30/90 day selector.
- Add named-user identity, SSO-backed reviewer attribution, and multi-user SLA
  ownership only after hosted tenancy becomes part of the product scope.
- Add managed recurring retention jobs only when hosted/multi-instance
  deployments need centralized scheduling beyond the P8-E operator-run command.
- Add richer time-series charting only when teams need custom ranges, multiple
  windows, or exported reporting periods beyond the compact persisted snapshot
  chart.
- Extend graph quality dashboards with non-duplicate bulk execution only after
  the current readiness guards show which slices have repeatable, safe batch
  decisions in real review workflows.

### P5 Hosted Scale-Out Pre-Research

- Keep named users, SSO, organization tenancy, organization-level audit logs,
  distributed rate limiting, and managed queues as explicit hosted scale-out
  projects.
- Revisit Redis/RQ, Celery, or managed queue adoption only after the P4 external
  SQLite-backed worker is insufficient for private team deployments.

### Superseded Deferred Items

The following earlier P3/P4 deferred entries are preserved for history but have
been narrowed by completed P4, P5, and P6 work:

- Add review workload metrics: aging suggestions, duplicate groups, accepted vs.
  rejected trend, and evidence coverage. P5/P6/P7 now cover current workload,
  duplicates, evidence coverage, overdue pending counts, oldest pending age,
  backend-owned status trend aggregates, SLA aging buckets, persisted daily
  snapshot sequences, and compact snapshot trend charts; richer reporting
  remains future work.
- Add saved review filters for analyst workflows.
- Add graph quality dashboards that summarize disconnected components, weak
  evidence, stale imports, and unresolved entity matches. P5-4/P5-5 now cover
  unresolved entity/mapping reviews and stale import health counts; P5-6 adds
  action guidance for disconnected and weak-evidence slices. P5-7 adds compact
  node/edge preview lists, and P5-8 links those previews to graph evidence
  selection. P5-9 routes pending and duplicate quality slices into the existing
  review queues, and P5-10 exposes governed duplicate cleanup from the quality
  panel. P5-11 adds entity/mapping review previews that focus graph evidence
  without moving review decisions out of the source inspector. P5-13 adds
  readiness guards and keeps non-duplicate bulk mutation locked; future work is
  governed batch execution only after real workflows justify it.
- Add exportable review/audit reports for handoff to non-technical stakeholders.

## Self-Review

- Completed P0, P1, P2, P3, P4, P5, P6, P7, P8, P9, and P10 scope is summarized above.
- Deferred items are separated from the completed implementation track.
- Verification commands cover backend, frontend, layout, quality, build, and URL
  import security.
- Ownership is role-based so it remains usable before formal team assignment.
