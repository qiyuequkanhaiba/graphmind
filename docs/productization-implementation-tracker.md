# GraphMind Productization Implementation Tracker

Last updated: 2026-06-12

## Status Legend

- Not started: no code or tests written.
- In progress: tests or implementation started.
- Verifying: implementation exists and verification is running.
- Done: implementation and listed verification passed.

## P0

### P0-1 Workspace Snapshot API

Status: Done

- Backend endpoint: `GET /api/projects/{project_id}/workspace-snapshot`
- Backend schema: `WorkspaceSnapshotResponse`
- Frontend API: `getWorkspaceSnapshot(projectId)`
- Frontend bootstrap: use snapshot instead of many first-load requests
- Verification: `pytest tests/test_api.py::test_workspace_snapshot_endpoint_returns_first_load_payload tests/test_api.py::test_workspace_snapshot_endpoint_returns_404_for_missing_project -q`; `npm test -- apiClientImportBatch.test.ts workspaceStore.test.ts`

### P0-2 Unified Error Contract

Status: Done

- Backend error schema: `code`, `message`, `user_action`, `retryable`, `field_errors`
- Import, URL import, AI settings, review, vector index error codes
- Frontend `ApiError` parsing
- User-facing remediation in import, AI settings, review flows
- Verification: `pytest tests/test_api.py::test_import_endpoint_rejects_file_over_upload_limit tests/test_api.py::test_import_endpoint_rejects_unsupported_file_type_with_error_contract tests/test_api.py::test_async_import_endpoint_rejects_file_over_upload_limit tests/test_api.py::test_import_upload_limit_can_be_configured tests/test_url_import_phase_60.py::test_url_import_rejects_unsafe_url_before_import_batch -q`; `npm test -- apiClientImportBatch.test.ts`; `npm test -- workspaceStore.test.ts`; `npm test -- App.test.tsx -t "records failed import tasks"`

### P0-3 Import Task Event Stream

Status: Done

- Backend import event model
- SSE endpoint: `GET /api/projects/{project_id}/import-events`
- Polling fallback remains
- Frontend `useImportEvents(projectId)`
- Realtime import stage UI updates
- Verification: `pytest tests/test_api.py::test_import_events_endpoint_streams_import_job_snapshots -q`; `npm test -- useImportEvents.test.tsx`; `npm test -- App.test.tsx -t "updates import tasks from the import event stream"`

### P0-4 Frontend State Split

Status: Done

- Extract `useWorkspaceBootstrap`
- Extract `useImportActions`
- Extract `useReviewActions`
- Extract `useAiActions`
- Keep `App.tsx` as composition layer
- Verification: `npm test -- useImportActions.test.tsx useWorkspaceBootstrap.test.tsx useImportEvents.test.tsx useAiActions.test.tsx useReviewActions.test.tsx`; `npm test -- App.test.tsx -t "uploads a CSV|records failed import tasks|updates import tasks from the import event stream|recovers queued persisted import jobs|resets the current project data|reviews a relationship"`; `npm run lint`

### P0-5 Mobile Layout Stability

Status: Done

- Mobile graph tools drawer contained in viewport
- Mobile data tree long text containment
- Mobile workbench grid rows pin header, main content, and status bar so
  compact screens cannot stretch the footer or collapse the graph canvas.
- Compact mobile AI chat keeps a usable messages region while preventing the
  prompt form from overlapping the status bar.
- Layout audit in verification flow
- Verification: `npm test -- mobileLayoutCss.test.js layoutAuditScript.test.js`; `npm run lint`; `npm run audit:layout` (`problemCount: 0`, 60 viewport/state checks)

## P1

### P1-1 GSAP Motion System

Status: Done

- Add `gsap` and `@gsap/react`
- Create motion tokens and reduced-motion utility
- Add scoped `useGSAP()` panel/dialog/transition helpers
- Animate only transform/opacity/autoAlpha
- Verification: `npm test -- motionSystem.test.js ImportTaskListCard.test.tsx DataExplorerPanel.test.tsx Workspace.test.tsx`; `npm test -- layoutAuditScript.test.js mobileLayoutCss.test.js`; `npm run lint`; `npm run build`

### P1-2 Productized Workflow

Status: Done

- Workbench next-step recommendations
- Import completion guidance
- Review queue priority ordering
- Evidence-to-inspector-to-graph roundtrip
- Verification: `npm test -- Workspace.test.tsx ImportPanel.test.tsx DataExplorerPanel.test.tsx EvidenceInspector.test.tsx RelationshipReview.test.tsx`; `npm test -- i18n.test.tsx graphStyles.test.js mobileLayoutCss.test.js`; `npm run lint`

### P1-3 Backend Router and Service Boundaries

Status: Done

- Split routers: projects, imports, graph, reviews, evidence, ai
- Keep public API paths compatible
- Split import orchestrators by source kind where risk is contained
- Verification: `pytest tests/test_api_router_boundaries.py tests/test_api.py tests/test_entity_match_review_phase_7.py tests/test_source_entity_inspection_api_phase_5.py -q`; `ruff check graphmind/api/routes.py graphmind/api/router_domains.py tests/test_api_router_boundaries.py`

### P1-4 Evidence and Data Lazy Loading

Status: Done

- Paginated source chunks
- Paginated extracted entities and relationships
- Graph filtering query parameters
- DataExplorer loads visible source chunks lazily
- Verification: `pytest tests/test_api_lazy_loading_phase_p14.py tests/test_source_entity_inspection_api_phase_5.py tests/test_api.py::test_workspace_snapshot_endpoint_returns_first_load_payload -q`; `ruff check graphmind/api/routes.py graphmind/api/schemas.py tests/test_api_lazy_loading_phase_p14.py`; `npm test -- apiClientImportBatch.test.ts workspaceStore.test.ts DataExplorerPanel.test.tsx App.test.tsx`; `npm run lint`

## P2

### P2-1 Workspace Version and Incremental Refresh

Status: Done

- Workspace version or ETag support
- Refresh only changed graph/review/import data
- Verification: `pytest tests/test_api_workspace_version_phase_p21.py tests/test_api.py::test_workspace_snapshot_endpoint_returns_first_load_payload -q`; `ruff check graphmind/api/routes.py graphmind/api/schemas.py tests/test_api_workspace_version_phase_p21.py`; `npm test -- apiClientImportBatch.test.ts workspaceStore.test.ts useWorkspaceBootstrap.test.tsx useImportActions.test.tsx`; `npm run lint`

### P2-2 Performance and Quality Gates

Status: Done

- Performance budget definitions
- CI-ready layout audit command
- Visual regression coverage for key states
- Quality budget command
- Verification: `npm test -- motionSystem.test.js Workspace.test.tsx graphStyles.test.js layoutAuditScript.test.js useDialogFocusTrap.test.tsx mobileLayoutCss.test.js CommandPalette.test.tsx`; `npm run lint`; `npm run build`; `npm run audit:layout`; `npm run audit:quality`

### P2-3 URL Import Security

Status: Done

- Protocol allowlist
- Private network blocking
- Download size and timeout enforcement
- Content-type validation
- URL credential rejection
- Redirect target revalidation
- Verification: `pytest tests/test_url_import_phase_60.py -q`; `ruff check graphmind/services/url_import.py tests/test_url_import_phase_60.py`

