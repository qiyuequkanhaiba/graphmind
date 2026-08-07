# P5 Review Ops And Quality Command Center Design

## Goal

Turn the confirmed P5-A direction into a shippable operational layer for GraphMind:
review teams can understand the current review workload, keep their preferred
review view, export a handoff-ready audit report, and see how this fits into the
remaining onboarding, recovery, performance, and hosted scale-out roadmap.

## Confirmed Scope

P5-A is the implementation track for this phase. It does not repeat the completed
Phase 52-59 evidence navigation, extracted labels, import diagnostics, internal
anchor hiding, multi-source quality panel, or evidence source navigation work.

This phase implements:

- Review operations summary in the relationship review panel.
- Saved review filter preference for analyst workflows.
- Exportable JSON review and quality report.
- Graph quality command center copy and handoff context that uses existing
  graph, suggestion, and governance data.
- Documentation updates for onboarding/recovery, performance budget discipline,
  and hosted scale-out pre-research.

This phase does not implement:

- Historical review aging, accepted/rejected trend history, or SLA tracking.
  Relationship suggestions do not currently expose durable created/updated
  timestamps in the public frontend type, so time-based metrics are documented
  as a future backend schema/API project.
- Named users, SSO, organization tenancy, distributed rate limiting, or managed
  queues. Those remain hosted scale-out projects after private-team deployment
  needs exceed the P4 baseline.
- New animation systems. Existing GSAP motion helpers, reduced-motion behavior,
  and quality gates remain the standard.

## User Experience

The review tab remains a dense operational work surface, not a landing page.
Above the filter buttons, the panel shows a compact summary:

- total, pending, high-priority, low-quality, duplicate, accepted, rejected, and
  edited counts
- evidence coverage among relationship suggestions
- a short recommended next action based on the strongest current risk

The existing filter bar continues to provide all, pending, high-priority, and
duplicate views. When a user changes the filter, GraphMind stores it in
`localStorage` and restores it on the next render unless a parent shortcut
explicitly requests a filter. Storage failures do not break the review panel.

The review toolbar adds a report export action. The exported JSON contains:

- schema name and generated timestamp
- active filter and visible suggestion ids
- operations summary and governance summary
- every visible suggestion with status, priority, quality, confidence, evidence
  summary, evidence payload, and quality reasons

The report is intended for handoff and release review, not as an import format.

## Architecture

Add a focused frontend helper module, `frontend/src/components/reviewOps.ts`, for
pure calculations:

- `buildReviewOperationsSummary(...)`
- `buildReviewAuditReport(...)`
- `filterRelationshipSuggestions(...)`
- `readStoredReviewFilter(...)`
- `persistReviewFilter(...)`

`RelationshipReview` imports those helpers, renders the summary, persists filter
changes, and triggers the export download. This keeps JSX focused on interaction
and makes the metrics independently testable.

`InsightPanel` keeps the existing graph quality operations region and passes
review shortcuts through `initialFilter`. `RelationshipReview` treats shortcut
changes as explicit navigation and still persists the resulting active filter.

## Data Flow

Relationship suggestions and governance summary already flow into
`RelationshipReview`. P5-A does not add backend calls. The report is generated
from the current in-memory props, so it reflects the same review state the user
is seeing.

For evidence coverage, a suggestion counts as covered when it has a non-empty
`evidence_summary` or any non-empty `evidence_payload` keys. This matches the
current public suggestion contract and avoids relying on unavailable raw
evidence refs.

## Error Handling

- Invalid or unavailable `localStorage` falls back to `all`.
- Duplicate filters are disabled when no duplicate suggestion ids exist.
- Export uses a JSON data blob and revokes the object URL after clicking the
  temporary download link.
- If the browser lacks `URL.createObjectURL`, the export button remains visible
  but the handler returns without throwing.
- Missing governance summary is treated as zero duplicate groups.

## Testing

Add focused tests for:

- operations summary counts, evidence coverage, and recommended next action
- audit report shape and active filter payload
- stored review filter restore and invalid-storage fallback
- `RelationshipReview` persistence when a user changes filters
- export button creating a JSON download

Run targeted frontend tests, then lint/build and the existing quality gates used
by productization work.

## Documentation And Acceptance

Update productization documentation to mark P5-A as the next completed
productization layer and to keep future work explicit:

- onboarding/recovery remains first-graph templates, import empty states, and
  recovery playbooks
- performance remains bundle budget, lazy-loading, layout audit, and GSAP
  reduced-motion discipline
- hosted scale-out remains named users/SSO/org tenancy/audit logs/distributed
  rate limiting/managed queue pre-research

## Self-Review

No placeholders remain. The design uses current public frontend data, separates
implemented P5-A behavior from future hosted/time-series projects, and keeps the
scope small enough for a single implementation plan.
