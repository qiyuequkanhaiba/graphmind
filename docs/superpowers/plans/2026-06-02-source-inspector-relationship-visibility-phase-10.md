# Source Inspector Relationship Visibility Phase 10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make long document chunks and extracted document relationships easier to inspect in the existing Data Explorer source inspector.

**Architecture:** Keep API contracts unchanged and update only the frontend source inspector rendering. Use existing `DocumentChunk` and `ExtractedRelationship` fields to show chunk refs/token ranges, more than three chunks, relationship evidence summaries, relationship source refs, and rule metadata for `maps_to` and `co_occurs_with`.

**Tech Stack:** React, TypeScript, existing i18n messages, Vitest, Testing Library, Vite.

---

## File Structure

- Modify: `frontend/src/components/workbench/DataExplorerPanel.tsx`
  - Render up to six source chunks.
  - Display each chunk source ref and token range when metadata includes `token_start` and `token_end`.
  - Display relationship evidence summary, source ref, and extraction rule.
- Modify: `frontend/src/i18n/messages.ts`
  - Add labels for chunk source refs, token ranges, relationship evidence, source refs, and extraction rule.
- Modify: `frontend/src/styles/app.css`
  - Add compact source inspector metadata styles.
- Modify: `frontend/tests/DataExplorerPanel.test.tsx`
  - Add expectations for long chunk visibility and extracted relationship evidence.

## Task 1: Source Inspector Chunk and Relationship Details

**Files:**
- Modify: `frontend/tests/DataExplorerPanel.test.tsx`
- Modify: `frontend/src/components/workbench/DataExplorerPanel.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/styles/app.css`

- [x] **Step 1: Write failing frontend test**

Update the source inspector test fixtures with four chunks and a `maps_to` relationship. Assert that:

- chunk 4 content appears
- `identity-runbook.txt#chunk-4` appears
- `Tokens 720-960` appears in English or the localized equivalent appears in the default language
- `Customer ID -> customerId` appears
- relationship evidence summary appears
- extraction rule `field_mapping_phrase` appears

- [x] **Step 2: Run frontend test to verify it fails**

Run: `cd frontend && npm test -- DataExplorerPanel.test.tsx --run`

Expected: FAIL because the current inspector only renders three chunks and does not render relationship evidence/source metadata.

- [x] **Step 3: Implement source inspector rendering**

In `DataExplorerPanel.tsx`:

- Change `chunks.slice(0, 3)` to render six chunks.
- Add `formatChunkMeta(chunk, t)` using `chunk.source_ref`, `chunk.metadata.token_start`, and `chunk.metadata.token_end`.
- Add `relationship.evidence_summary`, first `source_refs` value, and `relationship.evidence_payload.rule` below each relationship row.

- [x] **Step 4: Add i18n labels and CSS**

In `messages.ts`, add keys:

- `data.source.chunkSource`
- `data.source.chunkTokens`
- `data.source.relationshipEvidence`
- `data.source.relationshipRule`
- `data.source.relationshipSource`

In `app.css`, add compact metadata styling under `.inspection-list`.

- [x] **Step 5: Run frontend test to verify it passes**

Run: `cd frontend && npm test -- DataExplorerPanel.test.tsx --run`

Expected: PASS.

## Task 2: Verification

**Files:**
- All modified frontend files.

- [x] **Step 1: Run focused frontend tests**

Run: `cd frontend && npm test -- DataExplorerPanel.test.tsx Workspace.test.tsx App.test.tsx --run`

Expected: PASS.

- [x] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`

Expected: PASS.

- [x] **Step 3: Run backend smoke to confirm Phase 9 parser remains stable**

Run: `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py tests/test_source_entity_inspection_api_phase_5.py -q`

Expected: PASS.

- [x] **Step 4: Run lint checks**

Run: `cd backend && .venv/bin/ruff check graphmind tests`

Expected: PASS.

## Self-Review

- Spec coverage: The plan makes Phase 9 chunking and relationship quality visible without changing backend API shapes.
- Placeholder scan: No placeholder-only tasks remain.
- Type consistency: Uses existing `DocumentChunk.metadata` and `ExtractedRelationship.evidence_payload` fields.
