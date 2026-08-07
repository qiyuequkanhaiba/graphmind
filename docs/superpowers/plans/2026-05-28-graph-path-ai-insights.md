# Graph Path AI Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-hop/two-hop graph path exploration, path summaries, and AI explanation shortcuts for selected graph nodes and relationships.

**Architecture:** Keep the current Workbench, React Flow graph, evidence panel, and chat flow. Add a focused frontend path-insight helper, wire exploration state through `Workspace` into `GraphCanvas` and `EvidenceInspector`, and extend the backend chat service to answer selected edge explanations. Root is not a git repository in this workspace, so checkpoints use verification commands instead of commits.

**Tech Stack:** React, TypeScript, React Flow, Vitest, Python, SQLAlchemy, pytest.

---

## File Structure

- Create `frontend/src/components/graph/graphPathInsights.ts`: pure graph traversal and summary helpers.
- Create `frontend/tests/graphPathInsights.test.ts`: unit tests for path traversal, summary, and path merging.
- Modify `frontend/src/components/Workspace.tsx`: hold exploration state, merge AI and exploration highlights, pass controls/summary props, and add AI shortcut handling.
- Modify `frontend/src/components/GraphCanvas.tsx`: render one-hop/two-hop controls and call exploration callbacks.
- Modify `frontend/src/components/EvidenceInspector.tsx`: display path summary and AI explanation shortcuts.
- Modify `frontend/src/i18n/messages.ts`: add Chinese and English labels.
- Modify frontend tests for `GraphCanvas`, `EvidenceInspector`, and `Workspace`.
- Modify `backend/graphmind/services/chat_service.py`: answer selected edge relationship questions.
- Modify `backend/tests/test_chat_service.py`: cover selected edge explanation.

## Task 1: Frontend Path Insight Helpers

- [ ] Add `frontend/tests/graphPathInsights.test.ts` with tests for one-hop traversal, two-hop traversal, node summary, edge summary, and highlight merging.
- [ ] Run `npm test -- graphPathInsights.test.ts` and confirm it fails because the module does not exist.
- [ ] Create `frontend/src/components/graph/graphPathInsights.ts` with:
  - `type ExplorationMode = "off" | "one_hop" | "two_hop"`
  - `getNodeNeighborhood(graph, nodeId, depth)`
  - `getRelationshipPathSummary(graph, selection, depth)`
  - `mergeHighlightedPaths(aiPath, explorationPath)`
- [ ] Re-run `npm test -- graphPathInsights.test.ts`.

## Task 2: Graph Path Controls

- [ ] Add failing tests in `frontend/tests/GraphCanvas.test.tsx` proving path controls are disabled without a selected node and call `onExplorationModeChange` when a node is selected.
- [ ] Run `npm test -- GraphCanvas.test.tsx` and confirm failure.
- [ ] Extend `GraphCanvas` props with `explorationMode`, `onExplorationModeChange`, and `canExploreSelection`.
- [ ] Render compact segmented controls: `邻域 / 关闭 / 一跳 / 两跳`.
- [ ] Re-run `npm test -- GraphCanvas.test.tsx`.

## Task 3: Workspace Highlight Wiring

- [ ] Add failing test in `frontend/tests/Workspace.test.tsx` proving selecting a node and choosing one-hop causes adjacent nodes to become highlighted.
- [ ] Run `npm test -- Workspace.test.tsx` and confirm failure.
- [ ] Add `explorationMode` state to `Workspace`.
- [ ] Compute `explorationPath` from current selection using `getNodeNeighborhood`.
- [ ] Pass merged highlighted path to `GraphCanvas`, `InsightPanel`, and `WorkbenchStatusBar`.
- [ ] Reset exploration mode to `off` when selection clears or switches to an edge.
- [ ] Re-run `npm test -- Workspace.test.tsx`.

## Task 4: Path Summary and AI Shortcut UI

- [ ] Add failing tests in `frontend/tests/EvidenceInspector.test.tsx` proving selected node summary shows upstream/downstream/pending counts and clicking the AI shortcut calls a handler.
- [ ] Run `npm test -- EvidenceInspector.test.tsx` and confirm failure.
- [ ] Extend `EvidenceInspector` props with `pathSummary` and `onExplainSelection`.
- [ ] Render path summary for selected nodes and selected edges.
- [ ] Render `解释当前节点` and `解释当前关系` buttons.
- [ ] Wire `Workspace` so shortcut calls existing `onAsk(question, selectionContext)`.
- [ ] Re-run `npm test -- EvidenceInspector.test.tsx Workspace.test.tsx`.

## Task 5: Backend Selected Edge Explanation

- [ ] Add failing test in `backend/tests/test_chat_service.py` for `selection={"kind": "edge", "id": edge_id}`.
- [ ] Run `python -m pytest tests/test_chat_service.py -q` from `backend` and confirm failure.
- [ ] Extend `ChatService._selected_item_relationship_answer` with an edge branch.
- [ ] Include source label, target label, relationship type, confidence, status, evidence summary, citation, and highlighted source/target node ids.
- [ ] Re-run `python -m pytest tests/test_chat_service.py -q`.

## Task 6: Styling and Full Verification

- [ ] Update `frontend/src/styles/app.css` for path controls, summary rows, and AI shortcut buttons.
- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run backend tests with `python -m pytest -q`.
- [ ] Use the in-app browser at `http://127.0.0.1:5173/` to verify selecting a node, one-hop/two-hop exploration, path summary, and AI shortcut visibility.

## Self-Review

- Spec coverage: Tasks cover one-hop/two-hop path exploration, highlight merging, right-side summary, AI shortcuts, selected edge backend explanation, and verification.
- Placeholder scan: No TBD/TODO placeholder steps remain.
- Type consistency: `ExplorationMode`, `pathSummary`, and `selectionContext` names are used consistently across tasks.
