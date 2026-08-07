# GraphMind Productization Acceptance Plan

Last updated: 2026-06-13

This plan verifies that the completed P0/P1/P2/P3/P4/P5/P6/P7/P8/P9/P10
productization implementation has no obvious omissions, unverified scope, or
unresolved release risks.

## Acceptance Scope

- P0 stabilization items in `docs/productization-implementation-tracker.md`.
- P1 product experience items in `docs/productization-implementation-tracker.md`.
- P2 operational hardening items in `docs/productization-implementation-tracker.md`.
- P3 release/governance items in `docs/productization-p3-implementation-tracker.md`.
- P4 deployment/security/ops items in `docs/productization-p4-implementation-tracker.md`.
- P5 review operations and quality command center items in
  `docs/productization-implementation-tracker.md`.
- P5 user onboarding and import recovery help surface items in
  `docs/productization-implementation-tracker.md`.
- P6 review analytics timestamp items in
  `docs/productization-implementation-tracker.md`.
- P7 review analytics backend and SLA trend view items in
  `docs/productization-implementation-tracker.md`.
- P7-D review analytics snapshot governance items in
  `docs/productization-implementation-tracker.md`.
- P8-A review analytics governance UX items in
  `docs/productization-implementation-tracker.md`.
- P8 deployment ops review analytics maintenance items in
  `docs/productization-implementation-tracker.md`.
- P9 searchable guided repair help items in
  `docs/productization-implementation-tracker.md`.
- P10 release verification hardening items in
  `.github/workflows/productization-gates.yml`,
  `frontend/tests/releaseGates.test.js`,
  `frontend/tests/ChatPanel.test.tsx`,
  `frontend/tests/layoutAuditScript.test.js`, and
  `docs/productization-roadmap.md`.
- Productization ownership, deferred roadmap, and verification gates in
  `docs/productization-roadmap.md`.
- Backend and frontend quality gates that prove the current workspace state.

Out of scope:

- Implementing deferred hosted scale-out projects: named users, SSO,
  organization tenancy, organization-level audit logs, distributed rate
  limiting, and managed queues.
- Implementing named-user reviewer identity, multi-user SLA ownership,
  arbitrary custom trend date ranges, multi-window comparison, or richer
  exported charting beyond the completed local-first SLA trend surfaces.
- Implementing hosted managed snapshot retention schedulers beyond P8-E's
  operator-run maintenance command.
- Implementing hosted user/reviewer identity or organization-level audit logs
  beyond P8-C project-level review analytics governance settings.
- Adding new product features beyond the completed P0-P10 list.

## Acceptance Criteria

