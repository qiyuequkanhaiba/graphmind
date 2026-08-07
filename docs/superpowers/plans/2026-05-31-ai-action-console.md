# AI Action Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade AI graph action buttons into an explainable action console with target preview, execution state, failure feedback, and clear-highlight recovery.

**Architecture:** Keep the backend action contract unchanged. Add frontend-only execution result types, let `Workspace` validate and record action execution outcomes, and let `ChatPanel` render compact action cards from actions plus state.

**Tech Stack:** React, TypeScript, Vitest, React Testing Library, CSS.

---

## File Map

- Modify: `frontend/src/api/types.ts` - add frontend-only graph action execution state types.
- Modify: `frontend/src/components/ChatPanel.tsx` - render action cards, target previews, statuses, failure messages, and clear-highlight controls.
- Modify: `frontend/src/components/workbench/InsightPanel.tsx` - pass action state and clear handler into `ChatPanel`.
- Modify: `frontend/src/components/Workspace.tsx` - validate action targets, store execution results, and clear AI highlights.
- Modify: `frontend/src/i18n/messages.ts` - add Chinese and English labels for action console UI.
- Modify: `frontend/src/styles/app.css` - style compact action cards across light and pro workbench themes.
- Modify: `frontend/tests/ChatPanel.test.tsx` - cover target previews, status rendering, failure reasons, and clear handler.
- Modify: `frontend/tests/Workspace.test.tsx` - cover executed, failed, and reverted action states.
- Modify: `docs/superpowers/specs/2026-05-31-ai-action-console-design.md` - update implementation progress.
- Modify: `docs/superpowers/plans/2026-05-31-ai-action-console.md` - keep task checkboxes and observed results current.

## Tasks

### Task 1: ChatPanel Action Console Tests

- [x] Add failing tests in `frontend/tests/ChatPanel.test.tsx` proving:
  - action cards show target previews;
  - idle actions show a pending status;
  - failed actions show the failure reason;
  - executed actions expose a clear-highlight button.
- [x] Run `cd frontend && npm test -- ChatPanel.test.tsx --run`.

Observed: failed before implementation because `ChatPanel` still rendered plain action buttons and did not show target previews, statuses, failure messages, or clear controls.

### Task 2: ChatPanel Action Console Implementation

- [x] Add action execution types to `frontend/src/api/types.ts`.
- [x] Add `graphActionStates` and `onClearGraphAction` props to `ChatPanel`.
- [x] Replace the plain action button group with compact action cards.
- [x] Add i18n labels for statuses, target preview, execute, and clear-highlight.
- [x] Add CSS for action cards in default and pro workbench themes.
- [x] Run `cd frontend && npm test -- ChatPanel.test.tsx --run`.

Observed: `ChatPanel.test.tsx` passed 8 tests after implementation.

### Task 3: Workspace Action State Tests

- [x] Add failing tests in `frontend/tests/Workspace.test.tsx` proving:
  - successful AI action displays an executed status;
  - invalid action target displays a failed status and reason;
  - clearing an executed action removes the AI highlight and marks it reverted.
- [x] Run `cd frontend && npm test -- Workspace.test.tsx --run`.

Observed: failed before implementation because `Workspace` did not store action execution state, failed actions were silent, and clear-highlight controls did not exist. An additional red test caught that global answer highlights also needed an App-level clear callback.

### Task 4: Workspace Action State Implementation

- [x] Store `graphActionStates` in `Workspace`.
- [x] Make `handleGraphAction` validate targets and record `executed` or `failed`.
- [x] Implement `clearGraphAction` to empty AI selection highlight and record `reverted`.
- [x] Pass action states and clear handler through `InsightPanel`.
- [x] Run `cd frontend && npm test -- Workspace.test.tsx --run`.

Observed: `Workspace.test.tsx` passed 26 tests after adding action state, failed-target feedback, and global highlight clearing through `App`.

### Task 5: Full Verification and Documentation Sync

- [x] Update spec progress and this plan's observed results.
- [x] Run `cd frontend && npm test -- --run`.
- [x] Run `cd frontend && npm run lint`.
- [x] Run `cd frontend && npm run build`.
- [x] Browser-check `http://127.0.0.1:5173/` at desktop, tablet, and mobile widths.

Observed: frontend full test suite passed 21 files / 157 tests; TypeScript check passed; production build passed. Backend `pytest -q` passed 90 tests and `ruff check graphmind tests` passed. Browser verification confirmed the real chat response returns action cards after restarting the non-reload backend process; two action cards rendered in the right panel with target previews and no horizontal overflow at the active desktop viewport. The in-app browser session did not apply requested viewport resizing, so narrow-width behavior is covered by existing responsive tests and CSS constraints rather than a fresh browser viewport resize in this run.

## Self Review

- Spec coverage: tasks cover target preview, state, failure feedback, clear highlight, i18n, styling, and verification.
- Placeholder scan: no TBD or TODO placeholders remain.
- Type consistency: `GraphActionExecutionResult` and `graphActionStates` are the shared names across plan tasks.
