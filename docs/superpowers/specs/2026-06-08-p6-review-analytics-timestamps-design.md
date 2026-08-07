# P6 Review Analytics Timestamps Design

## Goal

Build the time dimension needed for review analytics without jumping into a full
reporting system. Relationship suggestions should expose durable `created_at`
and `updated_at` timestamps, and the review operations panel should use those
timestamps to show aging risk for pending review work.

## Confirmed Scope

This is P6-A: review analytics and timestamp infrastructure.

This phase implements:

- `created_at` and `updated_at` on relationship suggestions in storage.
- SQLite migration/backfill for existing workspaces.
- API response fields for relationship suggestion timestamps.
- Frontend relationship suggestion types with timestamp fields.
- Review operations summary fields for old pending suggestions and the oldest
  pending age.
- JSON audit report timestamp fields for every exported suggestion.
- Documentation and tracker updates for P6.

This phase does not implement:

- Trend charts, SLA dashboards, or multi-user reviewer attribution.
- A backend analytics endpoint for historical rollups.
- Hosted identity, organization tenancy, SSO, or distributed reporting jobs.

## User Experience

The existing P5 review operations summary remains compact. P6 adds one more
operational signal:

- If pending suggestions have timestamps, show how many are older than the aging
  threshold and the age of the oldest pending suggestion.
- If timestamp data is unavailable, avoid showing misleading aging numbers.

The recommended next action can prioritize aging review work after low-quality,
duplicate, and high-priority risks. This keeps the immediate risk hierarchy
familiar while still surfacing stalled work.

## Data Model

`RelationshipSuggestion` gains:

- `created_at: datetime`
- `updated_at: datetime`

Both use the existing `UTCDateTime` type. New rows get UTC timestamps by default.
Updates to review decisions refresh `updated_at` through SQLAlchemy `onupdate`.

Existing SQLite databases are migrated by checking
`PRAGMA table_info(relationship_suggestions)`. Missing columns are added and
backfilled with `CURRENT_TIMESTAMP`. Backfilled timestamps are not perfect
historical evidence; they are a compatibility baseline so older workspaces
continue to load and future updates have durable timestamps.

## API Contract

`RelationshipSuggestionResponse` adds:

- `created_at: str`
- `updated_at: str`

The values are ISO-8601 strings from UTC-aware datetimes. Existing clients can
ignore them; P6 frontend code uses them for aging metrics and audit export.

## Frontend Analytics

`reviewOps` keeps the analytics pure and testable:

- pending suggestions older than seven days count as aged
- oldest pending age is computed in whole days
- invalid or missing timestamps are ignored for aging calculations
- audit exports include `createdAt` and `updatedAt`

The threshold stays local for now because this phase is infrastructure, not
admin policy management.

## Error Handling

- Existing workspaces with old schemas are migrated during database
  initialization.
- Missing frontend timestamps do not crash analytics.
- Future timestamps are clamped to zero-day age for display.
- Audit export keeps timestamp values nullable if older API mocks or external
  clients omit them.

## Testing

Backend:

- Storage test for relationship suggestion UTC-aware timestamps and `updated_at`
  refresh after review.
- Migration test for an old relationship suggestion table gaining timestamp
  columns.
- API test that relationship suggestion responses include timestamp strings.

Frontend:

- `reviewOps` tests for aged pending count, oldest pending age, missing timestamp
  fallback, and audit report timestamp fields.
- `RelationshipReview` test for the aging metric in the operations summary.

## Self-Review

No placeholders remain. The scope is limited to durable timestamps and first-use
review aging analytics; trend history, SLA policy, and hosted analytics remain
future phases.