| ID | Area | Acceptance Check | Evidence |
| --- | --- | --- | --- |
| AC-01 | Scope completeness | Every P0/P1/P2/P5/P6 tracker item and every P3/P4 tracker item is `Status: Done`; no active `Not started`, `In progress`, or `Verifying` item remains. | Passed: P6 tracker is `Status: Done`; P3/P4 trackers have no active status matches. |
| AC-02 | Roadmap completeness | Roadmap documents completed items, deferred items, ownership roles, verification gates, and definition of done. | Passed: required roadmap headings are present. |
| AC-03 | Placeholder scan | Current tracker/roadmap/core implementation has no unresolved placeholder keywords that affect this acceptance scope. | Passed: no matches in tracker, roadmap, backend app, frontend src, or tests. |
| AC-04 | URL import security | URL import rejects unsafe schemes, credentials, private networks, unsafe redirects, oversized responses, unsupported content types, and uses timeout. | Passed: `pytest tests/test_url_import_phase_60.py -q` reported 15 passed. |
| AC-05 | Backend behavior | Backend full test suite passes. | Passed: `pytest -q` reported 241 passed. |
| AC-06 | Backend lint | Backend ruff check passes for app and tests. | Passed: `ruff check graphmind tests` reported all checks passed. |
| AC-07 | Frontend behavior | Frontend full test suite passes. | Passed: `npm test` reported 44 files and 332 tests passed. |
| AC-08 | Frontend type/build | TypeScript check and production build pass. | Passed: `npm run lint` and `npm run build` exited 0; production build no longer emits the large chunk warning. |
| AC-09 | Layout quality | Automated layout audit passes across the configured viewport/state matrix without browser console warnings/errors. | Passed: `npm run audit:layout` reported 60 viewport/state checks; summary has `problemCount: 0`, `consoleIssueCount: 0`, and `unexpectedConsoleIssueCount: 0`. |
| AC-10 | Quality budget | Automated quality audit passes current budgets. | Passed: `npm run audit:quality` reported quality audit passed. |
| AC-11 | Residual risk review | Remaining risks are documented as deferred roadmap items, not hidden blockers. | Passed: previous build chunk and React Flow layout-audit warning risks are closed; remaining items are future roadmap scope. |
| AC-12 | P5 review operations | Review operations summary, saved review filters, and JSON audit report are covered by frontend tests. | Passed: `npm test -- reviewOps.test.ts RelationshipReview.test.tsx InsightPanel.test.tsx i18n.test.tsx --run` reported 4 files and 28 tests passed. |
| AC-13 | P5 future boundary | Remaining onboarding, performance, and hosted scale-out follow-ups are documented without being confused with completed P5 scope. | Passed: roadmap separates completed P5 review ops, first-graph template guidance, graph empty states, low-confidence recovery, import recovery help, project preset handoff, and template preset recommendations from future guided docs, governed automatic preset application, performance discipline, and hosted scale-out pre-research. |
| AC-14 | P6 review analytics timestamps | Relationship suggestions persist and expose timestamps; review aging metrics and timestamped audit exports are covered by targeted tests. | Passed: backend targeted tests reported 11 passed; frontend targeted review tests reported 2 files and 24 tests passed. |
| AC-15 | P7 review analytics backend | Backend review analytics endpoint, snapshot hydration, workspace version invalidation, frontend state refresh, SLA trend view, and audit export analytics are covered by targeted tests. | Passed: P7 backend targeted tests reported 3 passed; frontend targeted UI/export tests reported 3 files and 30 tests passed; frontend state/workspace targeted tests reported 8 files and 101 tests passed. |
| AC-16 | P7 future boundary | Persisted time-series snapshots, named-user reviewer identity, multi-user SLA ownership, and richer charting are documented as future work beyond the completed P7-A aggregate view. | Passed: roadmap separates completed P7-A backend aggregate analytics from future persisted time-series, named-user reviewer identity, multi-user SLA ownership, and richer charting. |
| AC-17 | P7-B analytics snapshots | Daily analytics snapshots persist by project/date/window, trend endpoint returns persisted snapshots, and frontend SLA panel renders historical movement. | Passed: P7-B backend targeted tests reported 6 passed; frontend targeted tests reported 8 files and 52 tests passed; full backend/frontend gates passed. |
| AC-18 | P7-B future boundary | Richer time-series reporting, custom ranges, named-user reviewer identity, and multi-user SLA ownership remain documented future scope beyond P7-B. | Passed: roadmap separates completed P7-B daily snapshots and compact movement indicators from richer reporting, custom ranges, named-user reviewer identity, and multi-user SLA ownership. |
| AC-19 | P7-C trend hydration | Workspace snapshot/delta include review analytics trend data, frontend hydrates trend state from snapshot/delta, and review audit export includes trend payload. | Passed: P7-C backend targeted tests reported 4 passed; frontend targeted tests reported 9 files and 58 tests passed; full backend/frontend gates passed. |
| AC-20 | P7-C future boundary | Richer export formats, arbitrary custom trend date ranges, named-user reviewer identity, and multi-user SLA ownership remain documented future scope beyond P7-C. | Passed: roadmap separates completed P7-C snapshot/delta hydration and trend-aware audit export from richer export formats, arbitrary custom date ranges, named-user reviewer identity, and multi-user SLA ownership. |
| AC-21 | P7-D snapshot governance | Snapshot summary/cleanup endpoints, workspace hydration, frontend cleanup action, and refresh paths are covered by targeted tests. | Passed: targeted backend tests reported 3 passed; targeted frontend tests reported 7 files and 100 tests passed; full backend/frontend gates passed. |
| AC-22 | P7-D future boundary | Automated retention schedulers, per-project retention settings, named-user reviewer identity, and multi-user SLA ownership remain documented future scope beyond P7-D. | Passed: roadmap separates completed manual snapshot governance from scheduled retention and hosted/multi-user reporting scope. |
| AC-23 | P8-A governance UX | Retention selection, cleanup result feedback, local cleanup history, API parameterization, and prop pass-through are covered by targeted frontend tests. | Passed: targeted frontend tests reported 5 files and 95 tests passed; targeted backend compatibility tests reported 2 passed; full backend/frontend gates passed. |
| AC-24 | P8-A future boundary | Backend cleanup audit logs, shared cleanup history, scheduled cleanup, and persisted per-project retention defaults were documented beyond P8-A before P8-B selected the cleanup-audit slice for implementation. | Passed: roadmap now records P8-A frontend-local governance UX and P8-B backend cleanup audit as separate increments. |
| AC-25 | P8-B cleanup audit | Cleanup events persist on the backend, list through an API, hydrate through workspace snapshot/delta, refresh through review/import paths, and render before local fallback history. | Passed: targeted backend tests reported 3 passed; targeted frontend API/state/UI tests reported 5 files and 50 tests passed; workspace-version regression check reported 4 passed; full backend tests reported 250 passed; full frontend tests reported 44 files and 344 tests passed; lint/build/quality/layout gates passed. |
| AC-26 | P8-B future boundary | Scheduled cleanup, hosted user/reviewer identity, organization-level audit logs, and per-project retention defaults were documented beyond P8-B before P8-C selected the retention-default slice for implementation. | Passed: roadmap now records P8-B cleanup audit and P8-C retention defaults as separate increments. |
| AC-27 | P8-C retention defaults | Project settings persist review analytics retention defaults and request-time cleanup; snapshot summary/cleanup/trend hydration use those settings; frontend settings UX saves them. | Passed: targeted backend tests reported 6 passed; targeted frontend settings/API tests reported 3 files and 58 tests passed; legacy settings compatibility tests reported 2 files and 17 tests passed; layout-audit exit-path test reported 1 file and 4 tests passed; full backend tests reported 254 passed; full frontend tests reported 44 files and 349 tests passed; lint/build/layout/quality gates passed. |
| AC-28 | P8-C future boundary | Background cron/scheduler infrastructure, hosted user/reviewer identity, and organization-level audit logs remain documented future scope beyond P8-C. | Passed: roadmap separates completed project-level retention defaults and request-time cleanup from background scheduling and hosted audit systems. |
| AC-29 | P5 import recovery help | Failed import tasks preserve structured API recovery details and render recovery action, field-level issues, and error code without carrying stale metadata across retry/success transitions. | Passed: targeted frontend tests reported 2 files and 8 tests passed; related import/API/frontend state regression tests reported 4 files and 77 tests passed; full frontend tests reported 44 files and 351 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-30 | P5 first graph template guidance | Spreadsheet, document, code repository, and URL templates show source-specific next steps and trigger the matching import action without breaking graph empty states or low-confidence recovery guidance. | Passed: template targeted test reported 1 file and 8 tests passed; related onboarding/recovery UI tests reported 4 files and 100 tests passed; full frontend tests reported 44 files and 352 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-31 | P5 graph quality entity resolution metrics | Graph quality operations include unresolved entity-match and documented-mapping review counts from current workspace state and expose local filter options. | Passed: targeted frontend quality/state tests reported 4 files and 66 tests passed; full frontend tests reported 44 files and 352 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-32 | P3 URL import governance and HTML extraction | URL import governance remains covered by allowlist/denylist/quota tests, and static HTML extraction removes page chrome while preserving main/article content without new dependencies. | Passed: backend URL import tests reported 16 passed; backend ruff targeted check reported all checks passed. |
| AC-33 | P5 stale import health metrics | Persisted import jobs carry backend `updated_at` into frontend state, queued/running jobs older than the backend recovery threshold surface as stuck import health metrics, and URL import jobs preserve their task kind. | Passed: targeted frontend import health/builder tests reported 3 files and 15 tests passed; related import panel/bootstrap/i18n/state regression tests reported 5 files and 64 tests passed; full frontend tests reported 44 files and 354 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-34 | P3 dependency review gate | Productization CI includes a PR-only dependency review job and the release checklist requires explicit review for frontend animation, 3D, and import-related package changes. | Passed: release gate test reported 1 file and 2 tests passed; Ruby YAML parsing confirmed the workflow contains the dependency review job. |
| AC-35 | P5 graph quality drilldown guidance | Graph quality filter choices surface focused next-step guidance, including disconnected node and weak-evidence relationship remediation counts, while preserving local filter persistence. | Passed: targeted frontend quality guidance and i18n tests reported 2 files and 8 tests passed; full frontend tests reported 44 files and 354 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-36 | P5 graph quality preview lists | Graph quality summary exposes compact isolated-node and weak-evidence relationship previews, and the review quality panel renders those examples for the matching filters. | Passed: targeted frontend stats/UI tests reported 2 files and 12 tests passed; full frontend tests reported 44 files and 354 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-37 | P5 graph quality selection linking | Isolated-node and weak-evidence preview rows are actionable and select the matching graph node or relationship while returning reviewers to evidence detail. | Passed: targeted frontend workspace/UI tests reported 2 files and 55 tests passed; full frontend tests reported 44 files and 356 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-38 | P5 graph quality review shortcuts | Pending and duplicate quality filters expose direct actions that open the existing relationship review queues with shortcut focus and governance-backed filtering. | Passed: targeted frontend workspace/UI tests reported 2 files and 57 tests passed; full frontend tests reported 44 files and 358 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-39 | P5 graph quality duplicate cleanup | Duplicate quality filters expose a governed cleanup action that reuses the existing duplicate cleanup handler and stays disabled when no duplicate groups exist. | Passed: targeted frontend workspace/UI tests reported 2 files and 59 tests passed; full frontend tests reported 44 files and 360 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-40 | P5 entity and mapping quality previews | Entity-match and documented-mapping quality filters expose compact preview rows that focus the related graph node without moving accept/reject decisions out of the source inspector. | Passed: targeted frontend stats/workspace/UI tests reported 3 files and 68 tests passed; full frontend tests reported 44 files and 362 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-41 | Frontend test output hygiene | Frontend Vitest runs provide a valid Node localStorage file path so full and targeted test output remains free of the Node 25 localStorage warning. | Passed: targeted frontend tests reported 3 files and 68 tests passed without the warning; full frontend tests reported 44 files and 362 tests passed without the warning; frontend type check/build/layout/quality gates exited 0. |
| AC-42 | P5 non-duplicate graph quality guardrails | Isolated, weak-evidence, entity-match, and mapping-review quality filters expose remediation readiness guidance and a disabled bulk action instead of wiring irreversible batch mutations. | Passed: targeted frontend workspace/UI tests reported 2 files and 63 tests passed; full frontend tests reported 44 files and 364 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-43 | P5 project preset export | AI/vector settings expose a non-mutating project preset export that includes reusable model/vector/review-governance defaults and excludes API keys/secrets. | Passed: targeted frontend settings/App tests reported 2 files and 31 tests passed; full frontend tests reported 45 files and 366 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-44 | P7 SLA trend snapshot chart | Persisted review analytics trend snapshots render as a compact accessible chart with snapshot date, overdue count, oldest pending age, and evidence coverage without adding new backend scope. | Passed: targeted frontend review analytics test reported 1 file and 23 tests passed; related frontend regression tests reported 5 files and 117 tests passed; full frontend tests reported 45 files and 366 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-45 | P8 cleanup execution mode clarity | Review analytics governance settings explain request-time automatic cleanup and manual cleanup fallback without implying background scheduler infrastructure exists. | Passed: targeted frontend settings/App tests reported 2 files and 32 tests passed; related frontend regression tests reported 5 files and 118 tests passed; full frontend tests reported 45 files and 367 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-46 | P5 project preset import preview | Valid project preset JSON renders a safe preview and applies reusable settings to the unsaved dialog draft while preserving existing API keys; invalid presets do not mutate settings. | Passed: targeted frontend settings/App tests reported 2 files and 33 tests passed; related frontend regression tests reported 5 files and 119 tests passed; full frontend tests reported 45 files and 368 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-47 | P5 template preset recommendations | First-graph template guidance exposes source-appropriate project preset recommendations while making clear that AI/vector settings are not changed automatically. | Passed: targeted template tests reported 1 file and 9 tests passed; related frontend regression tests reported 6 files and 134 tests passed; full frontend tests reported 45 files and 369 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-48 | P7 review audit trend summary export | Review audit JSON exports include a derived trend summary with first/latest snapshot dates and SLA/evidence deltas beside the raw trend payload. | Passed: targeted frontend review export tests reported 2 files and 29 tests passed; related frontend regression tests reported 5 files and 122 tests passed; full frontend tests reported 45 files and 369 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-49 | P4 project share token admin UX | Project sharing UI exposes token lifecycle metadata, one-time token copy, and revoke state while keeping plaintext tokens hidden after creation. | Passed: targeted frontend workspace test reported 1 file and 54 tests passed; related frontend share/API tests reported 2 files and 72 tests passed; full frontend tests reported 45 files and 369 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-50 | P7 review analytics trend window selection | Reviewers can select backend-supported 7/14/30/90 day SLA trend windows; review/import refreshes preserve the selected window, and project reset clears stale analytics trend/governance state. | Passed: targeted frontend tests reported 5 files and 82 tests passed; full frontend tests reported 45 files and 373 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-51 | P7 local-first reviewer attribution | Relationship review decisions can persist an optional reviewer label, return it through suggestion APIs, submit it from the review panel, and include it in JSON audit exports without introducing hosted identity scope. | Passed: targeted backend tests reported 5 passed; targeted backend ruff check passed; targeted frontend tests reported 5 files and 84 tests passed; frontend type check exited 0. |
| AC-52 | P8 review analytics maintenance command | Review analytics snapshot cleanup is reusable outside API routes, can run across all projects or one project, honors project retention defaults or an override, supports dry-run reporting, and preserves cleanup audit behavior for applied runs. | Passed: targeted backend maintenance/API regression tests reported 8 passed; URL import safety regression tests reported 16 passed; full backend tests reported 263 passed; backend ruff reported all checks passed; CLI help exited 0 and listed the maintenance arguments. |
| AC-53 | P9 searchable guided repair help | The import workbench includes a local searchable help and repair panel with context-aware topics for failed imports, URL safety, first-graph templates/project presets, and quality governance without adding a backend docs service. | Passed: targeted import/help frontend tests reported 3 files and 34 tests passed; i18n targeted tests reported 1 file and 3 tests passed; full frontend tests reported 45 files and 376 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-54 | P9 guided repair actions | Searchable help topics can route operators into existing failed-import and pending-review workflows with distinct accessible names and without automatic mutation or bulk remediation. | Passed: targeted import/help frontend tests reported 3 files and 35 tests passed; i18n targeted tests reported 1 file and 3 tests passed; full frontend tests reported 45 files and 377 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-55 | P9 URL safety help focus | URL safety help can focus the existing URL input for repair while preserving manual submit and existing URL safety checks. | Passed: targeted import/help frontend tests reported 3 files and 36 tests passed; full frontend tests reported 45 files and 378 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-56 | P9 first-graph preset help settings action | First-graph/project preset help can open the existing AI/vector settings dialog from data intake while preserving explicit preset import/apply/save behavior and avoiding hidden settings mutation. | Passed: targeted frontend ImportPanel/Workspace tests reported 2 files and 84 tests passed; full frontend tests reported 45 files and 380 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-57 | P7 review audit trend context export | Review audit JSON exports include fixed trend-range context with selected trend days, analytics window, snapshot count, and first/latest snapshot dates beside raw trend payload and delta summary. | Passed: targeted review export tests reported 2 files and 29 tests passed; full frontend tests reported 45 files and 380 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-58 | P8 review audit snapshot governance context export | Review audit JSON exports include snapshot retention, snapshot counts, expired counts, oldest/latest snapshot dates, and latest cleanup audit event when snapshot governance state is available. | Passed: targeted review export tests reported 2 files and 29 tests passed; full frontend tests reported 45 files and 380 tests passed; frontend type check/build/layout/quality gates exited 0. |
| AC-59 | P8 deployment ops review analytics maintenance | Deployment ops helper exposes a JSON-emitting review analytics maintenance command with dry-run, project filter, retention override, shared cleanup audit behavior, and help output that does not require maintenance-only dependencies. | Passed: targeted backend deployment ops tests reported 8 passed; review analytics maintenance tests reported 5 passed; full backend tests reported 265 passed; backend ruff reported all checks passed; ops helper help exited 0 outside the backend virtualenv. |
| AC-60 | P8 deployment ops maintenance env-file support | Review analytics maintenance can read `GRAPHMIND_WORKSPACE_ROOT` from a deployment env file while preserving explicit workspace-root override and JSON error behavior for missing workspace config. | Passed: targeted backend deployment ops tests reported 10 passed; review analytics maintenance tests reported 5 passed; full backend tests reported 267 passed; backend ruff reported all checks passed; ops helper help listed env-file and maintenance arguments. |
| AC-61 | P8 deployment ops maintenance env-file error handling | Review analytics maintenance returns parseable JSON failures when workspace configuration is missing or the env file cannot be read, preserving automation-friendly failure output. | Passed: targeted backend deployment ops tests reported 13 passed; targeted ops helper ruff check passed. |
| AC-62 | P10 frontend warning closure | ChatPanel duplicate React key warnings are covered for repeated citations, repeated retrieved evidence, and repeated next steps, and layout audit requires the real `data-dialog` state target before accepting screenshots. | Passed: `npm test -- ChatPanel.test.tsx layoutAuditScript.test.js --run` reported 17 passed; `npm run audit:layout` reported 60 viewport/state checks; data-dialog report rows showed visible `.data-actions-dialog` rects with 0 problems. |
| AC-63 | P10 CI release gates | Productization CI names release-critical backend checks and includes deployment preflight, Compose rendering, TLS Compose rendering, deployment artifact upload, `set -o pipefail`, and `Verify deployment gate artifacts`. | Passed: `npm test -- releaseGates.test.js --run` reported 3 passed; Ruby YAML parsing loaded `.github/workflows/productization-gates.yml`; static workflow checks found required backend and deployment gate commands. |
| AC-64 | P10 deployment artifact integrity | Deployment preflight JSON must report ready, private-server Compose artifacts must contain `backend`, `frontend`, and `worker`, and TLS Compose artifacts must also contain `caddy`. | Passed: local preflight JSON generation and simulated Compose artifact verifier exited 0. Docker is unavailable in this local workspace, so real Compose rendering and deployment artifact integrity checks are executed by the GitHub Ubuntu runner. |

