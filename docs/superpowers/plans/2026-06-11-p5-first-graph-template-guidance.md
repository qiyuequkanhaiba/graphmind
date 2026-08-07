# P5 First Graph Template Guidance

Date: 2026-06-11

## Goal

Turn the existing first-graph template buttons into a clearer onboarding
surface: selecting a template should reveal the concrete next step for that
source type while preserving the compact workbench flow.

## Scope

- Spreadsheet, document, code repository, and URL templates remain visible in
  the import intake surface.
- Selecting a template displays a source-specific next-step panel.
- The panel triggers the existing matching action:
  - spreadsheet: import sample data
  - document/code: open file picker
  - URL: focus URL input
- The graph empty-state source guide and low-confidence relationship recovery
  playbook are confirmed as implemented and covered.

## TDD Evidence

Red test added first:

- `frontend/tests/ImportIntakeControls.test.tsx`
  - `surfaces scenario-specific next steps when a first-graph template is selected`

Initial targeted run failed because no `模板下一步` region existed after
selecting a template.

## Implementation

- `frontend/src/components/ImportIntakeControls.tsx`
  - Added selected template state.
  - Added `FirstGraphTemplateGuidance` for the selected source type.
  - Added source-specific action labels and next-step copy.
  - Added source-specific project preset recommendations that do not apply or
    save settings from the import surface.
- `frontend/src/i18n/messages.ts`
  - Added Chinese and English template action, next-step, and preset
    recommendation messages.
- `frontend/src/styles/app.css`
  - Added compact, overflow-safe guidance and preset recommendation styling.
- Documentation updated:
  - `docs/productization-implementation-tracker.md`
  - `docs/productization-roadmap.md`
  - `docs/productization-acceptance-plan.md`

## Verification

Fresh command evidence:

```bash
cd frontend && npm test -- ImportIntakeControls.test.tsx --run
# 1 file, 9 tests passed

cd frontend && npm test -- ImportIntakeControls.test.tsx ImportPanel.test.tsx GraphCanvas.test.tsx RelationshipReview.test.tsx AISettingsPanel.test.tsx App.test.tsx --run
# 6 files, 134 tests passed

cd frontend && npm test
# 45 files, 369 tests passed

cd frontend && npm run lint
# exited 0

cd frontend && npm run build
# exited 0

cd frontend && npm run audit:layout
# 60 viewport/state checks passed

cd frontend && npm run audit:quality
# quality audit passed; buildWarningCount=0
```

## Remaining Follow-Ups

- Automatic preset application from first-graph templates should wait for a
  governed apply flow that cannot surprise users or replace secrets.
- Searchable help or guided repair flows should be driven by repeated
  real-world import failure patterns.
- Hosted scale-out, SSO, tenancy, and organization audit logs remain separate
  hosted product tracks.