### P3-3 URL Import Governance And Static HTML Extraction

Status: Done

- URL import governance supports configurable host allowlist, host denylist,
  per-process quota, and production readiness checks.
- Static HTML extraction now uses a standard-library parser instead of regex-only
  extraction, ignores navigation/footer/script/style/svg/hidden chrome, and
  preserves main/article headings, paragraphs, and list items.
- Verification:
  `cd backend && . .venv/bin/activate && pytest tests/test_url_import_phase_60.py -q`
  reported 16 passed;
  `cd backend && . .venv/bin/activate && ruff check graphmind/services/url_import.py tests/test_url_import_phase_60.py`
  reported all checks passed.

### P2-4 Productization Roadmap

Status: Done

- Document completed/deferred items
- Document verification commands and ownership
- Roadmap: `docs/productization-roadmap.md`
- Verification: roadmap self-review completed; tracker cross-check completed

## P5

### P5-1 Review Ops And Quality Command Center

Status: Done

- Review operations summary for current relationship review workload.
- Saved review filters for analyst workflows.
- Exportable JSON review/audit report for the current filtered queue.
- P5 documentation records onboarding/recovery, performance, and hosted
  scale-out follow-up boundaries.
- Verification:
  `npm test -- reviewOps.test.ts RelationshipReview.test.tsx InsightPanel.test.tsx i18n.test.tsx --run`;
  `npm test`; `npm run lint`; `npm run build`; `npm run audit:layout`;
  `npm run audit:quality`; `cd backend && . .venv/bin/activate && pytest -q`;
  `cd backend && . .venv/bin/activate && ruff check graphmind tests`.

### P5-2 User Onboarding And Import Recovery Help Surface

Status: Done

- Failed import tasks now preserve frontend `ApiError` recovery details:
  `code`, `userAction`, `retryable`, and `fieldErrors`.
- Import retry/running/success transitions clear stale recovery metadata so
  completed tasks cannot display old remediation copy.
- Import task cards render structured recovery action, field-level issues, and
  error code beside the existing file/URL recovery playbooks.
- Verification:
  `cd frontend && npm test -- useImportActions.test.tsx ImportTaskListCard.test.tsx --run`
  reported 2 files and 8 tests passed;
  `cd frontend && npm test -- ImportPanel.test.tsx App.test.tsx workspaceStore.test.ts apiClientImportBatch.test.ts --run`
  reported 4 files and 77 tests passed;
  `cd frontend && npm test` reported 44 files and 351 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0.

### P5-3 First Graph Template Guidance

Status: Done

- First-graph templates cover spreadsheet, document, code repository, and URL
  starting points in the import intake surface.
- Selecting a template now shows a scenario-specific next-step panel with the
  active template, concise preparation guidance, and the matching action:
  sample import, file picker, or URL input.
- Existing first-graph empty state and low-confidence relationship recovery
  playbooks are confirmed as implemented and covered by frontend tests.
- Verification:
  `cd frontend && npm test -- ImportIntakeControls.test.tsx --run`
  reported 1 file and 8 tests passed;
  `cd frontend && npm test -- ImportIntakeControls.test.tsx ImportPanel.test.tsx GraphCanvas.test.tsx RelationshipReview.test.tsx --run`
  reported 4 files and 100 tests passed;
  `cd frontend && npm test` reported 44 files and 352 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0.

### P5-4 Graph Quality Entity Resolution Metrics

Status: Done

- Graph quality summary now includes unresolved entity-match reviews and
  unresolved documented-mapping reviews using existing workspace review state.
- Workspace quality computation passes `entityMatchReviews` and `mappingReviews`
  into the right-panel quality operations summary.
- The graph quality operations panel renders entity-match and mapping-review
  pending metrics and preserves them in the local quality filter options.
- Verification:
  `cd frontend && npm test -- workbenchStats.test.ts InsightPanel.test.tsx Workspace.test.tsx DataExplorerPanel.test.tsx --run`
  reported 4 files and 66 tests passed;
  `cd frontend && npm test` reported 44 files and 352 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0.

### P5-5 Stale Import Health Metrics

Status: Done

- Persisted import jobs now keep backend `updated_at` in frontend import task
  state as `updatedAt`, including polling, event snapshots, recovery refresh,
  and workspace bootstrap paths that reuse the shared job-to-task mapper.
- Import health uses the same 30-minute stale threshold as the backend recovery
  worker: queued or running persisted jobs with no `updated_at` refresh for at
  least 30 minutes are counted as stuck import jobs.
- The import health panel renders the stuck-job count beside existing source,
  evidence, ignored-file, failure, review, and duplicate metrics, while the
  existing recovery action still covers all active persisted jobs.
- URL import jobs now preserve the `url` task kind when mapped from persisted
  jobs instead of falling back to `file`.
- Verification:
  `cd frontend && npm test -- importHealth.test.ts ImportHealthPanel.test.tsx useImportActions.test.tsx --run`
  reported 3 files and 15 tests passed;
  `cd frontend && npm test -- ImportPanel.test.tsx App.test.tsx useWorkspaceBootstrap.test.tsx i18n.test.tsx workspaceStore.test.ts --run`
  reported 5 files and 64 tests passed;
  `cd frontend && npm test` reported 44 files and 354 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0.

### P5-6 Graph Quality Drilldown Guidance

Status: Done

- Graph quality operations now react to the selected local quality filter with
  a focused next-step line for all quality slices.
- Isolated node filtering tells reviewers how many disconnected nodes should be
  connected first.
- Weak-evidence filtering tells reviewers how many low-confidence or
  no-evidence relationships need strengthening or rejection.
- Existing metrics and local filter persistence remain unchanged.
- Verification:
  `cd frontend && npm test -- InsightPanel.test.tsx i18n.test.tsx --run`
  reported 2 files and 8 tests passed;
  `cd frontend && npm test` reported 44 files and 354 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0.

### P5-7 Graph Quality Preview Lists

Status: Done

- Graph quality summary now includes compact preview rows for isolated nodes and
  weak-evidence relationships, derived directly from the current graph.
- The review-side quality panel renders isolated node labels/source refs when
  the isolated-node filter is active.
- The quality panel renders weak-evidence relationship labels, relationship
  type, and confidence when the weak-evidence filter is active.
- Preview lists are capped to keep the insights panel compact; graph
  highlighting and governed bulk execution remain future work.
- Verification:
  `cd frontend && npm test -- workbenchStats.test.ts InsightPanel.test.tsx --run`
  reported 2 files and 12 tests passed;
  `cd frontend && npm test` reported 44 files and 354 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0.

### P5-8 Graph Quality Selection Linking

Status: Done

- Graph quality preview rows are actionable controls instead of passive text.
- Clicking an isolated-node preview selects that graph node and returns the
  insights panel to the evidence tab.
- Clicking a weak-evidence relationship preview selects that graph relationship
  and returns the insights panel to relationship evidence.
- The implementation reuses existing graph selection semantics, so selected
  relationships highlight their endpoints and selected nodes hydrate the same
  evidence detail surface used by the graph canvas and data tree.