## Verification Commands

Run from repo root unless noted.

Note: `npm run audit:quality` reads the layout audit reports, so run
`npm run audit:layout` first when executing the frontend audit gates manually.

```bash
rg -n "Status: (Not started|In progress|Verifying)" docs/productization-implementation-tracker.md
rg -n "Status: (Not started|In progress|Verifying)" docs/productization-p3-implementation-tracker.md docs/productization-p4-implementation-tracker.md
rg -n "Completed Baseline|Deferred Productization Roadmap|Ownership Model|Verification Gates|Definition Of Done" docs/productization-roadmap.md
rg -n "TO[D]O|TB[D]|FIX[M]E" docs/productization-implementation-tracker.md docs/productization-roadmap.md backend/graphmind frontend/src frontend/tests backend/tests -g '!frontend/node_modules/**' -g '!frontend/dist/**'

cd backend && . .venv/bin/activate && pytest tests/test_storage.py tests/test_api.py::test_get_relationship_suggestions_maps_field_labels_for_project tests/test_api.py::test_get_relationship_suggestions_uses_none_for_missing_target -q
cd frontend && npm test -- reviewOps.test.ts RelationshipReview.test.tsx --run
cd frontend && npm test -- useImportActions.test.tsx ImportTaskListCard.test.tsx --run
cd frontend && npm test -- ImportIntakeControls.test.tsx ImportPanel.test.tsx GraphCanvas.test.tsx RelationshipReview.test.tsx --run
cd frontend && npm test -- workbenchStats.test.ts InsightPanel.test.tsx Workspace.test.tsx DataExplorerPanel.test.tsx --run
cd frontend && npm test -- importHealth.test.ts ImportHealthPanel.test.tsx useImportActions.test.tsx --run
cd frontend && npm test -- ImportPanel.test.tsx App.test.tsx useWorkspaceBootstrap.test.tsx i18n.test.tsx workspaceStore.test.ts --run
cd frontend && npm test -- ImportPanel.test.tsx App.test.tsx workspaceStore.test.ts apiClientImportBatch.test.ts --run
cd frontend && npm test -- Workspace.test.tsx InsightPanel.test.tsx --run
cd backend && . .venv/bin/activate && pytest tests/test_url_import_phase_60.py -q
cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_workspace_snapshot_endpoint_returns_first_load_payload tests/test_api.py::test_review_analytics_endpoint_reports_sla_trends_and_project_scope tests/test_api.py::test_review_analytics_endpoint_returns_404_for_missing_project -q
cd frontend && npm test -- reviewOps.test.ts RelationshipReview.test.tsx InsightPanel.test.tsx workspaceStore.test.ts apiClientImportBatch.test.ts useReviewActions.test.tsx --run
cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_workspace_snapshot_endpoint_returns_first_load_payload tests/test_api.py::test_review_analytics_endpoint_reports_sla_trends_and_project_scope tests/test_api.py::test_review_analytics_endpoint_returns_404_for_missing_project tests/test_api.py::test_review_analytics_trend_endpoint_persists_today_and_returns_snapshots tests/test_api.py::test_review_analytics_trend_endpoint_returns_404_for_missing_project tests/test_storage.py::test_initialize_database_creates_review_analytics_snapshot_table -q
cd frontend && npm test -- apiClientImportBatch.test.ts workspaceStore.test.ts RelationshipReview.test.tsx InsightPanel.test.tsx useReviewActions.test.tsx useWorkspaceBootstrap.test.tsx useImportActions.test.tsx useAiActions.test.tsx --run
cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_workspace_snapshot_endpoint_returns_first_load_payload tests/test_api.py::test_review_analytics_endpoint_reports_sla_trends_and_project_scope tests/test_api.py::test_review_analytics_trend_endpoint_persists_today_and_returns_snapshots tests/test_storage.py::test_initialize_database_creates_review_analytics_snapshot_table -q
cd frontend && npm test -- apiClientImportBatch.test.ts workspaceStore.test.ts reviewOps.test.ts RelationshipReview.test.tsx InsightPanel.test.tsx useReviewActions.test.tsx useWorkspaceBootstrap.test.tsx useImportActions.test.tsx useAiActions.test.tsx --run
cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_workspace_snapshot_endpoint_returns_first_load_payload tests/test_api.py::test_review_analytics_snapshot_summary_and_cleanup tests/test_api.py::test_review_analytics_snapshot_summary_returns_404_for_missing_project -q
cd frontend && npm test -- workspaceStore.test.ts useWorkspaceBootstrap.test.tsx useReviewActions.test.tsx InsightPanel.test.tsx Workspace.test.tsx apiClientImportBatch.test.ts RelationshipReview.test.tsx --run
cd frontend && npm test -- apiClientImportBatch.test.ts useReviewActions.test.tsx RelationshipReview.test.tsx InsightPanel.test.tsx Workspace.test.tsx --run
cd frontend && npm test -- useImportActions.test.tsx App.test.tsx apiClientImportBatch.test.ts RelationshipReview.test.tsx useReviewActions.test.tsx --run
cd backend && . .venv/bin/activate && pytest tests/test_storage.py::test_initialize_database_adds_relationship_suggestion_reviewer_column tests/test_graph_service.py::test_review_suggestion_updates_decision_status_and_note tests/test_graph_service.py::test_review_suggestion_records_reviewer_attribution tests/test_api.py::test_get_relationship_suggestions_maps_field_labels_for_project tests/test_api.py::test_project_review_relationship_suggestion_records_reviewer_attribution -q
cd frontend && npm test -- apiClientImportBatch.test.ts useReviewActions.test.tsx reviewOps.test.ts RelationshipReview.test.tsx App.test.tsx --run
cd backend && . .venv/bin/activate && pytest tests/test_review_analytics_maintenance.py tests/test_api.py::test_review_analytics_snapshot_summary_uses_project_retention_default tests/test_api.py::test_review_analytics_cleanup_uses_project_retention_default tests/test_api.py::test_review_analytics_auto_cleanup_runs_during_trend_hydration -q
cd frontend && npm test -- ImportPanel.test.tsx ImportTaskListCard.test.tsx ImportHealthPanel.test.tsx --run
cd backend && . .venv/bin/activate && pytest tests/test_url_import_phase_60.py -q
cd backend && . .venv/bin/activate && pytest -q
cd backend && . .venv/bin/activate && ruff check graphmind tests

cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
cd frontend && npm run audit:layout
cd frontend && npm run audit:quality
```

