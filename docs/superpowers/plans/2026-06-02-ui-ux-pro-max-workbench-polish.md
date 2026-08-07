# UI UX Pro Max Workbench Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine GraphMind into a cleaner, denser, more professional data-analytics workbench without reducing graph canvas space or breaking responsive behavior.

**Architecture:** Keep the existing React component boundaries. Use small structural additions in `GraphCanvas` and `ChatPanel`, then finish with CSS token and density refinements in `app.css`. Extend existing style and layout tests instead of adding new visual tooling.

**Tech Stack:** React 18, TypeScript, CSS, Vitest, existing `audit:layout` Chrome layout audit.

---

## Files

- Modify: `frontend/src/components/GraphCanvas.tsx` - add a compact graph title metrics rail and classify the legend as compact.
- Modify: `frontend/src/components/ChatPanel.tsx` - wrap the AI heading and mode note into a compact header area.
- Modify: `frontend/src/styles/app.css` - refine surface tokens, graph heading, legend, chat panel density, and interaction transitions.
- Modify: `frontend/tests/graphStyles.test.js` - lock the new professional UI refinements.
- Modify: `docs/superpowers/plans/2026-05-31-productized-visual-analytics-tool.md` - append implementation result after verification.

## Tasks

### Task 1: Graph Header And Legend Density

- [x] Add failing `graphStyles` expectations for `.graph-heading-metrics`, compact legend sizing, stable transitions, and mobile bounds.
- [x] Run `npm test -- --run tests/graphStyles.test.js` and confirm the new assertions fail.
- [x] Add graph heading metrics in `GraphCanvas.tsx` using existing visible node/edge counts and active filter state.
- [x] Add CSS to make the graph heading a two-zone professional header and make the legend compact on desktop/tablet/mobile.
- [x] Run `npm test -- --run tests/graphStyles.test.js tests/GraphCanvas.test.tsx`.

### Task 2: AI Panel Density

- [x] Add failing `graphStyles` expectations for `.chat-panel-header`, compact mode note, and controlled suggestion height.
- [x] Run `npm test -- --run tests/graphStyles.test.js` and confirm failure.
- [x] Wrap `ChatPanel` heading and mode note in a compact header, keeping existing text and accessibility.
- [x] Add CSS so the AI panel preserves message height and avoids bulky heading/mode-note spacing.
- [x] Run `npm test -- --run tests/ChatPanel.test.tsx tests/graphStyles.test.js`.

### Task 3: Validation And Documentation

- [x] Run `npm test -- --run`.
- [x] Run `npm run lint`.
- [x] Run `npm run build`.
- [x] Run `GRAPHMIND_AUDIT_SCREENSHOTS=0 npm run audit:layout`.
- [x] Use the in-app browser to inspect graph default, light theme, command palette, data dialog, and AI tab at the current viewport.
- [x] Update the productized visual analytics plan with verified results.

## Implementation Record

- 2026-06-02 01:00 CST: Completed graph header density pass. The graph title now has a compact visible-summary metric rail for nodes, relationships, and confidence, while the legend uses a compact icon/count grid to reduce canvas obstruction.
- 2026-06-02 01:00 CST: Completed AI panel density pass. The AI title and model-mode note now share a compact header, preserving message-list height and keeping the AI tab visually aligned with the rest of the professional workbench.
- 2026-06-02 01:01 CST: Fixed the `Workspace` shell assertion after the new graph metric rail intentionally introduced an additional visible node/edge count. Added the missing `graph.visibleSummary` i18n key in Chinese and English.
- 2026-06-02 01:02 CST: Verification passed: targeted tests 4 files / 90 tests; full `npm test -- --run` 24 files / 188 tests; `npm run lint`; `npm run build`; `GRAPHMIND_AUDIT_SCREENSHOTS=0 npm run audit:layout` 60 viewport/state checks.
- 2026-06-02 01:05 CST: Browser review passed at the current in-app viewport. Checked graph default/light theme, command palette, data import dialog, AI/vector settings dialog, and insights AI tab; all reported zero page-level horizontal overflow, with graph canvas and AI messages retaining usable space.