- Verification:
  `cd frontend && npm test -- Workspace.test.tsx InsightPanel.test.tsx --run`
  reported 2 files and 55 tests passed;
  `cd frontend && npm test` reported 44 files and 356 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0.

### P5-9 Graph Quality Cross-Panel Review Shortcuts

Status: Done

- The graph quality operations panel now exposes direct review-queue actions
  for the pending-review and duplicate-governance quality filters.
- The pending quality filter opens the existing relationship review pending
  queue, switches the workbench to the insights module, and preserves the
  shortcut focus announcement used by import health shortcuts.
- The duplicate quality filter opens the existing duplicate-governance review
  queue and narrows the review panel to governance-backed duplicate
  suggestions.
- The implementation reuses the existing review shortcut routing instead of
  introducing a separate quality-only queue state.
- Verification:
  `cd frontend && npm test -- Workspace.test.tsx InsightPanel.test.tsx --run`
  reported 2 files and 57 tests passed;
  `cd frontend && npm test` reported 44 files and 358 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0. Layout audit reported 60
  viewport/state checks, and quality audit reported `buildWarningCount=0`.

### P5-10 Graph Quality Duplicate Cleanup Action

Status: Done

- The graph quality operations panel now exposes a duplicate cleanup action
  when the duplicate-groups quality filter is active.
- The action reuses the existing relationship duplicate cleanup handler already
  wired through the relationship review panel, so duplicate remediation stays
  on the governed backend path.
- The duplicate quality filter keeps both actions available: open the duplicate
  governance queue for inspection, or run duplicate cleanup directly when the
  operator is ready.
- The cleanup action is disabled when no duplicate groups are present.
- Verification:
  `cd frontend && npm test -- Workspace.test.tsx InsightPanel.test.tsx --run`
  reported 2 files and 59 tests passed;
  `cd frontend && npm test` reported 44 files and 360 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0. Layout audit reported 60
  viewport/state checks, and quality audit reported `buildWarningCount=0`.

### P5-11 Entity And Mapping Quality Preview Selection

Status: Done

- Graph quality summary now includes compact previews for unresolved entity
  match reviews and documented mapping reviews.
- The quality panel renders entity-match and mapping-review preview rows when
  those filters are active.
- Clicking an entity or mapping review preview focuses the matching source
  graph node when present, falling back to the target node if needed, and
  returns reviewers to the evidence tab.
- The implementation keeps entity/mapping review status changes in the existing
  data/source inspector controls; the quality panel adds navigation and
  inspection only.
- Verification:
  `cd frontend && npm test -- workbenchStats.test.ts InsightPanel.test.tsx Workspace.test.tsx --run`
  reported 3 files and 68 tests passed;
  `cd frontend && npm test` reported 44 files and 362 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0. Layout audit reported 60
  viewport/state checks, and quality audit reported `buildWarningCount=0`.

### P5-12 Frontend Test Runner Warning Hygiene

Status: Done

- The frontend test script now runs Vitest through `scripts/run-vitest.mjs`.
- The wrapper supplies a project-local Node `--localstorage-file` path to both
  the Vitest process and worker processes through `NODE_OPTIONS`.
- This closes the Node 25 `--localstorage-file was provided without a valid
  path` warning that previously polluted otherwise passing `npm test` output.
- Vitest arguments continue to pass through, so targeted commands such as
  `npm test -- Workspace.test.tsx --run` still work.
- Verification:
  `cd frontend && npm test -- workbenchStats.test.ts InsightPanel.test.tsx Workspace.test.tsx --run`
  reported 3 files and 68 tests passed without the localStorage warning;
  `cd frontend && npm test` reported 44 files and 362 tests passed without the
  localStorage warning;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0. Layout audit reported 60
  viewport/state checks, and quality audit reported `buildWarningCount=0`.

### P5-13 Non-Duplicate Graph Quality Bulk Remediation Guardrails

Status: Done

- Non-duplicate graph quality filters now expose a bulk remediation readiness
  guard instead of a destructive batch action.
- The isolated-node guard tells reviewers to inspect isolated nodes one by one
  and add relationship evidence before remediation.
- The weak-evidence guard tells reviewers to inspect each weak relationship and
  strengthen evidence or reject it before remediation.
- Entity-match and mapping-review guards keep accept/reject decisions in the
  existing per-item review controls and explicitly state that bulk acceptance is
  not unlocked.
- The guard renders a disabled bulk remediation control, making the future
  product boundary visible without wiring irreversible graph mutations.
- Verification:
  `cd frontend && npm test -- InsightPanel.test.tsx Workspace.test.tsx --run`
  reported 2 files and 63 tests passed;
  `cd frontend && npm test` reported 44 files and 364 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0. Layout audit reported 60
  viewport/state checks, and quality audit reported `buildWarningCount=0`.

### P5-14 Project Preset Export

Status: Done

- AI and vector settings now expose a project preset export action for local
  handoff and reuse.
- The exported preset uses `graphmind.project-preset.v1` and includes the chat
  provider/model/base URL/temperature, vector provider/model/base
  URL/dimensions, and review analytics retention defaults.
- API keys and secret field names are intentionally excluded from the exported
  JSON, and the settings dialog states that project preset exports do not
  include API keys.
- This stage introduced a non-mutating preset handoff surface only; guarded
  import/draft apply is covered by P5-15, while automatic overwrites remain a
  future governed workflow.
- Verification:
  `cd frontend && npm test -- AISettingsPanel.test.tsx App.test.tsx --run`
  reported 2 files and 31 tests passed;
  `cd frontend && npm test` reported 45 files and 366 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0. Layout audit reported 60
  viewport/state checks, and quality audit reported `buildWarningCount=0`.

### P5-15 Project Preset Import Preview And Draft Apply

Status: Done

- AI and vector settings now expose a project preset import action beside the
  preset export action.
- Imported presets are schema-validated against `graphmind.project-preset.v1`
  before they render a preview.
- The preview shows chat provider/model, vector provider/model/dimensions, and
  review analytics retention/cleanup mode.
- Applying a preset updates only the settings draft; users must still press
  save before project settings change.
- Applying a preset preserves existing chat and vector API keys as well as
  runtime vector index state, so imported preset files cannot overwrite
  secrets.
- Invalid preset JSON shows a local error without changing the current draft.
- Verification:
  `cd frontend && npm test -- AISettingsPanel.test.tsx App.test.tsx --run`
  reported 2 files and 33 tests passed;
  `cd frontend && npm test -- AISettingsPanel.test.tsx App.test.tsx RelationshipReview.test.tsx InsightPanel.test.tsx Workspace.test.tsx --run`
  reported 5 files and 119 tests passed;
  `cd frontend && npm test` reported 45 files and 368 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0. Layout audit reported 60
  viewport/state checks, and quality audit reported `buildWarningCount=0`.

### P5-16 Template-Level Preset Recommendations

Status: Done

- First-graph template guidance now includes a compact project preset
  recommendation for the selected source type.
- Spreadsheet and URL templates recommend the conservative local-first posture:
  rules chat, no vector model, and 30-day review snapshot retention.
- Document and code repository templates recommend a vector-enhanced posture:
  OpenAI Compatible chat, OpenAI Compatible vector, and 90-day review snapshot
  retention.
- The recommendation copy explicitly states that AI and vector settings are not
  changed automatically, and the import surface does not expose an apply-preset
  action.
