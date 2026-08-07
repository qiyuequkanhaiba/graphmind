# Phase 55: Hide Internal Anchor Resources

## Goal

Hide internal extracted-relationship anchor tables and fields from the regular data resource tree while keeping review suggestions and evidence flows visible.

## Plan

- [x] Add regression coverage for internal `Extracted entities` table/field nodes.
- [x] Keep extracted relationship review suggestions visible even when their anchor fields are hidden.
- [x] Filter internal anchor nodes in `buildWorkbenchTree`.
- [x] Support future explicit metadata flags such as `import_status: "internal"` or `source_kind: "extracted_relationship_anchor"`.
- [x] Preserve compatibility with current generated labels/source refs such as `Extracted entities.entity_3` and `extracted_entities_42.entity_3`.
- [x] Run workbench/DataExplorer/Workspace/review checks and frontend build.

## Expected Outcome

The normal data tree no longer exposes implementation-only resources such as `Extracted entities` or `Extracted entities.entity_*`. Users still see extracted relationship suggestions with user-facing labels in the review queue and evidence surfaces.

## Verification

- `cd frontend && npm test -- workbenchStats.test.ts --run`
- `cd frontend && npm test -- workbenchStats.test.ts DataExplorerPanel.test.tsx Workspace.test.tsx RelationshipReview.test.tsx RelationshipModelingCard.test.tsx --run`
- `cd frontend && npm run build`

## Follow-Up

The current frontend filter handles both future explicit metadata flags and the current stable generated naming pattern. A later backend cleanup can add `internal: true` or `import_status: "internal"` to graph node metadata for these anchors.
