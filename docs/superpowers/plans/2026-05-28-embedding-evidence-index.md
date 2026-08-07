# Embedding Evidence Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent SQLite evidence index with optional OpenAI-compatible embeddings and lexical fallback.

**Architecture:** Persist evidence documents in `evidence_index_entries`. Build vectors through an injected OpenAI-compatible embedding provider when configured, then search by cosine similarity when vectors are available. Keep the existing lexical scorer as the fallback for missing config, provider failure, and empty indexes.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy, SQLite JSON columns, pytest, ruff.

---

### Task 1: Storage Model And Migration

**Files:**
- Modify: `backend/graphmind/storage/models.py`
- Modify: `backend/graphmind/storage/database.py`
- Test: `backend/tests/test_evidence_retrieval.py`

- [ ] **Step 1: Write the failing persistence test**

Add a test that creates graph evidence, builds the index, then queries `EvidenceIndexEntry` and asserts entries are persisted with document metadata.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
cd backend && uv run pytest tests/test_evidence_retrieval.py::test_build_index_persists_evidence_entries -q
```

Expected: fail because `EvidenceIndexEntry` does not exist.

- [ ] **Step 3: Add the model and migration**

Add `EvidenceIndexEntry` to SQLAlchemy models and create the table in `_migrate_existing_database()` for existing databases.

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
cd backend && uv run pytest tests/test_evidence_retrieval.py::test_build_index_persists_evidence_entries -q
```

Expected: pass.

### Task 2: Embedding Provider

**Files:**
- Create: `backend/graphmind/services/embedding_provider.py`
- Test: `backend/tests/test_embedding_provider.py`

- [ ] **Step 1: Write provider tests**

Cover missing config fallback, request URL/header/payload shape, and vector parsing from `data[].embedding`.

- [ ] **Step 2: Run provider tests to verify they fail**

Run:

```bash
cd backend && uv run pytest tests/test_embedding_provider.py -q
```

Expected: fail because provider module is missing.

- [ ] **Step 3: Implement the minimal provider**

Reuse the existing urllib transport pattern from `ai_provider.py`.

- [ ] **Step 4: Run provider tests to verify they pass**

Run:

```bash
cd backend && uv run pytest tests/test_embedding_provider.py -q
```

Expected: pass.

### Task 3: Vector Search With Fallback

**Files:**
- Modify: `backend/graphmind/services/evidence_retrieval.py`
- Modify: `backend/graphmind/api/routes.py`
- Modify: `backend/graphmind/api/schemas.py`
- Test: `backend/tests/test_evidence_retrieval.py`
- Test: `backend/tests/test_api.py`

- [ ] **Step 1: Write semantic ranking and fallback tests**

Add tests proving cosine ranking wins when vectors exist and lexical ranking is used when query embeddings fail.

- [ ] **Step 2: Run focused retrieval tests to verify they fail**

Run:

```bash
cd backend && uv run pytest tests/test_evidence_retrieval.py -q
```

Expected: fail because search ignores persisted vectors.

- [ ] **Step 3: Implement index build and search**

Build index entries, call the embedding provider when vector settings are passed, compute cosine similarity for stored vectors, and fall back to lexical scoring otherwise.

- [ ] **Step 4: Update API metadata response**

Pass project vector settings into `build_index_metadata()` and include `embedding_model` in vector settings defaults.

- [ ] **Step 5: Run backend tests**

Run:

```bash
cd backend && uv run pytest -q
```

Expected: all tests pass.

### Task 4: Verification And Runtime

**Files:**
- No additional source files expected.

- [ ] **Step 1: Run backend quality gates**

```bash
cd backend && uv run ruff check graphmind tests
```

Expected: all checks pass.

- [ ] **Step 2: Run frontend quality gates**

```bash
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
```

Expected: tests, lint, and build pass.

- [ ] **Step 3: Restart backend**

```bash
pkill -f "uvicorn graphmind.api.app:app" || true
screen -dmS graphmind-backend bash -lc 'cd /Volumes/outside-ssd/project/graphmind/backend && uv run uvicorn graphmind.api.app:app --host 127.0.0.1 --port 8000 > /tmp/graphmind-backend.log 2>&1'
```

Expected: backend serves `/api/health`.

- [ ] **Step 4: Browser smoke test**

Open `http://127.0.0.1:5173/`, verify the AI/vector status still renders, and the build index action still updates settings.