- Verification:
  `cd frontend && npm test -- ImportIntakeControls.test.tsx --run`
  reported 1 file and 9 tests passed;
  `cd frontend && npm test -- ImportIntakeControls.test.tsx ImportPanel.test.tsx GraphCanvas.test.tsx RelationshipReview.test.tsx AISettingsPanel.test.tsx App.test.tsx --run`
  reported 6 files and 134 tests passed;
  `cd frontend && npm test` reported 45 files and 369 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0. Layout audit reported 60
  viewport/state checks, and quality audit reported `buildWarningCount=0`.

## P6

### P6-1 Review Analytics Timestamps

Status: Done

- Relationship suggestions persist UTC `created_at` and `updated_at`.
- Existing SQLite workspaces get relationship suggestion timestamp columns
  through migration/backfill.
- Relationship suggestion API responses include `created_at` and `updated_at`.
- Frontend `reviewOps` reports overdue pending suggestions and oldest pending
  age when valid timestamp evidence exists.
- Relationship review audit exports include `createdAt` and `updatedAt` per
  exported suggestion.
- P6-A established the timestamp foundation for P7-A backend analytics.
  Persisted time-series snapshots, named-user reviewer identity, and multi-user
  SLA ownership remain future reporting work.
- Verification:
  `cd backend && . .venv/bin/activate && pytest tests/test_storage.py tests/test_api.py::test_get_relationship_suggestions_maps_field_labels_for_project tests/test_api.py::test_get_relationship_suggestions_uses_none_for_missing_target -q`
  reported 11 passed;
  `cd frontend && npm test -- reviewOps.test.ts RelationshipReview.test.tsx --run`
  reported 2 files and 24 tests passed;
  `cd backend && . .venv/bin/activate && pytest -q` reported 241 passed;
  `cd backend && . .venv/bin/activate && ruff check graphmind tests` reported
  all checks passed;
  `cd frontend && npm test` reported 44 files and 332 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0.

## P7

### P7-1 Review Analytics Backend And SLA Trend View

Status: Done

- Project-scoped backend endpoint:
  `GET /api/projects/{project_id}/review-analytics?window=30d`.
- Workspace snapshot and incremental refresh responses include
  `review_analytics` for first load and state refresh.
- Workspace versioning includes relationship suggestion `updated_at`, so review
  decisions can refresh analytics consumers.
- Frontend API/state loads analytics from snapshot or the legacy fallback
  endpoint and refreshes analytics after review, duplicate cleanup, and import
  workflows.
- Relationship review renders a backend-backed SLA trend panel with the current
  window, SLA threshold, overdue pending count, oldest pending age, decision
  trend, evidence coverage, and pending aging buckets.
- Review audit JSON exports include the backend analytics payload.
- Verification:
  `cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_workspace_snapshot_endpoint_returns_first_load_payload tests/test_api.py::test_review_analytics_endpoint_reports_sla_trends_and_project_scope tests/test_api.py::test_review_analytics_endpoint_returns_404_for_missing_project -q`
  reported 3 passed;
  `cd frontend && npm test -- reviewOps.test.ts RelationshipReview.test.tsx InsightPanel.test.tsx --run`
  reported 3 files and 30 tests passed;
  `cd frontend && npm test -- Workspace.test.tsx App.test.tsx useWorkspaceBootstrap.test.tsx useImportActions.test.tsx useAiActions.test.tsx workspaceStore.test.ts apiClientImportBatch.test.ts useReviewActions.test.tsx --run`
  reported 8 files and 101 tests passed;
  `cd backend && . .venv/bin/activate && pytest -q` reported 243 passed;
  `cd backend && . .venv/bin/activate && ruff check graphmind tests` reported
  all checks passed;
  `cd frontend && npm test` reported 44 files and 335 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0. Layout audit summary reported
  `resultCount: 60`, `problemCount: 0`, `consoleIssueCount: 0`, and
  `unexpectedConsoleIssueCount: 0`; quality audit reported
  `buildWarningCount=0`.

### P7-2 Review Analytics Snapshots And Historical Movement

Status: Done

- Backend persists daily review analytics snapshots in
  `review_analytics_snapshots`, keyed by project, date, and analytics window.
- Trend endpoint:
  `GET /api/projects/{project_id}/review-analytics/trend?window=30d&days=14`.
- Trend requests upsert today's analytics snapshot and return snapshots within
  the requested historical range.
- Frontend API/state loads trend snapshots during legacy bootstrap and refreshes
  them after review, duplicate cleanup, and import workflows.
- Relationship review SLA panel displays snapshot count, overdue movement, and
  evidence coverage movement when at least two snapshots exist.
- Verification:
  `cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_workspace_snapshot_endpoint_returns_first_load_payload tests/test_api.py::test_review_analytics_endpoint_reports_sla_trends_and_project_scope tests/test_api.py::test_review_analytics_endpoint_returns_404_for_missing_project tests/test_api.py::test_review_analytics_trend_endpoint_persists_today_and_returns_snapshots tests/test_api.py::test_review_analytics_trend_endpoint_returns_404_for_missing_project tests/test_storage.py::test_initialize_database_creates_review_analytics_snapshot_table -q`
  reported 6 passed;
  `cd frontend && npm test -- apiClientImportBatch.test.ts workspaceStore.test.ts RelationshipReview.test.tsx InsightPanel.test.tsx useReviewActions.test.tsx useWorkspaceBootstrap.test.tsx useImportActions.test.tsx useAiActions.test.tsx --run`
  reported 8 files and 52 tests passed;
  `cd backend && . .venv/bin/activate && pytest -q` reported 246 passed;
  `cd backend && . .venv/bin/activate && ruff check graphmind tests` reported
  all checks passed;
  `cd frontend && npm test` reported 44 files and 337 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0. Layout audit summary reported
  `resultCount: 60`, `problemCount: 0`, `consoleIssueCount: 0`, and
  `unexpectedConsoleIssueCount: 0`; quality audit reported
  `buildWarningCount=0`.

### P7-3 Review Analytics Snapshot Hydration And Audit Export

Status: Done

- Workspace snapshot and delta responses include `review_analytics_trend`.
- Frontend snapshot and delta hydration merge `review_analytics_trend` into
  `reviewAnalyticsTrend`, while keeping the legacy trend endpoint fallback.
- Review audit JSON exports include `reviewAnalyticsTrend` beside current
  `reviewAnalytics`.
- Verification:
  `cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_workspace_snapshot_endpoint_returns_first_load_payload tests/test_api.py::test_review_analytics_endpoint_reports_sla_trends_and_project_scope tests/test_api.py::test_review_analytics_trend_endpoint_persists_today_and_returns_snapshots tests/test_storage.py::test_initialize_database_creates_review_analytics_snapshot_table -q`
  reported 4 passed;
  `cd frontend && npm test -- apiClientImportBatch.test.ts workspaceStore.test.ts reviewOps.test.ts RelationshipReview.test.tsx InsightPanel.test.tsx useReviewActions.test.tsx useWorkspaceBootstrap.test.tsx useImportActions.test.tsx useAiActions.test.tsx --run`
  reported 9 files and 58 tests passed;
  `cd backend && . .venv/bin/activate && pytest -q` reported 246 passed;
  `cd backend && . .venv/bin/activate && ruff check graphmind tests` reported
  all checks passed;
  `cd frontend && npm test` reported 44 files and 337 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0. Layout audit summary reported
  `resultCount: 60`, `problemCount: 0`, `consoleIssueCount: 0`, and
  `unexpectedConsoleIssueCount: 0`; quality audit reported
  `buildWarningCount=0`.