## Risk Review Checklist

- Scope drift: confirm deferred hosted/time-series/reviewer-attribution and
  managed scheduled retention items are documented and not required for
  completed P8-E local maintenance command acceptance.
- Security: confirm URL import remains single-resource, unauthenticated, and
  guarded by protocol, network, redirect, port, size, timeout, and content-type
  checks.
- UX/accessibility: confirm dialogs, command palette, search, tabs, motion, and
  compact mobile states remain covered by tests or layout audit; confirm import
  recovery copy remains field-specific and does not obscure retry controls.
- Performance: confirm quality budget and production build complete without
  non-blocking bundle warnings.
- Operations: confirm verification commands are documented for future releases.

## Acceptance Results

Accepted on 2026-06-11.

Summary:

- P0/P1/P2/P5/P6/P7 scope is tracked in the implementation tracker, and P3/P4
  trackers have no active unfinished status entries.
- Roadmap coverage is complete for completed baseline, deferred roadmap,
  ownership, verification gates, and definition of done.
- Backend and frontend verification gates passed with fresh command output.
- Layout audit passed with `problemCount: 0`, `resultCount: 60`,
  `consoleIssueCount: 0`, and `unexpectedConsoleIssueCount: 0`.
- Quality budget audit passed against `frontend/quality-budgets.json`.
- P6 review analytics timestamps and P7-A backend review analytics/SLA trend
  scope are covered by targeted backend/frontend tests and documented as the
  completed timestamp plus aggregate analytics layers.
