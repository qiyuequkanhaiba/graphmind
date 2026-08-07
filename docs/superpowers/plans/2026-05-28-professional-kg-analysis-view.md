# Professional KG Analysis View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade GraphMind's center graph into a professional relationship analysis view that emphasizes tables, relationship strength, evidence status, and resettable manual layout.

**Architecture:** Keep the existing React Flow graph and workbench shell. Add an `analysis` view mode, derive node summary metrics inside `GraphCanvas`, pass them to `SemanticNode`, and extend graph semantics/style helpers for relationship strength and structural edge classes.

**Tech Stack:** React, TypeScript, React Flow, Vitest, CSS.

---

## File Structure

- Modify `frontend/src/components/GraphCanvas.tsx`: add `analysis` mode, strength filters, node metrics, reset layout.
- Modify `frontend/src/components/graph/SemanticNode.tsx`: render table/field/dimension professional summaries.
- Modify `frontend/src/components/graph/graphSemantics.ts`: add relationship strength helpers and edge class names.
- Modify `frontend/src/i18n/messages.ts`: add control labels.
- Modify `frontend/src/styles/app.css`: upgrade node cards, edge strength, control bar styling.
- Modify `frontend/tests/GraphCanvas.test.tsx`: cover analysis mode, filters, reset layout.
- Modify `frontend/tests/GraphCanvasDrag.test.tsx`: cover reset layout after drag.
- Modify `frontend/tests/graphSemantics.test.ts`: cover edge strength classes.

## Task 1: Relationship Strength Semantics

- [ ] Add failing tests in `frontend/tests/graphSemantics.test.ts` for `edge-strength-strong`, `edge-strength-likely`, `edge-strength-possible`, and `edge-structural`.
- [ ] Run `npm test -- graphSemantics.test.ts` and confirm the new tests fail.
- [ ] Implement relationship strength helpers and extend `getEdgeClassName`.
- [ ] Re-run `npm test -- graphSemantics.test.ts`.

## Task 2: Analysis View Mode and Filters

- [ ] Add failing tests in `frontend/tests/GraphCanvas.test.tsx` proving `关系分析` is active by default and strong relationship filtering hides non-strong suggestions.
- [ ] Run `npm test -- GraphCanvas.test.tsx` and confirm failures.
- [ ] Add `analysis` view mode, `strengthFilter`, and UI controls.
- [ ] Re-run `npm test -- GraphCanvas.test.tsx`.

## Task 3: Professional Node Cards

- [ ] Add failing tests proving table nodes display relationship and key field summaries.
- [ ] Run targeted tests and confirm failures.
- [ ] Compute `relationshipCount` and `keyFieldCount` in `GraphCanvas`.
- [ ] Extend `SemanticNode` to render professional table/field/dimension summaries.
- [ ] Re-run targeted tests.

## Task 4: Reset Layout

- [ ] Add failing test in `frontend/tests/GraphCanvasDrag.test.tsx` proving reset layout restores automatic position after a drag.
- [ ] Run targeted test and confirm failure.
- [ ] Add reset layout button that clears manual positions and calls `fitView`.
- [ ] Re-run targeted tests.

## Task 5: Styling and Verification

- [ ] Update `frontend/src/styles/app.css` for analysis mode cards, edge strength classes, and compact controls.
- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Verify the page in the browser at `http://127.0.0.1:5173/`.

## Self-Review

- Spec coverage: The plan covers default analysis mode, node summaries, edge strength, strength filters, reset layout, and verification.
- Placeholder scan: No placeholder tasks remain.
- Type consistency: New node data fields are defined in `SemanticNodeData` and supplied by `GraphCanvas`.