### P7-4 Review Analytics Snapshot Governance

Status: Done

- Backend snapshot governance endpoints:
  `GET /api/projects/{project_id}/review-analytics/snapshots` and
  `POST /api/projects/{project_id}/review-analytics/snapshots/cleanup`.
- Snapshot summary reports retention days, snapshot count, expired snapshot
  count, oldest snapshot date, and latest snapshot date.
- Cleanup deletes snapshots older than the selected retention cutoff and
  returns removed and remaining counts.
- Retention is explicit and conservative: accepted windows are 30, 90, 180,
  and 365 days; no background scheduler is introduced.
- Workspace snapshot and delta responses include
  `review_analytics_snapshot_summary`.
- Frontend API/state hydrates `reviewAnalyticsSnapshotSummary` from
  snapshot/delta and from the legacy fallback endpoint.
- Frontend refreshes snapshot governance after review decisions, duplicate
  cleanup, analytics snapshot cleanup, and import refresh flows.
- Relationship review SLA panel renders snapshot count, expired count,
  retention window, and a manual cleanup action.
- Verification:
  `cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_workspace_snapshot_endpoint_returns_first_load_payload tests/test_api.py::test_review_analytics_snapshot_summary_and_cleanup tests/test_api.py::test_review_analytics_snapshot_summary_returns_404_for_missing_project -q`
  reported 3 passed;
  `cd frontend && npm test -- workspaceStore.test.ts useWorkspaceBootstrap.test.tsx useReviewActions.test.tsx InsightPanel.test.tsx Workspace.test.tsx apiClientImportBatch.test.ts RelationshipReview.test.tsx --run`
  reported 7 files and 100 tests passed;
  `cd backend && . .venv/bin/activate && pytest -q` reported 248 passed;
  `cd backend && . .venv/bin/activate && ruff check graphmind tests` reported
  all checks passed;
  `cd frontend && npm test` reported 44 files and 341 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0. Layout audit summary reported
  `resultCount: 60`, `problemCount: 0`, `consoleIssueCount: 0`, and
  `unexpectedConsoleIssueCount: 0`; quality audit reported
  `buildWarningCount=0`.

### P7-5 Review Analytics SLA Trend Snapshot Chart

Status: Done

- Relationship review now renders a compact SLA trend snapshot chart when
  persisted review analytics trend data includes at least two snapshots.
- Each snapshot row exposes the snapshot date, overdue pending count, oldest
  pending age, and evidence coverage percentage as text, with visual meters as
  secondary cues.
- The chart reuses the existing `reviewAnalyticsTrend` payload and does not add
  new backend endpoints, chart dependencies, custom date ranges, or reviewer
  attribution.
- Verification:
  `cd frontend && npm test -- RelationshipReview.test.tsx --run` reported 1
  file and 23 tests passed;
  `cd frontend && npm test -- RelationshipReview.test.tsx AISettingsPanel.test.tsx App.test.tsx InsightPanel.test.tsx Workspace.test.tsx --run`
  reported 5 files and 117 tests passed;
  `cd frontend && npm test` reported 45 files and 366 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0. Layout audit reported 60
  viewport/state checks, and quality audit reported `buildWarningCount=0`.

### P7-6 Review Audit Trend Summary Export

Status: Done

- Review audit JSON exports now include a derived
  `reviewAnalyticsTrendSummary` beside the raw `reviewAnalyticsTrend` payload.
- The summary captures snapshot count, first/latest snapshot dates, overdue
  pending delta, oldest pending age delta, and evidence coverage delta so
  exported handoff reports are readable without manually comparing snapshots.
- The enhancement is frontend-only and reuses existing persisted trend data; it
  does not add backend endpoints, custom reporting windows, chart dependencies,
  named-user reviewer identity, or multi-user ownership.
- Verification:
  `cd frontend && npm test -- reviewOps.test.ts RelationshipReview.test.tsx --run`
  reported 2 files and 29 tests passed;
  `cd frontend && npm test -- reviewOps.test.ts RelationshipReview.test.tsx InsightPanel.test.tsx Workspace.test.tsx App.test.tsx --run`
  reported 5 files and 122 tests passed;
  `cd frontend && npm test` reported 45 files and 369 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0. Layout audit reported 60
  viewport/state checks, and quality audit reported `buildWarningCount=0`.

### P7-7 Review Analytics Trend Window Selection

Status: Done

- Frontend Review Analytics trend requests can now pass the backend-supported
  fixed `days` parameter instead of always using the 14 day default.
- The SLA trend panel exposes an accessible trend snapshot range selector for
  7, 14, 30, and 90 days when persisted trend data is available.
- The selected trend window is held in `App`, passed through `Workspace`,
  `InsightPanel`, `RelationshipReview`, `useReviewActions`, and
  `useImportActions`, and reused for review refreshes, cleanup refreshes,
  import refreshes, sample imports, batch/URL imports, and retry paths.
- Project data reset now clears review analytics trend, snapshot summary, and
  cleanup-event state together with current review analytics so stale SLA
  governance data cannot remain visible after a reset.
- The enhancement uses existing backend fixed windows only; arbitrary date
  ranges, multi-window comparison, named-user reviewer identity, and multi-user
  SLA ownership remain future reporting scope.
- Verification:
  `cd frontend && npm test -- useImportActions.test.tsx App.test.tsx apiClientImportBatch.test.ts RelationshipReview.test.tsx useReviewActions.test.tsx --run`
  reported 5 files and 82 tests passed;
  `cd frontend && npm test` reported 45 files and 373 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0. Layout audit reported 60
  viewport/state checks, and quality audit reported `buildWarningCount=0`.

### P7-8 Local-First Reviewer Attribution

Status: Done

- Relationship suggestions now persist optional `reviewed_by` attribution, with
  SQLite initialization/migration coverage for existing workspaces.
- Relationship review API requests accept `reviewed_by`, normalize blank input
  to no reviewer, and return `reviewed_by` in suggestion payloads.
- The review panel exposes an accessible reviewer input. The value is held in
  `App`, passed through the review panel, and submitted with accept/edit/reject
  relationship decisions.
- Review audit JSON exports include `reviewedBy` per visible suggestion, so
  local handoff reports can identify the human/operator label used for a
  decision.
- This is local-first attribution only. Named users, SSO-backed identities,
  multi-user SLA ownership, and organization audit logs remain hosted product
  scope.