- P7 full verification passed: backend tests reported 243 passed, backend ruff
  reported all checks passed, frontend tests reported 44 files and 335 tests
  passed, frontend type check/build/layout/quality all exited 0, and quality
  audit reported `buildWarningCount=0`.
- P7-B full verification passed: backend tests reported 246 passed, backend ruff
  reported all checks passed, frontend tests reported 44 files and 337 tests
  passed, frontend type check/build/layout/quality all exited 0, layout summary
  reported `problemCount: 0`, `consoleIssueCount: 0`, and
  `unexpectedConsoleIssueCount: 0`, and quality audit reported
  `buildWarningCount=0`.
- P7-C full verification passed: backend tests reported 246 passed, backend ruff
  reported all checks passed, frontend tests reported 44 files and 337 tests
  passed, frontend type check/build/layout/quality all exited 0, layout summary
  reported `problemCount: 0`, `consoleIssueCount: 0`, and
  `unexpectedConsoleIssueCount: 0`, and quality audit reported
  `buildWarningCount=0`.
- P7-D full verification passed: backend targeted tests reported 3 passed,
  frontend targeted tests reported 7 files and 100 tests passed, backend tests
  reported 248 passed, backend ruff reported all checks passed, frontend tests
  reported 44 files and 341 tests passed, frontend type check/build/layout/
  quality all exited 0, layout summary reported `problemCount: 0`,
  `consoleIssueCount: 0`, and `unexpectedConsoleIssueCount: 0`, and quality
  audit reported `buildWarningCount=0`.
