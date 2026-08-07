# AI Activity Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact AI analysis activity timeline that records graph action execution, failures, and reverted highlights in the AI panel.

**Architecture:** Keep the feature frontend-only. `Workspace` records activity events whenever graph action execution state changes, passes the recent activity list into `ChatPanel`, and `ChatPanel` renders a compact timeline with a clear button.

**Tech Stack:** React, TypeScript, Vitest, React Testing Library, CSS.

---

## File Map

- Modify: `frontend/src/api/types.ts` - add `GraphActionActivity`.
- Modify: `frontend/src/components/ChatPanel.tsx` - render compact activity timeline and clear button.
- Modify: `frontend/src/components/workbench/InsightPanel.tsx` - pass activities and clear handler.
- Modify: `frontend/src/components/Workspace.tsx` - append activity entries from action execution results and clear them.
- Modify: `frontend/src/i18n/messages.ts` - add timeline labels.
- Modify: `frontend/src/styles/app.css` - style the activity timeline in default and pro themes.
- Modify: `frontend/tests/ChatPanel.test.tsx` - cover timeline rendering and clear callback.
- Modify: `frontend/tests/Workspace.test.tsx` - cover activity creation and clearing.
- Modify: `docs/superpowers/specs/2026-05-31-ai-activity-timeline-design.md` - update implementation progress.
- Modify: `docs/superpowers/plans/2026-05-31-ai-activity-timeline.md` - keep task status and observed results current.

## Tasks

### Task 1: ChatPanel Timeline Tests

- [x] Add failing tests in `frontend/tests/ChatPanel.test.tsx` proving:
  - no timeline renders when `graphActionActivities` is empty;
  - timeline renders activity status, action label, target preview, and message;
  - clicking clear calls `onClearGraphActionActivities`.
- [x] Run `cd frontend && npm test -- ChatPanel.test.tsx --run`.

Observed: Initial red run failed on missing `AI 分析活动`, confirming the test covered the new UI.

### Task 2: ChatPanel Timeline Implementation

- [x] Add `GraphActionActivity` type.
- [x] Add `graphActionActivities` and `onClearGraphActionActivities` props to `ChatPanel`.
- [x] Render an `AI 分析活动` timeline before the current context strip.
- [x] Add i18n labels for heading, clear button, and target preview reuse.
- [x] Add compact CSS for default and pro workbench themes.
- [x] Run `cd frontend && npm test -- ChatPanel.test.tsx --run`.

Observed: `ChatPanel.test.tsx` passed as part of `npm test -- ChatPanel.test.tsx Workspace.test.tsx --run`.

### Task 3: Workspace Activity Tests

- [x] Add failing tests in `frontend/tests/Workspace.test.tsx` proving:
  - executing a graph action creates an executed activity;
  - invalid graph action creates a failed activity;
  - clearing a graph action creates a reverted activity;
  - clearing activities removes the timeline while leaving chat messages visible.
- [x] Run `cd frontend && npm test -- Workspace.test.tsx --run`.

Observed: Initial red run failed on missing `AI 分析活动` in Workspace flows.

### Task 4: Workspace Activity Implementation

- [x] Store `graphActionActivities` in `Workspace`.
- [x] Append activity records inside `recordGraphActionState` for non-idle statuses.
- [x] Keep only the latest 8 activities.
- [x] Implement `clearGraphActionActivities`.
- [x] Pass activities and clear handler through `InsightPanel`.
- [x] Run `cd frontend && npm test -- Workspace.test.tsx --run`.

Observed: `npm test -- ChatPanel.test.tsx Workspace.test.tsx --run` passed with 38 tests after adding the suggestion-only highlight regression. Browser testing exposed that real AI `highlight_path` actions can rely on `suggestion_ids`; Workspace now resolves those suggestions back to graph edges and endpoints before marking the action executed.

### Task 5: Full Verification and Browser Check

- [x] Update this plan and the design spec progress.
- [x] Run `cd frontend && npm test -- --run`.
- [x] Run `cd frontend && npm run lint`.
- [x] Run `cd frontend && npm run build`.
- [x] Browser-check `http://127.0.0.1:5173/` after asking an AI question and executing a graph action.

Observed: `npm test -- --run` passed with 21 files / 161 tests. `npm run lint` passed. `npm run build` passed. Browser check on `http://127.0.0.1:5173/` verified a real AI answer, executed `高亮图谱路径`, rendered `AI 分析活动`, showed `已执行动作。`, and reported no document-level horizontal overflow at 1440px. Mobile insight view at 390px showed the activity timeline at 345px width with no non-canvas horizontal overflow.

## Self Review

- Spec coverage: tasks cover timeline rendering, action event creation, clearing behavior, styling, and verification.
- Placeholder scan: no TODO/TBD placeholders remain.
- Type consistency: `GraphActionActivity`, `graphActionActivities`, and `onClearGraphActionActivities` are used consistently across tasks.