- Verification:
  `cd backend && . .venv/bin/activate && pytest tests/test_storage.py::test_initialize_database_adds_relationship_suggestion_reviewer_column tests/test_graph_service.py::test_review_suggestion_updates_decision_status_and_note tests/test_graph_service.py::test_review_suggestion_records_reviewer_attribution tests/test_api.py::test_get_relationship_suggestions_maps_field_labels_for_project tests/test_api.py::test_project_review_relationship_suggestion_records_reviewer_attribution -q`
  reported 5 passed;
  `cd backend && . .venv/bin/activate && ruff check graphmind/storage/models.py graphmind/storage/database.py graphmind/services/graph_service.py graphmind/api/schemas.py graphmind/api/routes.py tests/test_storage.py tests/test_graph_service.py tests/test_api.py`
  reported all checks passed;
  `cd frontend && npm test -- apiClientImportBatch.test.ts useReviewActions.test.tsx reviewOps.test.ts RelationshipReview.test.tsx App.test.tsx --run`
  reported 5 files and 84 tests passed;
  `cd frontend && npm run lint` exited 0.

### P7-9 Review Audit Trend Context Export

Status: Done

- Review audit JSON exports now include `reviewAnalyticsTrendContext` beside
  the raw trend payload and derived delta summary.
- The context records the selected 7/14/30/90 day trend range, backend analytics
  window, snapshot count, and first/latest snapshot dates so handoffs can tell
  which fixed trend range the export represented.
- `RelationshipReview` passes the currently selected trend range into the audit
  report builder; the report falls back to the backend trend response days when
  a caller uses the builder directly.
- This keeps export polish inside the existing local-first JSON report. Custom
  date ranges, multi-window comparison, CSV/PDF/chart exports, and hosted report
  scheduling remain future reporting scope.
- Verification:
  `cd frontend && npm test -- reviewOps.test.ts RelationshipReview.test.tsx --run`
  reported 2 files and 29 tests passed;
  `cd frontend && npm test` reported 45 files and 380 tests passed;
  `cd frontend && npm run lint` and `cd frontend && npm run build` exited 0;
  `cd frontend && npm run audit:layout` reported 60 viewport/state checks;
  `cd frontend && npm run audit:quality` exited 0 with `buildWarningCount=0`.

## P8

### P8-1 Review Analytics Governance UX

Status: Done

- Frontend API cleanup accepts an optional retention window and sends
  `retention_days` to the existing backend cleanup endpoint.
- Review actions pass the selected retention window through cleanup and preserve
  post-cleanup graph/review/analytics refresh behavior.
- Relationship review SLA panel includes a retention selector with 30, 90, 180,
  and 365 day options.
- Snapshot cleanup produces accessible success feedback.
- Snapshot cleanup records a compact browser-local audit history with retention
  days, expired snapshot count, total snapshot count, and cleanup timestamp.
- Workspace and insight pass-through tests prove selected retention reaches the
  top-level cleanup handler.
- Verification:
  `cd frontend && npm test -- apiClientImportBatch.test.ts useReviewActions.test.tsx RelationshipReview.test.tsx InsightPanel.test.tsx Workspace.test.tsx --run`
  reported 5 files and 95 tests passed;
  `cd frontend && npm run lint` exited 0;
  `cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_review_analytics_snapshot_summary_and_cleanup tests/test_api.py::test_review_analytics_snapshot_summary_returns_404_for_missing_project -q`
  reported 2 passed;
  `cd backend && . .venv/bin/activate && pytest -q` reported 248 passed;
  `cd backend && . .venv/bin/activate && ruff check graphmind tests` reported
  all checks passed;
  `cd frontend && npm test` reported 44 files and 342 tests passed;
  `cd frontend && npm run build`, `cd frontend && npm run audit:quality`, and
  `cd frontend && npm run audit:layout` exited 0. Layout audit summary reported
  `resultCount: 60`, `problemCount: 0`, `consoleIssueCount: 0`, and
  `unexpectedConsoleIssueCount: 0`; quality audit reported
  `buildWarningCount=0`.

### P8-2 Review Analytics Cleanup Audit

Status: Done

- Backend persists manual snapshot cleanup events in
  `review_analytics_snapshot_cleanup_audits`.
- Cleanup audit events record project, retention days, cutoff date, removed
  snapshot count, remaining snapshot count, and creation time.
- `GET /api/projects/{project_id}/review-analytics/snapshots/cleanup-events`
  returns recent cleanup events newest first and 404s for missing projects.
- Workspace snapshot and delta responses include
  `review_analytics_snapshot_cleanup_events`; workspace version signatures now
  include analytics snapshots and cleanup audit rows.
- Frontend API/state loads cleanup events through snapshot hydration, legacy
  fallback, review refreshes, snapshot cleanup refreshes, and import refreshes.
- Relationship review SLA governance prefers backend cleanup history and keeps
  browser-local P8-A cleanup history as fallback.
- Verification:
  `cd backend && . .venv/bin/activate && pytest tests/test_storage.py::test_initialize_database_creates_review_analytics_cleanup_audit_table tests/test_api.py::test_review_analytics_snapshot_summary_and_cleanup tests/test_api.py::test_review_analytics_cleanup_events_returns_404_for_missing_project -q`
  reported 3 passed;
  `cd frontend && npm test -- apiClientImportBatch.test.ts workspaceStore.test.ts useWorkspaceBootstrap.test.tsx useReviewActions.test.tsx RelationshipReview.test.tsx --run`
  reported 5 files and 50 tests passed;
  `cd frontend && npm run lint` exited 0;
  `cd backend && . .venv/bin/activate && ruff check graphmind/api/routes.py graphmind/api/schemas.py graphmind/storage/models.py graphmind/storage/database.py tests/test_api.py tests/test_storage.py`
  reported all checks passed;
  `cd backend && . .venv/bin/activate && pytest tests/test_api_workspace_version_phase_p21.py::test_workspace_delta_returns_not_modified_for_matching_version tests/test_storage.py::test_initialize_database_creates_review_analytics_cleanup_audit_table tests/test_api.py::test_review_analytics_snapshot_summary_and_cleanup tests/test_api.py::test_review_analytics_cleanup_events_returns_404_for_missing_project -q`
  reported 4 passed;
  `cd backend && . .venv/bin/activate && pytest -q` reported 250 passed;
  `cd backend && . .venv/bin/activate && ruff check graphmind tests` reported
  all checks passed;
  `cd frontend && npm test` reported 44 files and 344 tests passed;
  `cd frontend && npm run build`, `cd frontend && npm run audit:quality`, and
  `cd frontend && npm run audit:layout` exited 0. Layout audit summary reported
  `resultCount: 60`, `problemCount: 0`, `consoleIssueCount: 0`, and
  `unexpectedConsoleIssueCount: 0`; quality audit reported
  `buildWarningCount=0`.

### P8-3 Review Analytics Retention Defaults

Status: Done

- Project settings now include `review_analytics.retention_days` and
  `review_analytics.auto_cleanup_enabled`.
- Retention values are normalized to the supported 30, 90, 180, and 365 day
  windows.
- Snapshot summary and manual cleanup use the project retention window when the
  request does not provide an explicit retention value.
- Review analytics trend hydration performs request-time cleanup when
  `auto_cleanup_enabled` is true and records the same cleanup audit event used
  by manual cleanup.
- The AI/settings dialog now includes review analytics governance controls for
  the default retention window and request-time cleanup.
- Frontend project settings are normalized at API/state and settings-dialog
  boundaries so older workspace snapshots or legacy settings payloads without
  `review_analytics` keep working with safe defaults.
- The layout audit script now exits explicitly after writing its report so CI
  cannot hang after a successful audit.