- P8-A full verification passed: frontend targeted tests reported 5 files and
  95 tests passed, frontend type check exited 0, backend targeted compatibility
  tests reported 2 passed, backend tests reported 248 passed, backend ruff
  reported all checks passed, frontend tests reported 44 files and 342 tests
  passed, frontend build/layout/quality all exited 0, layout summary reported
  `problemCount: 0`, `consoleIssueCount: 0`, and
  `unexpectedConsoleIssueCount: 0`, and quality audit reported
  `buildWarningCount=0`.
- P8-C full verification passed: backend tests reported 254 passed, backend
  ruff reported all checks passed, frontend tests reported 44 files and 349
  tests passed, frontend type check/build/layout/quality all exited 0, layout
  summary reported `resultCount: 60`, `problemCount: 0`,
  `consoleIssueCount: 0`, and `unexpectedConsoleIssueCount: 0`, and quality
  audit reported `buildWarningCount=0`.
- P5 import recovery help targeted verification passed: frontend targeted tests
  reported 2 files and 8 tests passed, import/API/frontend state regressions
  reported 4 files and 77 tests passed, frontend full tests reported 44 files
  and 351 tests passed, and frontend type check/build/layout/quality gates
  exited 0.
- P5 first graph template guidance targeted verification passed: template tests
  reported 1 file and 8 tests passed, related onboarding/recovery UI tests
  reported 4 files and 100 tests passed, frontend full tests reported 44 files
  and 352 tests passed, and frontend type check/build/layout/quality gates
  exited 0.
- P5 graph quality entity-resolution metrics targeted verification passed:
  quality/state tests reported 4 files and 66 tests passed, frontend full tests
  reported 44 files and 352 tests passed, and frontend type
  check/build/layout/quality gates exited 0.
- P3 URL import governance and HTML extraction verification passed: backend URL
  import tests reported 16 passed, and targeted backend ruff reported all checks
  passed.
- P5 graph quality review shortcuts verification passed: targeted workspace/UI
  tests reported 2 files and 57 tests passed, frontend full tests reported 44
  files and 358 tests passed, and frontend type check/build/layout/quality
  gates exited 0.
- P5 graph quality duplicate cleanup verification passed: targeted workspace/UI
  tests reported 2 files and 59 tests passed, frontend full tests reported 44
  files and 360 tests passed, and frontend type check/build/layout/quality
  gates exited 0.
- P5 entity and mapping quality preview verification passed: targeted
  stats/workspace/UI tests reported 3 files and 68 tests passed, frontend full
  tests reported 44 files and 362 tests passed, and frontend type
  check/build/layout/quality gates exited 0.
- Frontend test output hygiene verification passed: targeted and full frontend
  test runs completed without the Node 25 `--localstorage-file` warning, and
  frontend type check/build/layout/quality gates exited 0.
- P5 non-duplicate graph quality guardrail verification passed: targeted
  workspace/UI tests reported 2 files and 63 tests passed, frontend full tests
  reported 44 files and 364 tests passed, and frontend type
  check/build/layout/quality gates exited 0.
- P5 project preset export verification passed: targeted settings/App tests
  reported 2 files and 31 tests passed, frontend full tests reported 45 files
  and 366 tests passed, and frontend type check/build/layout/quality gates
  exited 0.
- P7 SLA trend snapshot chart verification passed: targeted review analytics
  test reported 1 file and 23 tests passed, related frontend regression tests
  reported 5 files and 117 tests passed, frontend full tests reported 45 files
  and 366 tests passed, and frontend type check/build/layout/quality gates
  exited 0.
- P8 cleanup execution mode clarity verification passed: targeted settings/App
  tests reported 2 files and 32 tests passed, related frontend regression tests
  reported 5 files and 118 tests passed, frontend full tests reported 45 files
  and 367 tests passed, and frontend type check/build/layout/quality gates
  exited 0.
- P5 project preset import preview verification passed: targeted settings/App
  tests reported 2 files and 33 tests passed, related frontend regression tests
  reported 5 files and 119 tests passed, frontend full tests reported 45 files
  and 368 tests passed, and frontend type check/build/layout/quality gates
  exited 0.
- P5 template preset recommendation verification passed: targeted template
  tests reported 1 file and 9 tests passed, related frontend regression tests
  reported 6 files and 134 tests passed, frontend full tests reported 45 files
  and 369 tests passed, and frontend type check/build/layout/quality gates
  exited 0.
- P7 review audit trend summary export verification passed: targeted review
  export tests reported 2 files and 29 tests passed, related frontend
  regression tests reported 5 files and 122 tests passed, frontend full tests
  reported 45 files and 369 tests passed, and frontend type
  check/build/layout/quality gates exited 0.
- P4 project share token admin UX verification passed: targeted workspace test
  reported 1 file and 54 tests passed, related frontend share/API tests
  reported 2 files and 72 tests passed, frontend full tests reported 45 files
  and 369 tests passed, and frontend type check/build/layout/quality gates
  exited 0.
- P7 review analytics trend window selection verification passed: targeted
  frontend tests reported 5 files and 82 tests passed, frontend full tests
  reported 45 files and 373 tests passed, and frontend type check/build/layout/
  quality gates exited 0.
- P7 local-first reviewer attribution verification passed: targeted backend
  tests reported 5 passed, targeted backend ruff reported all checks passed,
  targeted frontend tests reported 5 files and 84 tests passed, and frontend
  type check exited 0.
- P7 review audit trend context export targeted verification passed: targeted
  frontend review export tests reported 2 files and 29 tests passed, full
  frontend tests reported 45 files and 380 tests passed, and frontend type
  check/build/layout/quality gates exited 0.
