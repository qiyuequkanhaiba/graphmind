# Import Retry Suggestion Dedup Phase 17 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep repeated failed-item retries from creating duplicate relationship suggestions for the same semantic field relationship.

**Architecture:** Add repository-level idempotency for batch/profile `RelationshipSuggestion` creation. Retry creates new `Dataset` and `FieldProfile` rows, so field-id dedup is not enough. For `add_relationship_suggestions_for_profiles`, reuse an existing suggestion with the same project, source sheet/field label, target sheet/field label, and relationship type. Single-file imports keep field-id-scoped behavior so same-named reimports remain isolated. Existing graph de-duping already prevents duplicate graph edges; this phase closes the remaining suggestion-store gap.

**Tech Stack:** FastAPI backend, SQLAlchemy repositories, pytest, ruff.

---

### Task 1: Backend Retry Suggestion Idempotency

**Files:**
- Modify: `backend/tests/test_universal_import_phase_1.py`
- Modify: `backend/graphmind/storage/repositories.py`

- [x] **Step 1: Write the failing retry dedup test**

Add a test after `test_import_service_retries_failed_batch_item_from_archived_raw_file`:

```python
def test_import_service_retry_does_not_duplicate_relationship_suggestions(
    tmp_workspace: Path, tmp_path: Path
):
    customers = tmp_path / "customers.csv"
    broken = tmp_path / "broken.json"
    customers.write_text(
        "\n".join(["id,name", "c1,Acme", "c2,Beacon", "c3,Cedar"]),
        encoding="utf-8",
    )
    broken.write_text("{not valid json", encoding="utf-8")
    paths, session_factory, project_id = _project_id(tmp_workspace)
    service = ImportService(paths, session_factory)

    service.import_structured_batch(
        project_id=project_id,
        files=[customers, broken],
        label="Retry dedup batch",
    )

    with session_factory() as session:
        failed_item = session.query(ImportItem).filter_by(filename="broken.json").one()
        raw_path = tmp_workspace / failed_item.raw_data_ref
        raw_path.write_text(
            """
            [
              {"order_id": "o1", "customer_id": "c1", "amount": 120},
              {"order_id": "o2", "customer_id": "c2", "amount": 240},
              {"order_id": "o3", "customer_id": "c1", "amount": 80}
            ]
            """,
            encoding="utf-8",
        )
        failed_item_id = failed_item.id

    service.retry_import_item(project_id=project_id, item_id=failed_item_id)

    with session_factory() as session:
        retried_item = session.get(ImportItem, failed_item_id)
        assert retried_item is not None
        retried_item.status = "failed"
        retried_item.error_message = "Synthetic retry failure"
        session.commit()

    service.retry_import_item(project_id=project_id, item_id=failed_item_id)

    with session_factory() as session:
        field_labels = {
            field.id: f"{field.sheet.name}.{field.normalized_name}"
            for field in session.query(FieldProfile).all()
        }
        suggestion_keys = [
            (
                field_labels[suggestion.source_field_id],
                field_labels.get(suggestion.target_field_id),
                suggestion.relationship_type,
            )
            for suggestion in session.query(RelationshipSuggestion)
            .filter(RelationshipSuggestion.project_id == project_id)
            .all()
        ]

    assert suggestion_keys.count(("broken.customer_id", "customers.id", "foreign_key")) == 1
    assert len(suggestion_keys) == len(set(suggestion_keys))
```

- [x] **Step 2: Run test to verify RED**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_import_service_retry_does_not_duplicate_relationship_suggestions -q
```

Expected: fail because the duplicate retry inserts duplicate suggestions.

- [x] **Step 3: Add repository idempotency**

In `backend/graphmind/storage/repositories.py`, `add_relationship_suggestions_for_profiles` now opts into semantic-key dedup. `_add_relationship_suggestions_from_field_map` still resolves source/target field ids for graph linkage, but it first checks a project-level semantic index keyed by source sheet/field, target sheet/field, and relationship type. If a duplicate is found, it returns the existing suggestion object in the same suggestion-list position instead of inserting a new row.

- [x] **Step 4: Run test to verify GREEN**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_import_service_retry_does_not_duplicate_relationship_suggestions -q
```

Expected: pass.

---

### Task 2: Verification

**Files:**
- No new files.

- [x] **Step 1: Run backend focused tests**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py tests/test_document_import_phase_2.py tests/test_code_repository_import_phase_3.py -q
```

Expected: all pass.

- [x] **Step 2: Run backend lint**

Run:

```bash
cd backend && .venv/bin/ruff check graphmind tests
```

Expected: no violations.

- [x] **Step 3: Run frontend focused tests**

Run:

```bash
cd frontend && npm test -- ImportPanel.test.tsx App.test.tsx apiClientImportBatch.test.ts --run
```

Expected: all pass.

- [x] **Step 4: Run frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: build succeeds.

---

### Self-Review

- Scope: Focused on relationship suggestion duplication caused by retry finalization.
- Ambiguity: Semantic duplicate means same project, source sheet/field label, target sheet/field label, and relationship type.
- Intentional limitation: This does not clean historical duplicates already stored before this change; it prevents new duplicates.