- Verification:
  `cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_project_settings_return_ai_vector_and_review_analytics_defaults tests/test_api.py::test_project_settings_can_be_saved_and_reloaded tests/test_api.py::test_project_settings_normalizes_review_analytics_retention tests/test_api.py::test_review_analytics_snapshot_summary_uses_project_retention_default tests/test_api.py::test_review_analytics_cleanup_uses_project_retention_default tests/test_api.py::test_review_analytics_auto_cleanup_runs_during_trend_hydration -q`
  reported 6 passed;
  `cd frontend && npm test -- apiClientImportBatch.test.ts ChatPanel.test.tsx App.test.tsx --run`
  reported 3 files and 58 tests passed;
  `cd frontend && npm run lint` exited 0;
  `cd backend && . .venv/bin/activate && ruff check graphmind/api/routes.py graphmind/api/schemas.py tests/test_api.py`
  reported all checks passed;
  `cd frontend && npm test -- workspaceStore.test.ts ChatPanel.test.tsx --run`
  reported 2 files and 17 tests passed for legacy settings compatibility;
  `cd frontend && npm test -- layoutAuditScript.test.js --run` reported 1 file
  and 4 tests passed for the layout-audit exit path;
  `cd backend && . .venv/bin/activate && pytest -q` reported 254 passed;
  `cd backend && . .venv/bin/activate && ruff check graphmind tests` reported
  all checks passed;
  `cd frontend && npm test` reported 44 files and 349 tests passed;
  `cd frontend && npm run lint` and `cd frontend && npm run build` exited 0;
  `cd frontend && npm run audit:layout` exited 0. Layout audit summary reported
  `resultCount: 60`, `problemCount: 0`, `consoleIssueCount: 0`, and
  `unexpectedConsoleIssueCount: 0`;
  `cd frontend && npm run audit:quality` exited 0 and reported
  `buildWarningCount=0`.

### P8-4 Review Analytics Cleanup Execution Mode Copy

Status: Done

- The AI/settings dialog now explains the cleanup execution mode beside the
  review analytics auto-cleanup toggle.
- When request-time cleanup is disabled, the settings dialog tells operators
  that expired snapshots can still be cleaned manually from SLA trend analytics.
- When request-time cleanup is enabled, the settings dialog clarifies that
  expired snapshots are checked and cleaned the next time trend data loads or
  refreshes.
- This closes an operations ambiguity without introducing background cron,
  scheduler infrastructure, or hidden cleanup workers.
- Verification:
  `cd frontend && npm test -- AISettingsPanel.test.tsx App.test.tsx --run`
  reported 2 files and 32 tests passed;
  `cd frontend && npm test -- AISettingsPanel.test.tsx App.test.tsx RelationshipReview.test.tsx InsightPanel.test.tsx Workspace.test.tsx --run`
  reported 5 files and 118 tests passed;
  `cd frontend && npm test` reported 45 files and 367 tests passed;
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `cd frontend && npm run audit:layout`, and
  `cd frontend && npm run audit:quality` exited 0. Layout audit reported 60
  viewport/state checks, and quality audit reported `buildWarningCount=0`.

### P8-5 Review Analytics Maintenance Command

Status: Done

- Review analytics snapshot retention logic now lives in a reusable backend
  maintenance service instead of only inside API route helpers.
- The shared service normalizes retention windows, reads project-level retention
  defaults, performs per-project cleanup, records cleanup audit events, and
  supports dry-run summaries without deleting snapshots or writing audit rows.
- `graphmind-review-analytics-maintenance` provides a local/private deployment
  command entry point with `--workspace-root`, optional `--project-id`, optional
  `--retention-days`, and `--dry-run`.
- API manual cleanup and request-time cleanup continue to return the existing
  response shape while using the same service path as the maintenance command.
- This provides an operator-callable hook for cron, container jobs, or platform
  schedulers. Hosted managed scheduling, distributed job orchestration,
  organization audit logs, and named-user ownership remain future hosted scope.
- Verification:
  `cd backend && . .venv/bin/activate && pytest tests/test_review_analytics_maintenance.py tests/test_api.py::test_review_analytics_snapshot_summary_uses_project_retention_default tests/test_api.py::test_review_analytics_cleanup_uses_project_retention_default tests/test_api.py::test_review_analytics_auto_cleanup_runs_during_trend_hydration -q`
  reported 8 passed;
  `cd backend && . .venv/bin/activate && pytest tests/test_url_import_phase_60.py -q`
  reported 16 passed after the deterministic port/network safety regression
  fix;
  `cd backend && . .venv/bin/activate && pytest -q` reported 263 passed;
  `cd backend && . .venv/bin/activate && ruff check graphmind tests` reported
  all checks passed;
  `cd backend && . .venv/bin/activate && python -m graphmind.workers.review_analytics_maintenance --help`
  exited 0 and listed `--workspace-root`, `--project-id`, `--retention-days`,
  and `--dry-run`.

### P8-6 Review Audit Snapshot Governance Context Export

Status: Done

- Review audit JSON exports now include `reviewAnalyticsSnapshotContext` when
  snapshot governance state is available.
- The context captures retention days, total snapshot count, expired snapshot
  count, oldest/latest snapshot dates, and the latest backend cleanup audit
  event in a handoff-friendly camelCase shape.
- `RelationshipReview` passes the hydrated snapshot summary and cleanup events
  into `buildReviewAuditReport`; the builder keeps the field `null` when
  snapshot governance data is not loaded.
- This improves operations handoff without adding backend endpoints, scheduler
  infrastructure, hosted organization audit logs, or richer chart/export
  formats.
- Verification:
  `cd frontend && npm test -- reviewOps.test.ts RelationshipReview.test.tsx --run`
  reported 2 files and 29 tests passed;
  `cd frontend && npm test` reported 45 files and 380 tests passed;
  `cd frontend && npm run lint` and `cd frontend && npm run build` exited 0;
  `cd frontend && npm run audit:layout` reported 60 viewport/state checks;
  `cd frontend && npm run audit:quality` exited 0 with `buildWarningCount=0`.

### P8-7 Deployment Ops Review Analytics Maintenance Command

Status: Done

- `deploy/graphmind-ops.py` now exposes
  `review-analytics-maintenance` as an operator-facing deployment command.
- The command accepts `--workspace-root`, optional `--project-id`, optional
  `--retention-days`, and `--dry-run`, then returns JSON with status, project
  count, total removed/remaining snapshots, and per-project cutoff details.
- The command reuses the shared review analytics maintenance service, so dry
  runs avoid mutation while applied runs delete expired snapshots and write the
  same cleanup audit rows as API/manual cleanup paths.
- Deployment security docs and the release checklist now use the ops helper as
  the primary private deployment entry point while preserving the backend worker
  module as the container/virtualenv equivalent.
- Verification:
  `cd backend && . .venv/bin/activate && pytest tests/test_deployment_ops_phase_p4.py -q`
  reported 8 passed;
  `cd backend && . .venv/bin/activate && pytest tests/test_review_analytics_maintenance.py -q`
  reported 5 passed;
  `cd backend && . .venv/bin/activate && pytest -q` reported 265 passed;
  `cd backend && . .venv/bin/activate && ruff check graphmind tests ../deploy/graphmind-ops.py`
  reported all checks passed;
  `python3 deploy/graphmind-ops.py --help` exited 0 without requiring backend
  SQLAlchemy dependencies outside the virtualenv.