- P8 review analytics maintenance command verification passed: targeted backend
  maintenance/API regression tests reported 8 passed, URL import safety
  regression tests reported 16 passed, full backend tests reported 263 passed,
  backend ruff reported all checks passed, and CLI help exited 0 with the
  expected maintenance arguments.
- P8 review audit snapshot governance context export targeted verification
  passed: targeted frontend review export tests reported 2 files and 29 tests
  passed, full frontend tests reported 45 files and 380 tests passed, and
  frontend type check/build/layout/quality gates exited 0.
- P8 deployment ops review analytics maintenance targeted verification passed:
  targeted backend deployment ops tests reported 8 passed, review analytics
  maintenance tests reported 5 passed, full backend tests reported 265 passed,
  backend ruff reported all checks passed, and ops helper help exited 0 outside
  the backend virtualenv.
- P8 deployment ops maintenance env-file support targeted verification passed:
  targeted backend deployment ops tests reported 10 passed, review analytics
  maintenance tests reported 5 passed, full backend tests reported 267 passed,
  backend ruff reported all checks passed, and ops helper help listed env-file
  and maintenance arguments.
- P9 searchable guided repair help verification passed: targeted import/help
  frontend tests reported 3 files and 34 tests passed, i18n targeted tests
  reported 1 file and 3 tests passed, full frontend tests reported 45 files
  and 376 tests passed, and frontend type check/build/layout/quality gates
  exited 0.
- P9 guided repair actions verification passed: targeted import/help frontend
  tests reported 3 files and 35 tests passed, i18n targeted tests reported 1
  file and 3 tests passed, full frontend tests reported 45 files and 377 tests
  passed, and frontend type check/build/layout/quality gates exited 0.
- P9 URL safety help focus verification passed: targeted import/help frontend
  tests reported 3 files and 36 tests passed, full frontend tests reported 45
  files and 378 tests passed, and frontend type check/build/layout/quality gates
  exited 0.
- P9 first-graph preset help settings action targeted verification passed:
  frontend ImportPanel/Workspace tests reported 2 files and 84 tests passed,
  full frontend tests reported 45 files and 380 tests passed, and frontend type
  check/build/layout/quality gates exited 0.
- P8 deployment ops maintenance env-file error handling targeted verification
  passed: targeted backend deployment ops tests reported 13 passed, and targeted
  ruff check for `deploy/graphmind-ops.py` plus deployment ops tests reported
  all checks passed.
- P10 release verification hardening verification passed: targeted frontend
  release-gate tests reported 3 passed after checking ChatPanel duplicate React
  key warning coverage, `data-dialog` layout-audit state closure, explicit
  release-critical backend CI steps, deployment preflight JSON, and
  deployment-gates CI job now provides runner-rendered Compose evidence for both
  private and TLS deployment artifacts. Local Docker remains unavailable in this
  workspace, so Compose rendering is intentionally verified by the GitHub Ubuntu
  runner artifact checks.

Closed residual risks:

- Vite production build large chunk warning is closed by vendor chunk splitting
  in `frontend/vite.config.ts`; `npm run build` exits 0 without warning and
  `frontend/quality-budgets.json` now requires `maxBuildWarnings: 0`.
- React Flow parent-container layout audit warning is closed by avoiding
  GraphCanvas mounting inside hidden single-pane modules and by removing the
  audit allowlist; `npm run audit:layout` now reports `consoleIssueCount: 0`.
- P8-C legacy project settings compatibility is closed by normalizing
  `review_analytics` defaults at frontend API/state and settings-dialog
  boundaries.
- Layout audit CI hang risk is closed by explicitly exiting the audit script
  after report generation; the latest `npm run audit:layout` exits 0.
- P5 import recovery residual risk is closed for local-first failed imports:
  structured `ApiError` details now flow into failed import tasks and render
  explicit repair actions plus field issues.
- Frontend test-output warning noise is closed by running Vitest through a
  wrapper that supplies a valid project-local Node localStorage file to the main
  process and worker processes.
- Non-duplicate graph-quality bulk-remediation ambiguity is closed at the UX
  layer: isolated, weak-evidence, entity-match, and mapping-review filters now
  expose readiness guidance and a disabled bulk action rather than implying
  unsafe batch mutation is available.
- Saved project preset ambiguity is narrowed: the product now has a safe
  preset artifact that excludes API keys and a guarded import preview that can
  apply reusable settings to an unsaved draft without replacing secrets.
- Template-level preset recommendation ambiguity is closed at the onboarding
  layer: first-graph templates now suggest source-appropriate preset posture
  without applying, saving, or overwriting AI/vector settings.
- Review audit trend handoff ambiguity is narrowed: JSON exports now include a
  derived first/latest snapshot summary while preserving raw trend snapshots for
  downstream reporting tools.
- Review audit trend-window handoff ambiguity is narrowed: JSON exports now
  include selected fixed trend days, backend analytics window, snapshot count,
  and first/latest snapshot dates beside the raw trend and delta summary.
- Project share token administration ambiguity is narrowed: the workbench now
  shows share-token lifecycle metadata, one-time token copy, and revoked state
  without listing plaintext tokens after creation.
- Review analytics cleanup execution ambiguity is closed in the settings UI:
  automatic cleanup is described as request-time, while manual cleanup remains
  available from the SLA trend panel.
- Fixed-window SLA trend ambiguity is narrowed: reviewers can choose 7, 14, 30,
  or 90 day backend-supported trend ranges, refresh paths preserve that choice,
  and project reset clears stale trend/governance state.
- Reviewer attribution ambiguity is narrowed for local-first handoff: review
  decisions can carry an optional reviewer label through storage, APIs, UI
  submission, and audit exports without implying hosted identity ownership.
- Review analytics retention maintenance ambiguity is narrowed for private
  deployments: expired snapshot cleanup now has a backend service and
  operator-run command that can be called by cron, container jobs, or platform
  schedulers.
- Review audit snapshot-governance handoff ambiguity is narrowed: JSON exports
  now include retention days, snapshot counts, expired counts, oldest/latest
  snapshot dates, and the latest backend cleanup audit event when those are
  loaded in the workspace.
- Deployment maintenance execution ambiguity is narrowed: private deployments
  can run review analytics snapshot cleanup through the JSON-emitting
  `deploy/graphmind-ops.py review-analytics-maintenance` helper with dry-run,
  project filtering, and retention override support.
- Deployment maintenance configuration ambiguity is narrowed: the ops helper can
  read `GRAPHMIND_WORKSPACE_ROOT` from the deployment env file while preserving
  explicit workspace-root overrides for temporary validation workspaces.
