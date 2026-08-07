# Phase 58: Remaining Import KG Gap Audit

## Goal

Reassess the remaining work after Phases 52-57 and identify the final implementation needed to make multi-format imports feel complete, connected, and evidence-backed.

## Completed Since Phase 51

- Evidence refs are unified and frontend evidence/action matching supports canonical `evidence_refs`.
- Extracted document/code/log relationships appear as reviewable suggestions with user-facing labels.
- Import diagnostics are visible in task/stage UI.
- Internal anchor resources are hidden from normal resource trees.
- Backend graph nodes for internal anchors now carry explicit metadata.
- Import health includes multi-source quality signals, high-priority extracted relationships, and ignored file counts.

## Remaining Gap

EvidenceInspector still shows only the legacy single `evidence_ref` row for selected relationships. It does not render the full canonical `evidence_refs` array as navigable source references.

## Required Final Work

- Render all unique relationship evidence refs in EvidenceInspector.
- Preserve the legacy `evidence_ref` display.
- Make source-backed refs actionable so users can jump from relationship evidence to source inspection.
- Keep suggestion refs visible but non-source refs should not pretend to open a document.
- Add regression tests for multiple refs, deduplication, and source-ref click behavior.

## Why This Is Next

The backend now produces canonical refs, graph actions can match them, source inspection exists, and import diagnostics explain what was produced. The remaining missing link is a user-visible navigation affordance from relationship evidence back to the originating document/code/log/table source.