### P8-8 Deployment Ops Maintenance Env File Support

Status: Done

- `deploy/graphmind-ops.py review-analytics-maintenance` now accepts
  `--env-file` and reads `GRAPHMIND_WORKSPACE_ROOT` from the deployment
  environment file.
- `--workspace-root` remains available and takes precedence over the env file,
  making temporary validation workspaces explicit.
- Missing workspace configuration returns a JSON error instead of relying on an
  argparse-required flag, so automation receives a consistent machine-readable
  failure shape.
- Deployment security docs and the release checklist now use
  `--env-file deploy/.env.production --dry-run` as the primary private
  deployment maintenance command.
- Verification:
  `cd backend && . .venv/bin/activate && pytest tests/test_deployment_ops_phase_p4.py -q`
  reported 10 passed;
  `cd backend && . .venv/bin/activate && pytest tests/test_review_analytics_maintenance.py -q`
  reported 5 passed;
  `cd backend && . .venv/bin/activate && pytest -q` reported 267 passed;
  `cd backend && . .venv/bin/activate && ruff check graphmind tests ../deploy/graphmind-ops.py`
  reported all checks passed;
  `python3 deploy/graphmind-ops.py review-analytics-maintenance --help`
  exited 0 and listed `--env-file`, `--workspace-root`, `--project-id`,
  `--retention-days`, and `--dry-run`.

### P8-9 Deployment Ops Maintenance Env File Error Handling

Status: Done

- `deploy/graphmind-ops.py review-analytics-maintenance` now returns a
  machine-readable JSON failure when neither `--workspace-root` nor an env-file
  `GRAPHMIND_WORKSPACE_ROOT` value is available.
- Missing or unreadable `--env-file` paths also return JSON failures instead of
  empty stdout plus a traceback, so release automation can consume one stable
  failure shape.
- Existing explicit `--workspace-root` precedence and successful env-file
  workspace loading remain unchanged.
- Verification:
  `cd backend && . .venv/bin/activate && pytest tests/test_deployment_ops_phase_p4.py -q`
  reported 13 passed;
  `cd backend && . .venv/bin/activate && ruff check ../deploy/graphmind-ops.py tests/test_deployment_ops_phase_p4.py`
  reported all checks passed.

## P9

### P9-1 Searchable Guided Repair Help

Status: Done

- The import workbench now includes a compact `帮助与修复` panel inside the
  actual data-import workflow.
- Help topics are local-first and searchable, covering failed imports, URL
  safety checks, first-graph templates/project presets, and graph quality
  governance.
- The panel prioritizes context-aware topics when failed import tasks, URL
  safety signals, pending/high-priority relationships, or duplicate governance
  work are present.
- Search filters help topics by local keywords such as `allowlist`, URL,
  preset, failed, and quality without adding a backend docs service.
- This closes the first local searchable-help slice. Deeper guided repair
  automation, automatic preset application, or hosted documentation telemetry
  remain future governed scope.
- Verification:
  `cd frontend && npm test -- ImportPanel.test.tsx --run` reported 26 passed;
  `cd frontend && npm test -- ImportPanel.test.tsx ImportTaskListCard.test.tsx ImportHealthPanel.test.tsx --run`
  reported 3 files and 34 tests passed;
  `cd frontend && npm test -- i18n.test.tsx --run` reported 1 file and 3 tests
  passed;
  `cd frontend && npm test` reported 45 files and 376 tests passed;
  `cd frontend && npm run lint` and `cd frontend && npm run build` exited 0;
  `cd frontend && npm run audit:layout` reported 60 viewport/state checks;
  `cd frontend && npm run audit:quality` exited 0 with `buildWarningCount=0`.

### P9-2 Guided Repair Help Actions

Status: Done

- Searchable help topics now include action buttons for safe existing workflows:
  failed-import help opens the failed import task focus flow, and quality
  governance help opens the pending review queue.
- Help action accessible names are distinct from import health metric actions,
  so global button queries and assistive navigation remain unambiguous.
- The actions do not mutate data, apply presets, or perform bulk remediation;
  they route operators into already-governed manual review and retry paths.
- Verification:
  `cd frontend && npm test -- ImportPanel.test.tsx ImportTaskListCard.test.tsx ImportHealthPanel.test.tsx --run`
  reported 3 files and 35 tests passed;
  `cd frontend && npm test -- i18n.test.tsx --run` reported 1 file and 3 tests
  passed;
  `cd frontend && npm test` reported 45 files and 377 tests passed;
  `cd frontend && npm run lint` and `cd frontend && npm run build` exited 0;
  `cd frontend && npm run audit:layout` reported 60 viewport/state checks;
  `cd frontend && npm run audit:quality` exited 0 with `buildWarningCount=0`.

### P9-3 URL Safety Help Focus Action

Status: Done

- URL safety help now includes a safe action that focuses the existing URL
  input so operators can repair or replace the source URL in place.
- The focus action uses a parent-owned request signal from `ImportPanel` into
  `ImportIntakeControls`; it does not submit imports, bypass URL safety checks,
  change allowlists, or mutate project settings.
- URL help remains visible when URL import tasks or URL safety diagnostics are
  present.
- Verification:
  `cd frontend && npm test -- ImportPanel.test.tsx ImportTaskListCard.test.tsx ImportHealthPanel.test.tsx --run`
  reported 3 files and 36 tests passed;
  `cd frontend && npm test` reported 45 files and 378 tests passed;
  `cd frontend && npm run lint` and `cd frontend && npm run build` exited 0;
  `cd frontend && npm run audit:layout` reported 60 viewport/state checks;
  `cd frontend && npm run audit:quality` exited 0 with `buildWarningCount=0`.

### P9-4 First-Graph Preset Help Settings Action

Status: Done

- First-graph/project preset help now includes a safe action that opens the
  existing AI and vector settings dialog from the data-import workflow.
- The action is wired through `ImportHelpPanel` -> `ImportPanel` -> `Workspace`
  so the help surface only expresses intent while the workbench owns modal
  routing.
- Opening settings from the import dialog closes the data-import modal first,
  avoiding stacked modal traps and preserving the existing settings save flow.
- The action does not import sample data, upload files, apply a preset, save
  settings, or replace API keys; users still explicitly import/apply/save
  presets inside the settings dialog.
- Verification:
  `cd frontend && npm test -- ImportPanel.test.tsx Workspace.test.tsx --run`
  reported 2 files and 84 tests passed;
  `cd frontend && npm test` reported 45 files and 380 tests passed;
  `cd frontend && npm run lint` and `cd frontend && npm run build` exited 0;
  `cd frontend && npm run audit:layout` reported 60 viewport/state checks;
  `cd frontend && npm run audit:quality` exited 0 with `buildWarningCount=0`.

## Final Verification

- Backend: `pytest -q`
- Backend lint: `ruff check graphmind tests`
- Frontend tests: `npm test`
- Frontend type/build: `npm run lint`, `npm run build`
- Frontend layout: `npm run audit:layout`
- Frontend quality: `npm run audit:quality`