- Deployment maintenance error-output ambiguity is closed: missing workspace
  configuration and unreadable env files now return JSON failures, so release
  automation does not have to parse tracebacks or empty stdout.
- Searchable repair-help ambiguity is narrowed for local onboarding: import
  recovery, URL safety, first-graph/preset guidance, and quality-governance next
  steps are searchable inside the workbench instead of living only in separate
  documentation.
- Guided repair action ambiguity is narrowed: help actions route into existing
  failed-import focus and pending-review queues with distinct accessible labels
  instead of performing hidden mutation.
- URL safety repair ambiguity is narrowed: URL help can focus the existing URL
  field for correction while preserving manual import submission and backend URL
  safety checks.
- First-graph preset repair ambiguity is narrowed: preset help can open the
  existing AI/vector settings dialog from data intake while keeping preset
  import, draft apply, save, and API-key preservation as explicit settings
  actions.
- P10 release evidence ambiguity is narrowed: ChatPanel duplicate React key
  warnings have regression coverage, `data-dialog` layout audit state now has a
  required visible target, release-critical backend checks are explicit CI steps,
  and deployment artifact integrity is verified before upload.

Remaining roadmap risks:

- This workspace is not a git repository, so acceptance could not use `git diff`
  or commit history as an evidence source. File-level verification relied on
  tracker, roadmap, tests, lint, build, and audit commands instead.
- Named-user reviewer identity, multi-user SLA ownership, hosted managed
  retention scheduling, arbitrary custom reporting windows, multi-window
  comparison, and exported richer charts remain future reporting work now that
  P8-C adds project-level retention defaults and request-time cleanup, P8-E adds
  an operator-run maintenance command, P7-5 adds compact persisted trend charts,
  P7-6 adds readable trend summaries to JSON audit exports, P7-7 exposes
  backend-supported fixed 7/14/30/90 day trend windows in the frontend, P7-8
  adds local-first reviewer labels, and P7-9 exports fixed trend-window context
  for audit handoffs. P8-6 adds snapshot-governance context to JSON review
  exports, and P8-7 adds a deployment ops wrapper for private maintenance
  execution, and P8-8 lets that helper read the deployment env file, but hosted
  organization audit logs, managed recurring jobs, and richer chart exports
  remain future scope.
- Public SaaS scale-out work remains deferred: named users, SSO, organization
  tenancy, organization-level audit logs, distributed rate limiting, and managed
  queues are documented as future hosted projects; project share token lifecycle
  management is covered by the current workbench admin UI.
- Remaining onboarding work is now narrower: project presets can be exported,
  previewed, applied to the settings draft without replacing secrets,
  recommended from first-graph templates without mutating settings, and searched
  through a local help/repair panel; first-graph/preset help can also open the
  existing AI/vector settings dialog without hidden mutation. Deeper guided
  repair automation or automatic template-to-preset apply flows should be driven
  by repeated real-world usage patterns and governed separately.
- Remaining graph quality dashboard work is now narrower: stale import counts
  are covered by import health using the backend 30-minute recovery threshold,
  disconnected/weak-evidence slices have preview-to-selection drilldowns, and
  pending/duplicate slices route into existing review queues. Duplicate cleanup
  is exposed through the governed cleanup handler; entity/mapping slices now
  expose preview-to-graph inspection while status decisions remain in the source
  inspector. Non-duplicate bulk-remediation readiness is visible but locked;
  future graph-quality work should focus on governed batch execution only after
  real review workflows need it.
- Remaining URL import governance work is hosted-scale only: shared rate
  limiting, per-project quotas, and richer readability extraction should wait
  for multi-instance or real-world page quality pressure.

## Remaining Scope Classification

| Area | Classification | Next Trigger |
| --- | --- | --- |
| Named users, SSO, organization tenancy, and organization audit logs | Future hosted scale-out | Start only when GraphMind moves beyond local/private-team deployment into hosted multi-tenant operation. |
| Distributed/shared rate limiting, managed queues, and centralized worker orchestration | Future hosted scale-out | Start when one-process or SQLite-backed private worker mode is insufficient for real multi-instance workloads. |
| Managed recurring review-analytics retention jobs | Future hosted ops | Start when platform-owned scheduling is required beyond the completed API request-time cleanup and operator-run maintenance command. |
| Arbitrary custom reporting windows, multi-window comparisons, richer chart/PDF/CSV exports | Future reporting | Start when teams need reporting periods beyond fixed 7/14/30/90 day trend windows and JSON audit handoff context. |
| Automatic template-to-preset application and deeper guided repair automation | Future governed onboarding | Start only after repeated real-world usage shows safe, predictable repair or preset-application patterns. |
| Non-duplicate graph-quality bulk execution | Future governed graph quality | Start only after current readiness guards identify repeatable, low-risk batch decisions in real review workflows. |
| Shared/per-project URL quotas, gateway-level URL controls, richer readability extraction | Future hosted/import governance | Start when deployments become shared/multi-instance or real URLs exceed the dependency-free parser quality. |

Acceptance conclusion:

The P0-P10 productization implementation is accepted for the current local-first
and private-team scope. The latest P5 verification evidence is recorded in
`docs/superpowers/plans/2026-06-07-p5-review-ops-quality-command-center.md`;
the latest P5 import recovery evidence is recorded in
`docs/superpowers/plans/2026-06-11-p5-import-recovery-help-surface.md`;
the latest P5 template onboarding evidence is recorded in
`docs/superpowers/plans/2026-06-11-p5-first-graph-template-guidance.md`;
the latest P5 graph quality evidence is recorded in
`docs/superpowers/plans/2026-06-11-p5-graph-quality-entity-resolution-metrics.md`;
the latest P3 URL import evidence is recorded in
`docs/superpowers/plans/2026-06-11-p3-url-import-html-extraction.md`;
the latest P6 evidence is recorded in
`docs/superpowers/plans/2026-06-08-p6-review-analytics-timestamps.md`; the
latest P8 evidence is recorded in
`docs/superpowers/plans/2026-06-11-p8c-review-analytics-retention-defaults.md`;
latest P9 evidence is recorded in the P9 entries of
`docs/productization-implementation-tracker.md`; latest P10 evidence is recorded
in AC-62 through AC-64 above, `.github/workflows/productization-gates.yml`, and
`docs/productization-release-checklist.md`.
