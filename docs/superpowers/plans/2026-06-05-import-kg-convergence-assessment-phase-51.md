# Phase 51: Import Knowledge Graph Convergence Assessment

## Goal

Assess the current multi-format import pipeline after Phases 46-50 and identify the next implementation steps for making imported files produce a complete, reviewable, evidence-backed relationship knowledge graph.

## Current End-to-End Capability

The project now has a coherent multi-source import foundation:

- Multi-file CSV/XLSX/JSON table imports create datasets, profiles, relationship suggestions, graph nodes, and graph edges.
- Markdown, text, JSON-document, logs, code files, DOCX, PDF, and ZIP code repositories are parsed into sources, chunks, extracted entities, extracted relationships, graph nodes, and graph edges.
- Code repository ZIP imports ignore unsafe paths, dependency/build folders, oversized files, binary files, and unsupported files.
- Batch and item summaries include structured diagnostics for document count, repository file count, ignored file count, chunk count, entity count, relationship count, graph node count, graph edge count, and source-kind counts.
- Extracted document/code/log relationships are promoted into pending `RelationshipSuggestion` rows through internal extracted-entity anchor fields, preserving the existing frontend review contract.
- Evidence references are normalized through `evidence_refs` while keeping legacy `evidence_ref` compatibility.
- Relationship quality scoring now accounts for extracted relationship sources, multi-source evidence, and multiple evidence refs.

## Remaining UX And Architecture Gaps

Priority gaps:

1. Import diagnostics are available in backend summaries but are not yet rendered in the import task UI.
   - `ImportTaskListCard` displays stage text, progress, and retry actions, but not structured diagnostics.
   - Good next step: show compact diagnostics under parsed/extracted stages and batch item rows.

2. Graph/evidence navigation still mostly resolves through legacy single `evidence_ref`.
   - `Workspace.findEdgeByEvidenceReference()` and graph action matching primarily compare `edge.evidence_ref`.
   - Good next step: match against `edge.evidence_refs` as well, then source chunks.

3. Internal extracted-relationship anchor fields are visible as review labels.
   - This keeps the frontend schema stable, but labels like `Extracted entities.entity_1` are not ideal for users.
   - Good next step: return friendlier labels for suggestions whose payload has `source_kind == "extracted_relationship"`, using extracted entity names.

4. Internal anchor dataset should stay hidden from user-facing resource trees.
   - It is marked `import_status="internal"` and should not count as imported data, but graph field nodes or review labels can still expose internals indirectly.
   - Good next step: hide anchor fields from normal resource tree sections and surface them only in source inspection/review context.

5. EvidenceInspector does not yet render `evidence_refs` as navigable source refs.
   - It shows the single ref and payload rows, but not a compact list of evidence refs with source/chunk affordances.
   - Good next step: render canonical refs and wire click behavior to source inspection.

## Recommended Next Phases

1. Phase 52: Evidence-ref navigation upgrade.
   - Match selected evidence against `edge.evidence_refs`.
   - Add helper to find source/chunk by evidence ref.
   - Allow EvidenceInspector/DataExplorer source inspection focus from evidence refs.
   - Why first: unlocks the value of Phase 49 and makes evidence-backed graphs feel connected.

2. Phase 53: User-facing labels for extracted relationship suggestions.
   - Replace internal anchor labels in API responses with extracted source/target entity names when applicable.
   - Preserve field IDs internally.
   - Why second: improves review queue readability without schema churn.

3. Phase 54: Import diagnostics UI.
   - Render `diagnostics` compactly in task stages and source rows.
   - Include ignored repository file count, chunks, entities, relationships, and graph artifacts.
   - Why third: users can understand what happened during large multi-file imports.

4. Phase 55: Hide internal anchor resources from normal data tree.
   - Filter anchor fields/datasets from regular tables/fields sections.
   - Keep review/source evidence visible.
   - Why fourth: polish once labels and evidence navigation are better.

5. Phase 56: Multi-source graph quality dashboard.
   - Add summary for high-priority extracted relationships, multi-source evidence count, and unsupported/ignored source diagnostics.
   - Why fifth: useful after diagnostics and navigation are visible.

## Verification

- [x] Run backend relationship/import/evidence checks.
- [x] Run frontend relationship/import/workspace checks.
- [x] Run frontend production build.

Commands run:

- `cd backend && .venv/bin/pytest tests/test_relationship_quality.py tests/test_document_import_phase_2.py tests/test_api.py tests/test_evidence_retrieval.py tests/test_import_service.py tests/test_universal_import_phase_1.py -q`
- `cd frontend && npm test -- RelationshipReview.test.tsx RelationshipModelingCard.test.tsx ImportPanel.test.tsx Workspace.test.tsx importHealth.test.ts i18n.test.tsx --run`
- `cd frontend && npm run build`
