# Frontend Chinese I18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GraphMind's frontend default to Simplified Chinese while keeping a lightweight English switch.

**Architecture:** Add a small local i18n layer with typed message keys, default `zh-CN`, and a React provider/hook. Convert fixed UI text in the workbench, graph, evidence, review, import, chat, and status surfaces to message lookups while leaving dataset labels, field names, filenames, backend evidence summaries, and AI answers untouched.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Vite.

---

### Task 1: Message Catalog And Provider

**Files:**
- Create: `frontend/src/i18n/messages.ts`
- Create: `frontend/src/i18n/I18nProvider.tsx`
- Test: `frontend/tests/i18n.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "../src/i18n/I18nProvider";

function Probe() {
  const { language, t } = useI18n();
  return (
    <div>
      <span>{language}</span>
      <strong>{t("workbench.subtitle")}</strong>
    </div>
  );
}

describe("i18n", () => {
  it("defaults to Simplified Chinese", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );

    expect(screen.getByText("zh-CN")).toBeInTheDocument();
    expect(screen.getByText("本地表格关系分析工作台")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- i18n.test.tsx`

Expected: FAIL because `../src/i18n/I18nProvider` does not exist.

- [ ] **Step 3: Implement minimal provider and messages**

Add `Language = "zh-CN" | "en-US"`, `messages`, `I18nProvider`, and `useI18n()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- i18n.test.tsx`

Expected: PASS.

### Task 2: Convert Main Workbench UI

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/GraphCanvas.tsx`
- Modify: `frontend/src/components/ImportPanel.tsx`
- Modify: `frontend/src/components/workbench/WorkbenchHeader.tsx`
- Modify: `frontend/src/components/workbench/DataExplorerPanel.tsx`
- Modify: `frontend/src/components/workbench/InsightPanel.tsx`
- Modify: `frontend/src/components/workbench/WorkbenchStatusBar.tsx`
- Modify: `frontend/src/components/workbench/workbenchStats.ts`
- Test: existing component tests

- [ ] **Step 1: Update tests to expect Chinese UI**

Change assertions such as `Relationship Graph`, `Data Tree`, `Evidence`, `Review`, `Search graph items`, and status count text to their Chinese equivalents.

- [ ] **Step 2: Run targeted tests to verify red**

Run: `cd frontend && npm test -- App.test.tsx GraphCanvas.test.tsx Workspace.test.tsx WorkbenchHeader.test.tsx WorkbenchStatusBar.test.tsx DataExplorerPanel.test.tsx InsightPanel.test.tsx`

Expected: FAIL with old English text still rendered.

- [ ] **Step 3: Convert components to `useI18n()`**

Use `t("...")` for visible labels, aria-labels, placeholders, and fixed status messages. Keep user data labels unchanged.

- [ ] **Step 4: Run targeted tests to verify green**

Run: same targeted test command.

Expected: PASS.

### Task 3: Convert Evidence, Review, Chat, And Semantic Labels

**Files:**
- Modify: `frontend/src/components/EvidenceInspector.tsx`
- Modify: `frontend/src/components/RelationshipReview.tsx`
- Modify: `frontend/src/components/ChatPanel.tsx`
- Modify: `frontend/src/components/graph/graphSemantics.ts`
- Modify: `frontend/src/components/workbench/GraphDetailOverlay.tsx`
- Test: existing component and helper tests

- [ ] **Step 1: Update tests to expect Chinese fixed labels**

Update assertions for node kind labels, relationship labels, evidence headings, review action buttons, chat headings, and overlay labels.

- [ ] **Step 2: Run targeted tests to verify red**

Run: `cd frontend && npm test -- graphSemantics.test.ts EvidenceInspector.test.tsx RelationshipReview.test.tsx ChatPanel.test.tsx GraphDetailOverlay.test.tsx`

Expected: FAIL with old English labels still rendered.

- [ ] **Step 3: Convert fixed labels**

Add formatter helpers for Chinese labels or make existing helpers accept language. Use Chinese by default.

- [ ] **Step 4: Run targeted tests to verify green**

Run: same targeted test command.

Expected: PASS.

### Task 4: Full Verification And Browser Smoke

**Files:**
- No source edits unless verification finds a defect.

- [ ] **Step 1: Full automated checks**

Run:

```bash
cd frontend
npm test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 2: Browser smoke**

Open or reload `http://127.0.0.1:5173/`. Confirm Chinese is the default UI language, language switch is visible, graph relationship selection still opens the evidence panel, and console has no errors.
