# GraphMind P3 Productization Implementation Tracker

Last updated: 2026-06-07

## Status Legend

- Not started: no code or tests written.
- In progress: tests or implementation started.
- Verifying: implementation exists and verification is running.
- Done: implementation and listed verification passed.

## P3-1 CI And Release Gates

Status: Done

- Add CI workflow for backend tests and lint.
- Add CI workflow for frontend tests, type check, build, layout audit, and quality audit.
- Persist layout audit JSON/screenshots and frontend build output as artifacts.
- Add release checklist that maps release sign-off to commands and artifacts.
- Verification: `cd frontend && npm test -- releaseGates.test.js`

## P3-7 Dependency Review Gate

Status: Done

- Add a PR-only `dependency-review` job to `.github/workflows/productization-gates.yml`.
- Fail dependency changes on high or critical known vulnerabilities through
  `actions/dependency-review-action`.
- Add release checklist coverage for dependency review, with explicit attention
  on frontend animation, 3D, and import-related packages.
- Verification:
  `cd frontend && npm test -- releaseGates.test.js --run` reported 1 file and
  2 tests passed; Ruby YAML parsing confirmed
  `.github/workflows/productization-gates.yml` contains the dependency review
  job; `cd frontend && npm test` reported 44 files and 354 tests passed.

## P3-2 Performance Budget And Bundle Governance

Status: Done

- Add explicit budgets for initial JS, largest async JS chunk, CSS, and warning allowance.
- Extend `audit:quality` to report measured bundle assets and enforce the new budgets.
- Keep 3D graph as a separate async chunk and document the current warning as governed, not ignored.
- Verification: `cd frontend && npm test -- layoutAuditScript.test.js`; `cd frontend && npm run build`; `cd frontend && npm run audit:quality`

## P3-3 URL Import Governance

Status: Done

- Add configurable URL host allowlist and denylist.
- Add configurable per-process URL import quota.
- Add URL safety diagnostics for accepted and rejected imports.
- Preserve SSRF protections: protocol, credentials, DNS/private network blocking, redirects, port, size, timeout, and content type.
- Improve static HTML extraction with a standard-library parser that ignores
  page chrome and preserves main/article content without adding dependencies.
- Verification: `cd backend && . .venv/bin/activate && pytest tests/test_url_import_phase_60.py -q` reported 16 passed; `cd backend && . .venv/bin/activate && ruff check graphmind/services/url_import.py tests/test_url_import_phase_60.py` reported all checks passed.

## P3-4 Layout Audit Noise Governance

Status: Done

- Capture browser console warnings/errors in `audit:layout`.
- Add explicit allowlist for known React Flow container warnings.
- Fail layout audit on unexpected console errors or warnings.
- Include console issue counts in `layout-audit-summary.json`.
- Verification: `cd frontend && npm test -- layoutAuditScript.test.js`; `cd frontend && npm run audit:layout`; `cd frontend && npm run audit:quality`.

## P3-5 User Onboarding And Recovery

Status: Done

- Add first-graph templates for spreadsheet, document, code repository, and URL source use cases.
- Improve empty and recovery states without turning the workbench into a landing page.
- Add actionable recovery playbooks for failed imports, URL safety rejection, and low-confidence relationships.
- Verification: `cd frontend && npm test -- ImportIntakeControls.test.tsx ImportPanel.test.tsx RelationshipReview.test.tsx GraphCanvas.test.tsx`

## P3-6 Graph Quality Operations

Status: Done

- Add graph quality summary metrics: isolated nodes, weak evidence relationships, pending reviews, duplicate groups, and evidence coverage.
- Surface quality operations in the workbench without cluttering the graph canvas.
- Add saved review/quality filters where local state is sufficient.
- Verification: `cd frontend && npm test -- workbenchStats.test.ts InsightPanel.test.tsx`

## Final P3 Verification

- Backend URL governance: `cd backend && . .venv/bin/activate && pytest tests/test_url_import_phase_60.py -q` — Passed, 15 tests.
- Backend full suite: `cd backend && . .venv/bin/activate && pytest -q` — Passed, 190 tests.
- Backend lint: `cd backend && . .venv/bin/activate && ruff check graphmind tests` — Passed.
- Frontend tests: `cd frontend && npm test` — Passed, 43 files and 315 tests.
- Frontend type check: `cd frontend && npm run lint` — Passed.
- Frontend build: `cd frontend && npm run build` — Passed without large chunk warnings after vendor chunk splitting.
- Frontend layout audit: `cd frontend && npm run audit:layout` — Passed, 60 viewport/state checks; `problemCount=0`, `unexpectedConsoleIssueCount=0`.
- Frontend quality audit: `cd frontend && npm run audit:quality` — Passed; latest budget requires `buildWarningCount=0`.
