# GraphMind MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first local GraphMind MVP loop: import spreadsheet files, profile columns, infer and confirm relationships, visualize the graph, and answer AI-style questions with citations.

**Architecture:** Use a Python FastAPI backend for parsing, profiling, relation inference, local persistence, and cited answer planning. Use a React frontend for the single workspace screen: import/profile sidebar, graph canvas, relationship review, and chat panel. Store project metadata and graph state in SQLite, and query imported tabular data through DuckDB.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy, DuckDB, pandas, openpyxl, pytest, React, TypeScript, Vite, React Flow, Vitest, Testing Library.

---

## File Structure

Create this structure:

```text
backend/
  pyproject.toml
  graphmind/
    __init__.py
    api/
      __init__.py
      app.py
      routes.py
      schemas.py
    core/
      __init__.py
      normalizers.py
      profiling.py
      relationships.py
      graph_builder.py
      answer_contract.py
    storage/
      __init__.py
      database.py
      models.py
      repositories.py
      workspace.py
    services/
      __init__.py
      import_service.py
      graph_service.py
      chat_service.py
  tests/
    conftest.py
    fixtures/
      customers_orders_products.csv
      messy_headers.csv
      no_relationships.csv
    test_normalizers.py
    test_profiling.py
    test_relationships.py
    test_graph_builder.py
    test_import_service.py
    test_chat_service.py
    test_api.py

frontend/
  package.json
  index.html
  tsconfig.json
  vite.config.ts
  src/
    main.tsx
    App.tsx
    api/
      client.ts
      types.ts
    components/
      Workspace.tsx
      ImportPanel.tsx
      GraphCanvas.tsx
      RelationshipReview.tsx
      ChatPanel.tsx
    state/
      workspaceStore.ts
    styles/
      app.css
  tests/
    Workspace.test.tsx
    RelationshipReview.test.tsx
    ChatPanel.test.tsx

docs/
  superpowers/
    specs/
      2026-05-25-graphmind-mvp-design.md
    plans/
      2026-05-25-graphmind-mvp-implementation.md
```

Responsibilities:

- `backend/graphmind/core/normalizers.py`: deterministic name normalization and type helpers.
- `backend/graphmind/core/profiling.py`: sheet and field profiling logic.
- `backend/graphmind/core/relationships.py`: relationship scoring rules.
- `backend/graphmind/core/graph_builder.py`: conversion from profiles and suggestions into graph nodes and edges.
- `backend/graphmind/core/answer_contract.py`: cited answer planning and validation without provider-specific AI calls.
- `backend/graphmind/storage/*`: SQLite models, session handling, project workspace paths, and repository helpers.
- `backend/graphmind/services/import_service.py`: parse uploaded files, store data, profile fields, and create graph draft.
- `backend/graphmind/services/graph_service.py`: review suggestions and produce graph state.
- `backend/graphmind/services/chat_service.py`: classify questions, collect graph/table evidence, and produce MVP cited responses.
- `backend/graphmind/api/*`: FastAPI app, request/response schemas, and routes.
- `frontend/src/api/*`: typed API client and shared response types.
- `frontend/src/components/*`: visible workspace panels and graph/chat UI.
- `frontend/src/state/workspaceStore.ts`: lightweight app state and async loading actions.

## Task 1: Project Skeleton and Tooling

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/graphmind/__init__.py`
- Create: `backend/graphmind/api/__init__.py`
- Create: `backend/graphmind/core/__init__.py`
- Create: `backend/graphmind/storage/__init__.py`
- Create: `backend/graphmind/services/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/styles/app.css`
- Create: `frontend/tests/Workspace.test.tsx`

- [ ] **Step 1: Write backend package configuration**

Create `backend/pyproject.toml`:

```toml
[project]
name = "graphmind-backend"
version = "0.1.0"
description = "Local-first spreadsheet to knowledge graph backend"
requires-python = ">=3.11"
dependencies = [
  "duckdb>=0.10.0",
  "fastapi>=0.111.0",
  "openpyxl>=3.1.2",
  "pandas>=2.2.0",
  "pydantic>=2.7.0",
  "python-multipart>=0.0.9",
  "sqlalchemy>=2.0.30",
  "uvicorn>=0.29.0"
]

[project.optional-dependencies]
dev = [
  "httpx>=0.27.0",
  "pytest>=8.2.0",
  "pytest-cov>=5.0.0",
  "ruff>=0.4.4"
]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]
```

- [ ] **Step 2: Create Python package marker files**

Create these files with exactly this content:

`backend/graphmind/__init__.py`

```python
"""GraphMind backend package."""
```

`backend/graphmind/api/__init__.py`

```python
"""FastAPI entrypoints for GraphMind."""
```

`backend/graphmind/core/__init__.py`

```python
"""Core profiling, relationship, graph, and answer logic."""
```

`backend/graphmind/storage/__init__.py`

```python
"""Local storage models and repositories."""
```

`backend/graphmind/services/__init__.py`

```python
"""Application services that coordinate core logic and storage."""
```

- [ ] **Step 3: Create backend test fixture setup**

Create `backend/tests/conftest.py`:

```python
from collections.abc import Iterator
from pathlib import Path

import pytest


@pytest.fixture
def tmp_workspace(tmp_path: Path) -> Path:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    return workspace


@pytest.fixture
def sample_csv(tmp_path: Path) -> Iterator[Path]:
    path = tmp_path / "customers_orders.csv"
    path.write_text(
        "\n".join(
            [
                "order_id,customer_id,product_id,amount,region",
                "o1,c1,p1,120,East",
                "o2,c1,p2,240,East",
                "o3,c2,p1,80,West",
            ]
        ),
        encoding="utf-8",
    )
    yield path
```

- [ ] **Step 4: Create frontend package configuration**

Create `frontend/package.json`:

```json
{
  "name": "graphmind-frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "reactflow": "^11.11.4"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.5",
    "@testing-library/react": "^15.0.7",
    "@types/react": "^18.2.79",
    "@types/react-dom": "^18.2.25",
    "jsdom": "^24.0.0",
    "typescript": "^5.4.5",
    "vite": "^5.2.11",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 5: Create frontend TypeScript and Vite config**

Create `frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2020"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "tests"],
  "references": []
}
```

Create `frontend/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": "http://127.0.0.1:8000"
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: []
  }
});
```

- [ ] **Step 6: Create initial frontend app**

Create `frontend/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GraphMind</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `frontend/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `frontend/src/App.tsx`:

```tsx
export default function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true" />
        <div>
          <h1>GraphMind</h1>
          <p>Local spreadsheet relationship mapping</p>
        </div>
      </header>
      <section className="empty-workspace">
        <h2>Workspace loading</h2>
        <p>The MVP workspace will appear here as backend and frontend tasks land.</p>
      </section>
    </main>
  );
}
```

Create `frontend/src/styles/app.css`:

```css
:root {
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #172033;
  background: #f7f9fc;
}

body {
  margin: 0;
}

button,
input,
textarea {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.topbar {
  height: 64px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  background: #ffffff;
  border-bottom: 1px solid #d7dde7;
}

.brand-mark {
  width: 32px;
  height: 32px;
  border-radius: 7px;
  background: linear-gradient(135deg, #1d7a6f, #3157a3);
}

.topbar h1 {
  margin: 0;
  font-size: 18px;
  line-height: 1.1;
}

.topbar p {
  margin: 2px 0 0;
  color: #607088;
  font-size: 12px;
}

.empty-workspace {
  margin: 32px auto;
  width: min(760px, calc(100% - 32px));
  padding: 24px;
  border: 1px solid #d7dde7;
  border-radius: 8px;
  background: #ffffff;
}

.empty-workspace h2 {
  margin: 0 0 8px;
  font-size: 20px;
}

.empty-workspace p {
  margin: 0;
  color: #607088;
}
```

- [ ] **Step 7: Write frontend smoke test**

Create `frontend/tests/Workspace.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../src/App";

describe("App", () => {
  it("renders the GraphMind shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "GraphMind" })).toBeInTheDocument();
    expect(screen.getByText("Local spreadsheet relationship mapping")).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Install dependencies**

Run:

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
cd ../frontend
npm install
```

Expected:

- Python dependencies install without errors.
- `frontend/package-lock.json` is created.

- [ ] **Step 9: Run initial checks**

Run:

```bash
cd backend
. .venv/bin/activate
pytest -q
cd ../frontend
npm test
npm run build
```

Expected:

- Backend pytest reports no tests collected or passes the fixture-only setup.
- Frontend test passes.
- Frontend build succeeds.

- [ ] **Step 10: Commit**

Run:

```bash
git add backend frontend docs/superpowers/plans/2026-05-25-graphmind-mvp-implementation.md
git commit -m "chore: scaffold GraphMind MVP project"
```

Expected:

- Commit succeeds if the workspace has been initialized as a git repository.
- If this directory is still not a git repository, skip commit and record that in the task handoff.

## Task 2: Backend Storage Models and Workspace Database

**Files:**
- Create: `backend/graphmind/storage/models.py`
- Create: `backend/graphmind/storage/database.py`
- Create: `backend/graphmind/storage/workspace.py`
- Create: `backend/graphmind/storage/repositories.py`
- Create: `backend/tests/test_storage.py`

- [ ] **Step 1: Write failing storage tests**

Create `backend/tests/test_storage.py`:

```python
from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.models import Project
from graphmind.storage.repositories import ProjectRepository
from graphmind.storage.workspace import WorkspacePaths


def test_workspace_paths_create_expected_directories(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)

    paths.ensure()

    assert paths.database_path.parent.exists()
    assert paths.imports_dir.exists()
    assert paths.duckdb_path.parent.exists()
    assert paths.database_path.name == "graphmind.sqlite3"
    assert paths.duckdb_path.name == "graphmind.duckdb"


def test_project_repository_creates_default_project(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        repo = ProjectRepository(session)
        project = repo.create_project(name="Demo Project")
        session.commit()

    with session_factory() as session:
      saved = session.get(Project, project.id)
      assert saved is not None
      assert saved.name == "Demo Project"
      assert saved.settings == {}
```

- [ ] **Step 2: Run storage tests to verify failure**

Run:

```bash
cd backend
. .venv/bin/activate
pytest tests/test_storage.py -q
```

Expected:

- Fails with `ModuleNotFoundError` for `graphmind.storage.database` or missing model classes.

- [ ] **Step 3: Implement SQLAlchemy models**

Create `backend/graphmind/storage/models.py`:

```python
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON


def utc_now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    ai_provider_config_ref: Mapped[str | None] = mapped_column(String(300), nullable=True)


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    file_type: Mapped[str] = mapped_column(String(30), nullable=False)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    import_status: Mapped[str] = mapped_column(String(30), nullable=False, default="imported")
    raw_data_ref: Mapped[str] = mapped_column(String(500), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    sheets: Mapped[list[Sheet]] = relationship(back_populates="dataset", cascade="all, delete-orphan")


class Sheet(Base):
    __tablename__ = "sheets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(200), nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    column_count: Mapped[int] = mapped_column(Integer, nullable=False)
    duckdb_table_name: Mapped[str] = mapped_column(String(200), nullable=False)

    dataset: Mapped[Dataset] = relationship(back_populates="sheets")
    fields: Mapped[list[FieldProfile]] = relationship(
        back_populates="sheet", cascade="all, delete-orphan"
    )


class FieldProfile(Base):
    __tablename__ = "field_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sheet_id: Mapped[int] = mapped_column(ForeignKey("sheets.id"), nullable=False)
    original_name: Mapped[str] = mapped_column(String(200), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(200), nullable=False)
    inferred_type: Mapped[str] = mapped_column(String(50), nullable=False)
    null_count: Mapped[int] = mapped_column(Integer, nullable=False)
    unique_count: Mapped[int] = mapped_column(Integer, nullable=False)
    sample_values: Mapped[list[Any]] = mapped_column(JSON, default=list)
    min_value: Mapped[str | None] = mapped_column(String(200), nullable=True)
    max_value: Mapped[str | None] = mapped_column(String(200), nullable=True)
    semantic_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    key_candidate_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    sheet: Mapped[Sheet] = relationship(back_populates="fields")


class GraphNode(Base):
    __tablename__ = "graph_nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    node_type: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    source_ref: Mapped[str] = mapped_column(String(300), nullable=False)
    node_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    position_x: Mapped[float] = mapped_column(Float, default=0.0)
    position_y: Mapped[float] = mapped_column(Float, default=0.0)


class GraphEdge(Base):
    __tablename__ = "graph_edges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    source_node_id: Mapped[int] = mapped_column(ForeignKey("graph_nodes.id"), nullable=False)
    target_node_id: Mapped[int] = mapped_column(ForeignKey("graph_nodes.id"), nullable=False)
    edge_type: Mapped[str] = mapped_column(String(80), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    evidence_ref: Mapped[str] = mapped_column(String(300), nullable=False)
    created_from_suggestion_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class RelationshipSuggestion(Base):
    __tablename__ = "relationship_suggestions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    source_field_id: Mapped[int] = mapped_column(ForeignKey("field_profiles.id"), nullable=False)
    target_field_id: Mapped[int | None] = mapped_column(ForeignKey("field_profiles.id"), nullable=True)
    relationship_type: Mapped[str] = mapped_column(String(80), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    evidence_summary: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    ai_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision_status: Mapped[str] = mapped_column(String(40), nullable=False, default="pending")
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    title: Mapped[str] = mapped_column(String(200), nullable=False)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    chat_session_id: Mapped[int] = mapped_column(ForeignKey("chat_sessions.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    query_plan: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    answer_confidence: Mapped[str | None] = mapped_column(String(80), nullable=True)
    citations: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    highlighted_graph_path: Mapped[list[int]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
```

- [ ] **Step 4: Implement database helpers**

Create `backend/graphmind/storage/database.py`:

```python
from collections.abc import Callable
from pathlib import Path

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from graphmind.storage.models import Base


def create_engine_for_path(database_path: Path) -> Engine:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    return create_engine(f"sqlite:///{database_path}", future=True)


def initialize_database(database_path: Path) -> None:
    engine = create_engine_for_path(database_path)
    Base.metadata.create_all(engine)


def create_session_factory(database_path: Path) -> Callable[[], Session]:
    engine = create_engine_for_path(database_path)
    return sessionmaker(bind=engine, expire_on_commit=False, future=True)
```

- [ ] **Step 5: Implement workspace paths**

Create `backend/graphmind/storage/workspace.py`:

```python
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class WorkspacePaths:
    root: Path

    @property
    def database_path(self) -> Path:
        return self.root / "state" / "graphmind.sqlite3"

    @property
    def duckdb_path(self) -> Path:
        return self.root / "state" / "graphmind.duckdb"

    @property
    def imports_dir(self) -> Path:
        return self.root / "imports"

    def ensure(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.duckdb_path.parent.mkdir(parents=True, exist_ok=True)
        self.imports_dir.mkdir(parents=True, exist_ok=True)
```

- [ ] **Step 6: Implement repository helpers**

Create `backend/graphmind/storage/repositories.py`:

```python
from sqlalchemy.orm import Session

from graphmind.storage.models import Project


class ProjectRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_project(self, name: str) -> Project:
        project = Project(name=name, settings={})
        self.session.add(project)
        self.session.flush()
        return project
```

- [ ] **Step 7: Run storage tests**

Run:

```bash
cd backend
. .venv/bin/activate
pytest tests/test_storage.py -q
```

Expected:

- Both tests pass.

- [ ] **Step 8: Run lint for backend files**

Run:

```bash
cd backend
. .venv/bin/activate
ruff check graphmind tests
```

Expected:

- Ruff reports no issues.

- [ ] **Step 9: Commit**

Run:

```bash
git add backend/graphmind/storage backend/tests/test_storage.py
git commit -m "feat: add local storage models"
```

Expected:

- Commit succeeds if the workspace has been initialized as a git repository.
- If this directory is still not a git repository, skip commit and record that in the task handoff.

## Task 3: Normalization and Profiling Core

**Files:**
- Create: `backend/graphmind/core/normalizers.py`
- Create: `backend/graphmind/core/profiling.py`
- Create: `backend/tests/test_normalizers.py`
- Create: `backend/tests/test_profiling.py`

- [ ] **Step 1: Write failing normalizer tests**

Create `backend/tests/test_normalizers.py`:

```python
from graphmind.core.normalizers import normalize_header, normalize_sheet_name


def test_normalize_header_removes_noise_and_lowercases():
    assert normalize_header(" Customer ID ") == "customer_id"
    assert normalize_header("Order-Amount ($)") == "order_amount"
    assert normalize_header("客户 ID") == "id"


def test_normalize_sheet_name_is_stable_for_empty_names():
    assert normalize_sheet_name(" Orders 2026 ") == "orders_2026"
    assert normalize_sheet_name("") == "sheet"
```

- [ ] **Step 2: Write failing profiling tests**

Create `backend/tests/test_profiling.py`:

```python
import pandas as pd

from graphmind.core.profiling import profile_dataframe


def test_profile_dataframe_detects_keys_categories_and_numbers():
    df = pd.DataFrame(
        {
            "order_id": ["o1", "o2", "o3"],
            "customer_id": ["c1", "c1", "c2"],
            "amount": [120.5, 240.0, 80.0],
            "region": ["East", "East", "West"],
            "ordered_at": ["2026-01-01", "2026-01-03", "2026-02-01"],
        }
    )

    profile = profile_dataframe(sheet_name="Orders", duckdb_table_name="orders", df=df)

    assert profile.name == "Orders"
    assert profile.normalized_name == "orders"
    assert profile.row_count == 3
    assert profile.column_count == 5

    by_name = {field.normalized_name: field for field in profile.fields}
    assert by_name["order_id"].inferred_type == "identifier"
    assert by_name["order_id"].key_candidate_score == 1.0
    assert by_name["amount"].inferred_type == "number"
    assert by_name["region"].inferred_type == "category"
    assert by_name["ordered_at"].inferred_type == "date"


def test_profile_dataframe_reports_nulls_and_sample_values():
    df = pd.DataFrame({"Name": ["Ada", None, "Lin"], "Score": [10, None, 12]})

    profile = profile_dataframe(sheet_name="People", duckdb_table_name="people", df=df)
    by_name = {field.normalized_name: field for field in profile.fields}

    assert by_name["name"].null_count == 1
    assert by_name["name"].sample_values == ["Ada", "Lin"]
    assert by_name["score"].null_count == 1
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
cd backend
. .venv/bin/activate
pytest tests/test_normalizers.py tests/test_profiling.py -q
```

Expected:

- Tests fail because `normalizers.py` and `profiling.py` do not exist.

- [ ] **Step 4: Implement normalizers**

Create `backend/graphmind/core/normalizers.py`:

```python
import re
import unicodedata


def _ascii_words(value: str) -> list[str]:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return re.findall(r"[a-zA-Z0-9]+", ascii_value.lower())


def normalize_header(value: str) -> str:
    words = _ascii_words(value)
    if not words:
        return "field"
    filtered = [word for word in words if word not in {"usd", "rmb", "cny"}]
    return "_".join(filtered or words)


def normalize_sheet_name(value: str) -> str:
    words = _ascii_words(value)
    if not words:
        return "sheet"
    return "_".join(words)
```

- [ ] **Step 5: Implement profiling dataclasses and logic**

Create `backend/graphmind/core/profiling.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

from graphmind.core.normalizers import normalize_header, normalize_sheet_name


@dataclass(frozen=True)
class FieldProfileData:
    original_name: str
    normalized_name: str
    inferred_type: str
    null_count: int
    unique_count: int
    sample_values: list[Any]
    min_value: str | None
    max_value: str | None
    semantic_label: str | None
    key_candidate_score: float


@dataclass(frozen=True)
class SheetProfileData:
    name: str
    normalized_name: str
    row_count: int
    column_count: int
    duckdb_table_name: str
    fields: list[FieldProfileData]


def infer_field_type(name: str, series: pd.Series) -> str:
    normalized_name = normalize_header(name)
    non_null = series.dropna()
    if non_null.empty:
        return "empty"

    if normalized_name.endswith("_id") or normalized_name == "id":
        return "identifier"

    converted_dates = pd.to_datetime(non_null, errors="coerce")
    if converted_dates.notna().mean() >= 0.8 and any(token in normalized_name for token in ["date", "at"]):
        return "date"

    if pd.api.types.is_numeric_dtype(non_null):
        return "number"

    unique_ratio = non_null.nunique(dropna=True) / max(len(non_null), 1)
    if unique_ratio <= 0.5:
        return "category"

    return "text"


def key_candidate_score(name: str, series: pd.Series) -> float:
    non_null = series.dropna()
    if non_null.empty:
        return 0.0
    normalized_name = normalize_header(name)
    unique_ratio = non_null.nunique(dropna=True) / len(non_null)
    if normalized_name == "id" or normalized_name.endswith("_id"):
        return round(float(unique_ratio), 3)
    if unique_ratio == 1.0 and len(non_null) >= 2:
        return 0.75
    return 0.0


def _sample_values(series: pd.Series) -> list[Any]:
    values = []
    for value in series.dropna().head(5).tolist():
        if hasattr(value, "item"):
            value = value.item()
        values.append(value)
    return values


def _min_max(series: pd.Series) -> tuple[str | None, str | None]:
    non_null = series.dropna()
    if non_null.empty:
        return None, None
    try:
        return str(non_null.min()), str(non_null.max())
    except TypeError:
        return None, None


def profile_dataframe(sheet_name: str, duckdb_table_name: str, df: pd.DataFrame) -> SheetProfileData:
    fields = []
    for column in df.columns:
        series = df[column]
        min_value, max_value = _min_max(series)
        fields.append(
            FieldProfileData(
                original_name=str(column),
                normalized_name=normalize_header(str(column)),
                inferred_type=infer_field_type(str(column), series),
                null_count=int(series.isna().sum()),
                unique_count=int(series.dropna().nunique()),
                sample_values=_sample_values(series),
                min_value=min_value,
                max_value=max_value,
                semantic_label=None,
                key_candidate_score=key_candidate_score(str(column), series),
            )
        )

    return SheetProfileData(
        name=sheet_name,
        normalized_name=normalize_sheet_name(sheet_name),
        row_count=len(df),
        column_count=len(df.columns),
        duckdb_table_name=duckdb_table_name,
        fields=fields,
    )
```

- [ ] **Step 6: Run profiling tests**

Run:

```bash
cd backend
. .venv/bin/activate
pytest tests/test_normalizers.py tests/test_profiling.py -q
```

Expected:

- All tests pass.

- [ ] **Step 7: Run backend lint**

Run:

```bash
cd backend
. .venv/bin/activate
ruff check graphmind/core tests/test_normalizers.py tests/test_profiling.py
```

Expected:

- Ruff reports no issues.

- [ ] **Step 8: Commit**

Run:

```bash
git add backend/graphmind/core/normalizers.py backend/graphmind/core/profiling.py backend/tests/test_normalizers.py backend/tests/test_profiling.py
git commit -m "feat: add spreadsheet profiling core"
```

Expected:

- Commit succeeds if the workspace has been initialized as a git repository.
- If this directory is still not a git repository, skip commit and record that in the task handoff.

## Task 4: Relationship Scoring and Graph Building

**Files:**
- Create: `backend/graphmind/core/relationships.py`
- Create: `backend/graphmind/core/graph_builder.py`
- Create: `backend/tests/test_relationships.py`
- Create: `backend/tests/test_graph_builder.py`

- [ ] **Step 1: Write failing relationship tests**

Create `backend/tests/test_relationships.py`:

```python
import pandas as pd

from graphmind.core.profiling import profile_dataframe
from graphmind.core.relationships import infer_relationships


def test_infer_relationships_detects_foreign_key_like_overlap():
    customers = pd.DataFrame({"customer_id": ["c1", "c2"], "region": ["East", "West"]})
    orders = pd.DataFrame({"order_id": ["o1", "o2", "o3"], "customer_id": ["c1", "c1", "c2"]})

    customer_profile = profile_dataframe("Customers", "customers", customers)
    order_profile = profile_dataframe("Orders", "orders", orders)

    suggestions = infer_relationships(
        profiles=[customer_profile, order_profile],
        dataframes={"customers": customers, "orders": orders},
    )

    match = next(
        suggestion
        for suggestion in suggestions
        if suggestion.source_sheet == "Orders" and suggestion.target_sheet == "Customers"
    )
    assert match.source_field == "customer_id"
    assert match.target_field == "customer_id"
    assert match.relationship_type == "foreign_key"
    assert match.confidence >= 0.9
    assert "3 of 3" in match.evidence_summary


def test_infer_relationships_creates_derived_dimension_for_categories():
    products = pd.DataFrame(
        {"product_id": ["p1", "p2", "p3"], "category": ["Analytics", "CRM", "Analytics"]}
    )
    profile = profile_dataframe("Products", "products", products)

    suggestions = infer_relationships(profiles=[profile], dataframes={"products": products})

    derived = [item for item in suggestions if item.relationship_type == "derived_dimension"]
    assert len(derived) == 1
    assert derived[0].source_field == "category"
    assert derived[0].target_field is None
```

- [ ] **Step 2: Write failing graph builder tests**

Create `backend/tests/test_graph_builder.py`:

```python
import pandas as pd

from graphmind.core.graph_builder import build_graph
from graphmind.core.profiling import profile_dataframe
from graphmind.core.relationships import RelationshipSuggestionData


def test_build_graph_creates_table_field_and_suggestion_edges():
    orders = profile_dataframe(
        "Orders",
        "orders",
        pd.DataFrame({"order_id": ["o1"], "customer_id": ["c1"]}),
    )
    customers = profile_dataframe(
        "Customers",
        "customers",
        pd.DataFrame({"customer_id": ["c1"], "region": ["East"]}),
    )
    suggestion = RelationshipSuggestionData(
        source_sheet="Orders",
        source_field="customer_id",
        target_sheet="Customers",
        target_field="customer_id",
        relationship_type="foreign_key",
        confidence=0.95,
        evidence_summary="1 of 1 values overlap.",
        evidence_payload={"overlap_count": 1},
    )

    graph = build_graph(project_id=1, profiles=[orders, customers], suggestions=[suggestion])

    labels = {node.label for node in graph.nodes}
    assert {"Orders", "Customers", "Orders.customer_id", "Customers.customer_id"} <= labels
    suggestion_edges = [edge for edge in graph.edges if edge.edge_type == "foreign_key"]
    assert len(suggestion_edges) == 1
    assert suggestion_edges[0].status == "suggested"
    assert suggestion_edges[0].confidence == 0.95
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
cd backend
. .venv/bin/activate
pytest tests/test_relationships.py tests/test_graph_builder.py -q
```

Expected:

- Tests fail because relationship and graph builder modules do not exist.

- [ ] **Step 4: Implement relationship inference**

Create `backend/graphmind/core/relationships.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

from graphmind.core.profiling import SheetProfileData


@dataclass(frozen=True)
class RelationshipSuggestionData:
    source_sheet: str
    source_field: str
    target_sheet: str | None
    target_field: str | None
    relationship_type: str
    confidence: float
    evidence_summary: str
    evidence_payload: dict[str, Any]


def _clean_values(series: pd.Series) -> set[str]:
    return {str(value) for value in series.dropna().tolist()}


def infer_relationships(
    profiles: list[SheetProfileData],
    dataframes: dict[str, pd.DataFrame],
) -> list[RelationshipSuggestionData]:
    suggestions: list[RelationshipSuggestionData] = []
    field_index = []

    for profile in profiles:
        df = dataframes[profile.duckdb_table_name]
        for field in profile.fields:
            if field.normalized_name in df.columns:
                field_index.append((profile, field, df[field.normalized_name]))
            elif field.original_name in df.columns:
                field_index.append((profile, field, df[field.original_name]))

    for source_profile, source_field, source_series in field_index:
        source_values = _clean_values(source_series)
        if not source_values:
            continue

        for target_profile, target_field, target_series in field_index:
            if source_profile.duckdb_table_name == target_profile.duckdb_table_name:
                continue
            if source_field.normalized_name != target_field.normalized_name:
                continue

            target_values = _clean_values(target_series)
            if not target_values:
                continue

            overlap = source_values & target_values
            source_match_ratio = len(overlap) / len(source_values)
            target_unique_ratio = target_series.dropna().nunique() / max(len(target_series.dropna()), 1)

            if source_match_ratio >= 0.8 and target_unique_ratio >= 0.8:
                confidence = round(min(0.99, 0.55 + source_match_ratio * 0.35 + target_unique_ratio * 0.1), 3)
                suggestions.append(
                    RelationshipSuggestionData(
                        source_sheet=source_profile.name,
                        source_field=source_field.normalized_name,
                        target_sheet=target_profile.name,
                        target_field=target_field.normalized_name,
                        relationship_type="foreign_key",
                        confidence=confidence,
                        evidence_summary=(
                            f"{len(overlap)} of {len(source_values)} distinct source values overlap; "
                            f"{int(source_series.dropna().isin(target_values).sum())} of "
                            f"{int(source_series.dropna().shape[0])} rows match target values."
                        ),
                        evidence_payload={
                            "overlap_count": len(overlap),
                            "source_distinct_count": len(source_values),
                            "source_match_ratio": source_match_ratio,
                            "target_unique_ratio": target_unique_ratio,
                        },
                    )
                )

    for profile in profiles:
        for field in profile.fields:
            if field.inferred_type == "category" and 1 < field.unique_count <= 25:
                suggestions.append(
                    RelationshipSuggestionData(
                        source_sheet=profile.name,
                        source_field=field.normalized_name,
                        target_sheet=None,
                        target_field=None,
                        relationship_type="derived_dimension",
                        confidence=0.76,
                        evidence_summary=(
                            f"{profile.name}.{field.normalized_name} has {field.unique_count} "
                            "distinct category values and can be explored as a dimension."
                        ),
                        evidence_payload={"unique_count": field.unique_count},
                    )
                )

    return suggestions
```

- [ ] **Step 5: Implement graph builder**

Create `backend/graphmind/core/graph_builder.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from graphmind.core.profiling import SheetProfileData
from graphmind.core.relationships import RelationshipSuggestionData


@dataclass(frozen=True)
class GraphNodeData:
    id: str
    node_type: str
    label: str
    source_ref: str
    metadata: dict[str, Any]
    position_x: float
    position_y: float


@dataclass(frozen=True)
class GraphEdgeData:
    id: str
    source_node_id: str
    target_node_id: str
    edge_type: str
    confidence: float
    status: str
    evidence_ref: str
    metadata: dict[str, Any]


@dataclass(frozen=True)
class GraphData:
    project_id: int
    nodes: list[GraphNodeData]
    edges: list[GraphEdgeData]


def _table_node_id(sheet_name: str) -> str:
    return f"table:{sheet_name}"


def _field_node_id(sheet_name: str, field_name: str) -> str:
    return f"field:{sheet_name}.{field_name}"


def _dimension_node_id(sheet_name: str, field_name: str) -> str:
    return f"dimension:{sheet_name}.{field_name}"


def build_graph(
    project_id: int,
    profiles: list[SheetProfileData],
    suggestions: list[RelationshipSuggestionData],
) -> GraphData:
    nodes: list[GraphNodeData] = []
    edges: list[GraphEdgeData] = []

    for table_index, profile in enumerate(profiles):
        table_id = _table_node_id(profile.name)
        nodes.append(
            GraphNodeData(
                id=table_id,
                node_type="table",
                label=profile.name,
                source_ref=profile.duckdb_table_name,
                metadata={"row_count": profile.row_count, "column_count": profile.column_count},
                position_x=80.0 + table_index * 280.0,
                position_y=80.0,
            )
        )
        for field_index, field in enumerate(profile.fields):
            field_id = _field_node_id(profile.name, field.normalized_name)
            nodes.append(
                GraphNodeData(
                    id=field_id,
                    node_type="field",
                    label=f"{profile.name}.{field.normalized_name}",
                    source_ref=f"{profile.duckdb_table_name}.{field.normalized_name}",
                    metadata={
                        "inferred_type": field.inferred_type,
                        "key_candidate_score": field.key_candidate_score,
                    },
                    position_x=80.0 + table_index * 280.0,
                    position_y=180.0 + field_index * 72.0,
                )
            )
            edges.append(
                GraphEdgeData(
                    id=f"contains:{table_id}->{field_id}",
                    source_node_id=table_id,
                    target_node_id=field_id,
                    edge_type="contains_field",
                    confidence=1.0,
                    status="auto_trusted",
                    evidence_ref=field_id,
                    metadata={},
                )
            )

    for index, suggestion in enumerate(suggestions):
        source_id = _field_node_id(suggestion.source_sheet, suggestion.source_field)
        if suggestion.relationship_type == "derived_dimension":
            target_id = _dimension_node_id(suggestion.source_sheet, suggestion.source_field)
            nodes.append(
                GraphNodeData(
                    id=target_id,
                    node_type="derived_entity",
                    label=f"{suggestion.source_field} values",
                    source_ref=source_id,
                    metadata=suggestion.evidence_payload,
                    position_x=640.0,
                    position_y=120.0 + index * 80.0,
                )
            )
        else:
            if suggestion.target_sheet is None or suggestion.target_field is None:
                continue
            target_id = _field_node_id(suggestion.target_sheet, suggestion.target_field)

        edges.append(
            GraphEdgeData(
                id=f"suggestion:{index}",
                source_node_id=source_id,
                target_node_id=target_id,
                edge_type=suggestion.relationship_type,
                confidence=suggestion.confidence,
                status="suggested",
                evidence_ref=f"suggestion:{index}",
                metadata={
                    "evidence_summary": suggestion.evidence_summary,
                    "evidence_payload": suggestion.evidence_payload,
                },
            )
        )

    return GraphData(project_id=project_id, nodes=nodes, edges=edges)
```

- [ ] **Step 6: Run relationship and graph tests**

Run:

```bash
cd backend
. .venv/bin/activate
pytest tests/test_relationships.py tests/test_graph_builder.py -q
```

Expected:

- All tests pass.

- [ ] **Step 7: Run all backend tests**

Run:

```bash
cd backend
. .venv/bin/activate
pytest -q
```

Expected:

- All backend tests pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add backend/graphmind/core/relationships.py backend/graphmind/core/graph_builder.py backend/tests/test_relationships.py backend/tests/test_graph_builder.py
git commit -m "feat: infer spreadsheet graph relationships"
```

Expected:

- Commit succeeds if the workspace has been initialized as a git repository.
- If this directory is still not a git repository, skip commit and record that in the task handoff.

## Task 5: Import Service and Local Persistence

**Files:**
- Create: `backend/graphmind/services/import_service.py`
- Modify: `backend/graphmind/storage/repositories.py`
- Create: `backend/tests/test_import_service.py`

- [ ] **Step 1: Write failing import service tests**

Create `backend/tests/test_import_service.py`:

```python
from graphmind.services.import_service import ImportService
from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.models import Dataset, FieldProfile, GraphEdge, GraphNode, RelationshipSuggestion, Sheet
from graphmind.storage.repositories import ProjectRepository
from graphmind.storage.workspace import WorkspacePaths


def test_import_csv_creates_profiles_suggestions_and_graph(tmp_workspace, sample_csv):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = ProjectRepository(session).create_project("Demo")
        session.commit()
        project_id = project.id

    service = ImportService(paths=paths, session_factory=session_factory)
    result = service.import_file(project_id=project_id, file_path=sample_csv)

    assert result.dataset_id > 0
    assert result.sheet_count == 1
    assert result.field_count == 5
    assert result.graph_node_count >= 6

    with session_factory() as session:
        assert session.query(Dataset).count() == 1
        assert session.query(Sheet).count() == 1
        assert session.query(FieldProfile).count() == 5
        assert session.query(RelationshipSuggestion).count() >= 1
        assert session.query(GraphNode).count() >= 6
        assert session.query(GraphEdge).count() >= 5
```

- [ ] **Step 2: Run import service test to verify failure**

Run:

```bash
cd backend
. .venv/bin/activate
pytest tests/test_import_service.py -q
```

Expected:

- Fails because `ImportService` is not implemented.

- [ ] **Step 3: Extend repositories for import persistence**

Replace `backend/graphmind/storage/repositories.py` with:

```python
from pathlib import Path

from sqlalchemy.orm import Session

from graphmind.core.graph_builder import GraphData
from graphmind.core.profiling import SheetProfileData
from graphmind.core.relationships import RelationshipSuggestionData
from graphmind.storage.models import (
    Dataset,
    FieldProfile,
    GraphEdge,
    GraphNode,
    Project,
    RelationshipSuggestion,
    Sheet,
)


class ProjectRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_project(self, name: str) -> Project:
        project = Project(name=name, settings={})
        self.session.add(project)
        self.session.flush()
        return project


class ImportRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_dataset(self, project_id: int, file_path: Path, raw_data_ref: str) -> Dataset:
        dataset = Dataset(
            project_id=project_id,
            filename=file_path.name,
            file_type=file_path.suffix.lower().lstrip("."),
            import_status="imported",
            raw_data_ref=raw_data_ref,
        )
        self.session.add(dataset)
        self.session.flush()
        return dataset

    def add_sheet_profile(self, dataset_id: int, profile: SheetProfileData) -> Sheet:
        sheet = Sheet(
            dataset_id=dataset_id,
            name=profile.name,
            normalized_name=profile.normalized_name,
            row_count=profile.row_count,
            column_count=profile.column_count,
            duckdb_table_name=profile.duckdb_table_name,
        )
        self.session.add(sheet)
        self.session.flush()
        for field in profile.fields:
            self.session.add(
                FieldProfile(
                    sheet_id=sheet.id,
                    original_name=field.original_name,
                    normalized_name=field.normalized_name,
                    inferred_type=field.inferred_type,
                    null_count=field.null_count,
                    unique_count=field.unique_count,
                    sample_values=field.sample_values,
                    min_value=field.min_value,
                    max_value=field.max_value,
                    semantic_label=field.semantic_label,
                    key_candidate_score=field.key_candidate_score,
                )
            )
        self.session.flush()
        return sheet

    def add_relationship_suggestions(
        self,
        project_id: int,
        suggestions: list[RelationshipSuggestionData],
    ) -> None:
        fields = {
            (field.sheet.name, field.normalized_name): field
            for field in self.session.query(FieldProfile).join(Sheet).all()
        }
        for suggestion in suggestions:
            source = fields[(suggestion.source_sheet, suggestion.source_field)]
            target = None
            if suggestion.target_sheet is not None and suggestion.target_field is not None:
                target = fields[(suggestion.target_sheet, suggestion.target_field)]
            self.session.add(
                RelationshipSuggestion(
                    project_id=project_id,
                    source_field_id=source.id,
                    target_field_id=target.id if target else None,
                    relationship_type=suggestion.relationship_type,
                    confidence=suggestion.confidence,
                    evidence_summary=suggestion.evidence_summary,
                    evidence_payload=suggestion.evidence_payload,
                    ai_explanation=None,
                    decision_status="pending",
                    decision_note=None,
                )
            )
        self.session.flush()

    def add_graph(self, graph: GraphData) -> None:
        node_id_map: dict[str, int] = {}
        for node in graph.nodes:
            model = GraphNode(
                project_id=graph.project_id,
                node_type=node.node_type,
                label=node.label,
                source_ref=node.source_ref,
                node_metadata=node.metadata,
                position_x=node.position_x,
                position_y=node.position_y,
            )
            self.session.add(model)
            self.session.flush()
            node_id_map[node.id] = model.id

        for edge in graph.edges:
            self.session.add(
                GraphEdge(
                    project_id=graph.project_id,
                    source_node_id=node_id_map[edge.source_node_id],
                    target_node_id=node_id_map[edge.target_node_id],
                    edge_type=edge.edge_type,
                    confidence=edge.confidence,
                    status=edge.status,
                    evidence_ref=edge.evidence_ref,
                    created_from_suggestion_id=None,
                )
            )
        self.session.flush()
```

- [ ] **Step 4: Implement import service**

Create `backend/graphmind/services/import_service.py`:

```python
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from shutil import copy2

import duckdb
import pandas as pd
from sqlalchemy.orm import Session

from graphmind.core.graph_builder import build_graph
from graphmind.core.normalizers import normalize_sheet_name
from graphmind.core.profiling import SheetProfileData, profile_dataframe
from graphmind.core.relationships import infer_relationships
from graphmind.storage.repositories import ImportRepository
from graphmind.storage.workspace import WorkspacePaths


@dataclass(frozen=True)
class ImportResult:
    dataset_id: int
    sheet_count: int
    field_count: int
    suggestion_count: int
    graph_node_count: int
    graph_edge_count: int


class ImportService:
    def __init__(self, paths: WorkspacePaths, session_factory: Callable[[], Session]) -> None:
        self.paths = paths
        self.session_factory = session_factory

    def import_file(self, project_id: int, file_path: Path) -> ImportResult:
        self.paths.ensure()
        raw_path = self.paths.imports_dir / file_path.name
        copy2(file_path, raw_path)

        dataframes = self._read_file(raw_path)
        profiles: list[SheetProfileData] = []
        duckdb_dataframes: dict[str, pd.DataFrame] = {}

        with duckdb.connect(str(self.paths.duckdb_path)) as connection:
            for sheet_name, df in dataframes.items():
                normalized_columns = [normalize_sheet_name(str(column)) for column in df.columns]
                df = df.copy()
                df.columns = normalized_columns
                table_name = self._table_name(project_id, sheet_name)
                connection.register("incoming_df", df)
                connection.execute(f'CREATE OR REPLACE TABLE "{table_name}" AS SELECT * FROM incoming_df')
                connection.unregister("incoming_df")
                duckdb_dataframes[table_name] = df
                profiles.append(profile_dataframe(sheet_name, table_name, df))

        suggestions = infer_relationships(profiles=profiles, dataframes=duckdb_dataframes)
        graph = build_graph(project_id=project_id, profiles=profiles, suggestions=suggestions)

        with self.session_factory() as session:
            repo = ImportRepository(session)
            dataset = repo.create_dataset(project_id=project_id, file_path=file_path, raw_data_ref=str(raw_path))
            for profile in profiles:
                repo.add_sheet_profile(dataset.id, profile)
            repo.add_relationship_suggestions(project_id, suggestions)
            repo.add_graph(graph)
            session.commit()
            dataset_id = dataset.id

        return ImportResult(
            dataset_id=dataset_id,
            sheet_count=len(profiles),
            field_count=sum(len(profile.fields) for profile in profiles),
            suggestion_count=len(suggestions),
            graph_node_count=len(graph.nodes),
            graph_edge_count=len(graph.edges),
        )

    def _read_file(self, path: Path) -> dict[str, pd.DataFrame]:
        suffix = path.suffix.lower()
        if suffix == ".csv":
            return {path.stem: pd.read_csv(path)}
        if suffix in {".xlsx", ".xls"}:
            return pd.read_excel(path, sheet_name=None)
        raise ValueError(f"Unsupported file type: {suffix}")

    def _table_name(self, project_id: int, sheet_name: str) -> str:
        return f"p{project_id}_{normalize_sheet_name(sheet_name)}"
```

- [ ] **Step 5: Run import service test**

Run:

```bash
cd backend
. .venv/bin/activate
pytest tests/test_import_service.py -q
```

Expected:

- Test passes.

- [ ] **Step 6: Run full backend tests**

Run:

```bash
cd backend
. .venv/bin/activate
pytest -q
```

Expected:

- All backend tests pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add backend/graphmind/services/import_service.py backend/graphmind/storage/repositories.py backend/tests/test_import_service.py
git commit -m "feat: import spreadsheets into local graph state"
```

Expected:

- Commit succeeds if the workspace has been initialized as a git repository.
- If this directory is still not a git repository, skip commit and record that in the task handoff.

## Task 6: FastAPI Workspace API

**Files:**
- Create: `backend/graphmind/api/schemas.py`
- Create: `backend/graphmind/api/routes.py`
- Create: `backend/graphmind/api/app.py`
- Create: `backend/tests/test_api.py`

- [ ] **Step 1: Write failing API tests**

Create `backend/tests/test_api.py`:

```python
from fastapi.testclient import TestClient

from graphmind.api.app import create_app


def test_health_endpoint(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_create_project_and_get_graph(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    project_response = client.post("/api/projects", json={"name": "Demo"})
    assert project_response.status_code == 200
    project_id = project_response.json()["id"]

    graph_response = client.get(f"/api/projects/{project_id}/graph")

    assert graph_response.status_code == 200
    assert graph_response.json() == {"nodes": [], "edges": []}
```

- [ ] **Step 2: Run API tests to verify failure**

Run:

```bash
cd backend
. .venv/bin/activate
pytest tests/test_api.py -q
```

Expected:

- Tests fail because API modules do not exist.

- [ ] **Step 3: Implement API schemas**

Create `backend/graphmind/api/schemas.py`:

```python
from typing import Any

from pydantic import BaseModel


class ProjectCreateRequest(BaseModel):
    name: str


class ProjectResponse(BaseModel):
    id: int
    name: str


class GraphNodeResponse(BaseModel):
    id: int
    node_type: str
    label: str
    source_ref: str
    metadata: dict[str, Any]
    position_x: float
    position_y: float


class GraphEdgeResponse(BaseModel):
    id: int
    source_node_id: int
    target_node_id: int
    edge_type: str
    confidence: float
    status: str
    evidence_ref: str


class GraphResponse(BaseModel):
    nodes: list[GraphNodeResponse]
    edges: list[GraphEdgeResponse]
```

- [ ] **Step 4: Implement API routes**

Create `backend/graphmind/api/routes.py`:

```python
from collections.abc import Callable
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from graphmind.api.schemas import GraphEdgeResponse, GraphNodeResponse, GraphResponse, ProjectCreateRequest, ProjectResponse
from graphmind.storage.models import GraphEdge, GraphNode
from graphmind.storage.repositories import ProjectRepository


def create_router(session_factory: Callable[[], Session], workspace_root: Path) -> APIRouter:
    router = APIRouter(prefix="/api")

    def get_session():
        with session_factory() as session:
            yield session

    @router.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @router.post("/projects", response_model=ProjectResponse)
    def create_project(payload: ProjectCreateRequest, session: Session = Depends(get_session)):
        project = ProjectRepository(session).create_project(payload.name)
        session.commit()
        return ProjectResponse(id=project.id, name=project.name)

    @router.get("/projects/{project_id}/graph", response_model=GraphResponse)
    def get_graph(project_id: int, session: Session = Depends(get_session)):
        nodes = session.query(GraphNode).filter(GraphNode.project_id == project_id).all()
        edges = session.query(GraphEdge).filter(GraphEdge.project_id == project_id).all()
        return GraphResponse(
            nodes=[
                GraphNodeResponse(
                    id=node.id,
                    node_type=node.node_type,
                    label=node.label,
                    source_ref=node.source_ref,
                    metadata=node.node_metadata,
                    position_x=node.position_x,
                    position_y=node.position_y,
                )
                for node in nodes
            ],
            edges=[
                GraphEdgeResponse(
                    id=edge.id,
                    source_node_id=edge.source_node_id,
                    target_node_id=edge.target_node_id,
                    edge_type=edge.edge_type,
                    confidence=edge.confidence,
                    status=edge.status,
                    evidence_ref=edge.evidence_ref,
                )
                for edge in edges
            ],
        )

    return router
```

- [ ] **Step 5: Implement app factory**

Create `backend/graphmind/api/app.py`:

```python
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from graphmind.api.routes import create_router
from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.workspace import WorkspacePaths


def create_app(workspace_root: Path | None = None) -> FastAPI:
    root = workspace_root or Path(".graphmind")
    paths = WorkspacePaths(root)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    app = FastAPI(title="GraphMind API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(create_router(session_factory=session_factory, workspace_root=root))
    return app


app = create_app()
```

- [ ] **Step 6: Run API tests**

Run:

```bash
cd backend
. .venv/bin/activate
pytest tests/test_api.py -q
```

Expected:

- API tests pass.

- [ ] **Step 7: Run backend test suite**

Run:

```bash
cd backend
. .venv/bin/activate
pytest -q
```

Expected:

- All backend tests pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add backend/graphmind/api backend/tests/test_api.py
git commit -m "feat: expose local workspace API"
```

Expected:

- Commit succeeds if the workspace has been initialized as a git repository.
- If this directory is still not a git repository, skip commit and record that in the task handoff.

## Task 7: Frontend Workspace, Import Panels, and Graph Canvas

**Files:**
- Create: `frontend/src/api/types.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/state/workspaceStore.ts`
- Create: `frontend/src/components/Workspace.tsx`
- Create: `frontend/src/components/ImportPanel.tsx`
- Create: `frontend/src/components/GraphCanvas.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles/app.css`
- Modify: `frontend/tests/Workspace.test.tsx`

- [ ] **Step 1: Write failing workspace test**

Replace `frontend/tests/Workspace.test.tsx` with:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Workspace from "../src/components/Workspace";

const graph = {
  nodes: [
    {
      id: 1,
      node_type: "table",
      label: "Orders",
      source_ref: "orders",
      metadata: { row_count: 3 },
      position_x: 80,
      position_y: 80
    }
  ],
  edges: []
};

describe("Workspace", () => {
  it("renders import panel and graph canvas", () => {
    render(<Workspace graph={graph} />);

    expect(screen.getByRole("heading", { name: "Data Intake" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Relationship Graph" })).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run frontend test to verify failure**

Run:

```bash
cd frontend
npm test
```

Expected:

- Test fails because `Workspace` does not exist.

- [ ] **Step 3: Add API types**

Create `frontend/src/api/types.ts`:

```ts
export type GraphNode = {
  id: number;
  node_type: "table" | "field" | "derived_entity";
  label: string;
  source_ref: string;
  metadata: Record<string, unknown>;
  position_x: number;
  position_y: number;
};

export type GraphEdge = {
  id: number;
  source_node_id: number;
  target_node_id: number;
  edge_type: string;
  confidence: number;
  status: string;
  evidence_ref: string;
};

export type GraphResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};
```

- [ ] **Step 4: Add API client**

Create `frontend/src/api/client.ts`:

```ts
import type { GraphResponse } from "./types";

const API_BASE = "/api";

export async function createProject(name: string): Promise<{ id: number; name: string }> {
  const response = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  if (!response.ok) {
    throw new Error(`Create project failed: ${response.status}`);
  }
  return response.json();
}

export async function getGraph(projectId: number): Promise<GraphResponse> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/graph`);
  if (!response.ok) {
    throw new Error(`Get graph failed: ${response.status}`);
  }
  return response.json();
}
```

- [ ] **Step 5: Add workspace state helper**

Create `frontend/src/state/workspaceStore.ts`:

```ts
import { createProject, getGraph } from "../api/client";
import type { GraphResponse } from "../api/types";

export type WorkspaceState = {
  projectId: number | null;
  graph: GraphResponse;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

export const emptyGraph: GraphResponse = { nodes: [], edges: [] };

export async function bootstrapWorkspace(): Promise<{ projectId: number; graph: GraphResponse }> {
  const project = await createProject("Local Project");
  const graph = await getGraph(project.id);
  return { projectId: project.id, graph };
}
```

- [ ] **Step 6: Add import panel**

Create `frontend/src/components/ImportPanel.tsx`:

```tsx
export default function ImportPanel() {
  return (
    <aside className="panel intake-panel">
      <h2>Data Intake</h2>
      <label className="upload-box">
        <span>Drop CSV or Excel</span>
        <small>Import support will connect to the local backend API next.</small>
        <input type="file" accept=".csv,.xlsx,.xls" />
      </label>
      <section className="profile-summary-empty">
        <h3>Detected Tables</h3>
        <p>Uploaded sheets and field profiles will appear here.</p>
      </section>
    </aside>
  );
}
```

- [ ] **Step 7: Add graph canvas**

Create `frontend/src/components/GraphCanvas.tsx`:

```tsx
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import type { GraphResponse } from "../api/types";

type Props = {
  graph: GraphResponse;
};

export default function GraphCanvas({ graph }: Props) {
  const nodes: Node[] = graph.nodes.map((node) => ({
    id: String(node.id),
    position: { x: node.position_x, y: node.position_y },
    data: { label: node.label },
    type: "default"
  }));

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: String(edge.id),
    source: String(edge.source_node_id),
    target: String(edge.target_node_id),
    label: edge.edge_type
  }));

  return (
    <section className="graph-panel">
      <div className="panel-heading">
        <h2>Relationship Graph</h2>
        <div className="segmented" aria-label="Graph view mode">
          <button className="active">Table</button>
          <button>Field</button>
          <button>Entity</button>
        </div>
      </div>
      <div className="graph-canvas">
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Add workspace component**

Create `frontend/src/components/Workspace.tsx`:

```tsx
import type { GraphResponse } from "../api/types";
import GraphCanvas from "./GraphCanvas";
import ImportPanel from "./ImportPanel";

type Props = {
  graph: GraphResponse;
};

export default function Workspace({ graph }: Props) {
  return (
    <div className="workspace-grid">
      <ImportPanel />
      <GraphCanvas graph={graph} />
      <aside className="panel review-panel">
        <h2>Review & Ask</h2>
        <p>Relationship review and cited AI answers will appear here.</p>
      </aside>
    </div>
  );
}
```

- [ ] **Step 9: Wire App to workspace**

Replace `frontend/src/App.tsx` with:

```tsx
import { useEffect, useState } from "react";
import Workspace from "./components/Workspace";
import { bootstrapWorkspace, emptyGraph, type WorkspaceState } from "./state/workspaceStore";

export default function App() {
  const [state, setState] = useState<WorkspaceState>({
    projectId: null,
    graph: emptyGraph,
    status: "idle",
    error: null
  });

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, status: "loading" }));
    bootstrapWorkspace()
      .then(({ projectId, graph }) => {
        if (!cancelled) {
          setState({ projectId, graph, status: "ready", error: null });
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setState({ projectId: null, graph: emptyGraph, status: "error", error: error.message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true" />
        <div>
          <h1>GraphMind</h1>
          <p>Local spreadsheet relationship mapping</p>
        </div>
      </header>
      {state.status === "error" ? (
        <section className="empty-workspace">
          <h2>Backend unavailable</h2>
          <p>{state.error}</p>
        </section>
      ) : (
        <Workspace graph={state.graph} />
      )}
    </main>
  );
}
```

- [ ] **Step 10: Replace frontend CSS for workspace layout**

Append to `frontend/src/styles/app.css`:

```css
.workspace-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 260px minmax(420px, 1fr) 320px;
}

.panel {
  background: #ffffff;
  border-right: 1px solid #d7dde7;
  padding: 16px;
  min-width: 0;
}

.review-panel {
  border-right: 0;
  border-left: 1px solid #d7dde7;
}

.panel h2,
.graph-panel h2 {
  margin: 0 0 12px;
  font-size: 15px;
}

.upload-box {
  display: grid;
  gap: 6px;
  border: 1px dashed #98a7bd;
  border-radius: 8px;
  padding: 14px;
  background: #f8fbff;
  cursor: pointer;
}

.upload-box span {
  font-weight: 760;
}

.upload-box small,
.profile-summary-empty p,
.review-panel p {
  color: #607088;
  line-height: 1.45;
}

.upload-box input {
  width: 100%;
}

.profile-summary-empty {
  margin-top: 18px;
}

.profile-summary-empty h3 {
  margin: 0 0 6px;
  font-size: 13px;
}

.graph-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(#e9eef6 1px, transparent 1px),
    linear-gradient(90deg, #e9eef6 1px, transparent 1px),
    #f7f9fc;
  background-size: 28px 28px;
}

.panel-heading {
  height: 54px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.86);
  border-bottom: 1px solid #d7dde7;
}

.segmented {
  display: flex;
  border: 1px solid #cbd4e1;
  border-radius: 8px;
  overflow: hidden;
  background: #ffffff;
}

.segmented button {
  border: 0;
  border-right: 1px solid #d7dde7;
  background: #ffffff;
  color: #536278;
  padding: 6px 10px;
  font-size: 12px;
}

.segmented button:last-child {
  border-right: 0;
}

.segmented .active {
  background: #3157a3;
  color: #ffffff;
}

.graph-canvas {
  flex: 1;
  min-height: 460px;
}
```

- [ ] **Step 11: Run frontend tests and build**

Run:

```bash
cd frontend
npm test
npm run build
```

Expected:

- Workspace test passes.
- Production build succeeds.

- [ ] **Step 12: Commit**

Run:

```bash
git add frontend
git commit -m "feat: add GraphMind workspace shell"
```

Expected:

- Commit succeeds if the workspace has been initialized as a git repository.
- If this directory is still not a git repository, skip commit and record that in the task handoff.

## Task 8: Relationship Review API and UI

**Files:**
- Modify: `backend/graphmind/api/schemas.py`
- Modify: `backend/graphmind/api/routes.py`
- Create: `backend/graphmind/services/graph_service.py`
- Create: `backend/tests/test_graph_service.py`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/components/RelationshipReview.tsx`
- Modify: `frontend/src/components/Workspace.tsx`
- Create: `frontend/tests/RelationshipReview.test.tsx`

- [ ] **Step 1: Write failing backend graph service test**

Create `backend/tests/test_graph_service.py`:

```python
from graphmind.services.graph_service import GraphService
from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.models import RelationshipSuggestion
from graphmind.storage.repositories import ProjectRepository
from graphmind.storage.workspace import WorkspacePaths


def test_review_suggestion_updates_decision_status(tmp_workspace, sample_csv):
    from graphmind.services.import_service import ImportService

    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        project = ProjectRepository(session).create_project("Demo")
        session.commit()
        project_id = project.id

    ImportService(paths, session_factory).import_file(project_id, sample_csv)

    with session_factory() as session:
        suggestion = session.query(RelationshipSuggestion).first()
        suggestion_id = suggestion.id

    service = GraphService(session_factory)
    service.review_suggestion(suggestion_id=suggestion_id, decision_status="accepted", decision_note="Looks right")

    with session_factory() as session:
        updated = session.get(RelationshipSuggestion, suggestion_id)
        assert updated.decision_status == "accepted"
        assert updated.decision_note == "Looks right"
```

- [ ] **Step 2: Write failing frontend review component test**

Create `frontend/tests/RelationshipReview.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RelationshipReview from "../src/components/RelationshipReview";

describe("RelationshipReview", () => {
  it("renders suggestions and accepts one", () => {
    const onReview = vi.fn();
    render(
      <RelationshipReview
        suggestions={[
          {
            id: 7,
            source_label: "Orders.customer_id",
            target_label: "Customers.customer_id",
            relationship_type: "foreign_key",
            confidence: 0.94,
            evidence_summary: "3 of 3 rows match.",
            decision_status: "pending"
          }
        ]}
        onReview={onReview}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Accept relationship" }));

    expect(screen.getByText("Orders.customer_id")).toBeInTheDocument();
    expect(onReview).toHaveBeenCalledWith(7, "accepted");
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
cd backend
. .venv/bin/activate
pytest tests/test_graph_service.py -q
cd ../frontend
npm test
```

Expected:

- Backend test fails because `GraphService` does not exist.
- Frontend test fails because `RelationshipReview` does not exist.

- [ ] **Step 4: Implement graph service**

Create `backend/graphmind/services/graph_service.py`:

```python
from collections.abc import Callable

from sqlalchemy.orm import Session

from graphmind.storage.models import RelationshipSuggestion


class GraphService:
    def __init__(self, session_factory: Callable[[], Session]) -> None:
        self.session_factory = session_factory

    def review_suggestion(self, suggestion_id: int, decision_status: str, decision_note: str | None = None) -> None:
        if decision_status not in {"accepted", "edited", "rejected"}:
            raise ValueError("decision_status must be accepted, edited, or rejected")
        with self.session_factory() as session:
            suggestion = session.get(RelationshipSuggestion, suggestion_id)
            if suggestion is None:
                raise ValueError(f"Relationship suggestion not found: {suggestion_id}")
            suggestion.decision_status = decision_status
            suggestion.decision_note = decision_note
            session.commit()
```

- [ ] **Step 5: Extend API schemas**

Append to `backend/graphmind/api/schemas.py`:

```python

class RelationshipSuggestionResponse(BaseModel):
    id: int
    source_label: str
    target_label: str | None
    relationship_type: str
    confidence: float
    evidence_summary: str
    decision_status: str


class RelationshipReviewRequest(BaseModel):
    decision_status: str
    decision_note: str | None = None
```

- [ ] **Step 6: Extend API routes**

Add these imports to `backend/graphmind/api/routes.py`:

```python
from graphmind.api.schemas import RelationshipReviewRequest, RelationshipSuggestionResponse
from graphmind.services.graph_service import GraphService
from graphmind.storage.models import FieldProfile, RelationshipSuggestion, Sheet
```

Add these routes inside `create_router`:

```python
    @router.get(
        "/projects/{project_id}/relationship-suggestions",
        response_model=list[RelationshipSuggestionResponse],
    )
    def list_relationship_suggestions(project_id: int, session: Session = Depends(get_session)):
        suggestions = (
            session.query(RelationshipSuggestion)
            .filter(RelationshipSuggestion.project_id == project_id)
            .all()
        )
        fields = {
            field.id: f"{field.sheet.name}.{field.normalized_name}"
            for field in session.query(FieldProfile).join(Sheet).all()
        }
        return [
            RelationshipSuggestionResponse(
                id=suggestion.id,
                source_label=fields[suggestion.source_field_id],
                target_label=fields.get(suggestion.target_field_id)
                if suggestion.target_field_id is not None
                else None,
                relationship_type=suggestion.relationship_type,
                confidence=suggestion.confidence,
                evidence_summary=suggestion.evidence_summary,
                decision_status=suggestion.decision_status,
            )
            for suggestion in suggestions
        ]

    @router.post("/relationship-suggestions/{suggestion_id}/review")
    def review_relationship_suggestion(suggestion_id: int, payload: RelationshipReviewRequest):
        GraphService(session_factory).review_suggestion(
            suggestion_id=suggestion_id,
            decision_status=payload.decision_status,
            decision_note=payload.decision_note,
        )
        return {"status": "ok"}
```

If the import block becomes duplicated, replace the full schema import with this:

```python
from graphmind.api.schemas import (
    GraphEdgeResponse,
    GraphNodeResponse,
    GraphResponse,
    ProjectCreateRequest,
    ProjectResponse,
    RelationshipReviewRequest,
    RelationshipSuggestionResponse,
)
```

- [ ] **Step 7: Implement frontend types and client methods**

Append to `frontend/src/api/types.ts`:

```ts

export type RelationshipSuggestion = {
  id: number;
  source_label: string;
  target_label: string | null;
  relationship_type: string;
  confidence: number;
  evidence_summary: string;
  decision_status: string;
};
```

Append to `frontend/src/api/client.ts`:

```ts
import type { RelationshipSuggestion } from "./types";

export async function getRelationshipSuggestions(projectId: number): Promise<RelationshipSuggestion[]> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/relationship-suggestions`);
  if (!response.ok) {
    throw new Error(`Get relationship suggestions failed: ${response.status}`);
  }
  return response.json();
}

export async function reviewRelationshipSuggestion(
  suggestionId: number,
  decisionStatus: "accepted" | "edited" | "rejected"
): Promise<void> {
  const response = await fetch(`${API_BASE}/relationship-suggestions/${suggestionId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision_status: decisionStatus })
  });
  if (!response.ok) {
    throw new Error(`Review relationship suggestion failed: ${response.status}`);
  }
}
```

- [ ] **Step 8: Implement relationship review component**

Create `frontend/src/components/RelationshipReview.tsx`:

```tsx
import type { RelationshipSuggestion } from "../api/types";

type Props = {
  suggestions: RelationshipSuggestion[];
  onReview: (suggestionId: number, decisionStatus: "accepted" | "edited" | "rejected") => void;
};

export default function RelationshipReview({ suggestions, onReview }: Props) {
  return (
    <section className="relationship-review">
      <h2>Relationship Review</h2>
      {suggestions.length === 0 ? (
        <p>No relationship suggestions yet.</p>
      ) : (
        <div className="suggestion-list">
          {suggestions.map((suggestion) => (
            <article className="suggestion-card" key={suggestion.id}>
              <div className="suggestion-path">
                <strong>{suggestion.source_label}</strong>
                <span>{suggestion.target_label ?? "Derived dimension"}</span>
              </div>
              <p>{suggestion.evidence_summary}</p>
              <div className="suggestion-meta">
                <span>{suggestion.relationship_type}</span>
                <span>{Math.round(suggestion.confidence * 100)}%</span>
                <span>{suggestion.decision_status}</span>
              </div>
              <div className="suggestion-actions">
                <button aria-label="Accept relationship" onClick={() => onReview(suggestion.id, "accepted")}>
                  Accept
                </button>
                <button aria-label="Edit relationship" onClick={() => onReview(suggestion.id, "edited")}>
                  Edit
                </button>
                <button aria-label="Reject relationship" onClick={() => onReview(suggestion.id, "rejected")}>
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 9: Wire review component into workspace**

Replace `frontend/src/components/Workspace.tsx` with:

```tsx
import type { GraphResponse, RelationshipSuggestion } from "../api/types";
import GraphCanvas from "./GraphCanvas";
import ImportPanel from "./ImportPanel";
import RelationshipReview from "./RelationshipReview";

type Props = {
  graph: GraphResponse;
  suggestions?: RelationshipSuggestion[];
  onReview?: (suggestionId: number, decisionStatus: "accepted" | "edited" | "rejected") => void;
};

export default function Workspace({ graph, suggestions = [], onReview = () => undefined }: Props) {
  return (
    <div className="workspace-grid">
      <ImportPanel />
      <GraphCanvas graph={graph} />
      <aside className="panel review-panel">
        <RelationshipReview suggestions={suggestions} onReview={onReview} />
      </aside>
    </div>
  );
}
```

Append to `frontend/src/styles/app.css`:

```css
.relationship-review p {
  color: #607088;
}

.suggestion-list {
  display: grid;
  gap: 10px;
}

.suggestion-card {
  border: 1px solid #d7dde7;
  border-radius: 8px;
  background: #ffffff;
  padding: 10px;
}

.suggestion-path {
  display: grid;
  gap: 3px;
}

.suggestion-path strong {
  color: #172033;
  font-size: 13px;
}

.suggestion-path span {
  color: #607088;
  font-size: 12px;
}

.suggestion-meta,
.suggestion-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.suggestion-meta span {
  border: 1px solid #d7dde7;
  border-radius: 999px;
  background: #f7f9fc;
  color: #536278;
  padding: 3px 7px;
  font-size: 11px;
}

.suggestion-actions button {
  border: 1px solid #cbd4e1;
  border-radius: 7px;
  background: #ffffff;
  color: #243047;
  padding: 6px 9px;
  font-size: 12px;
  font-weight: 680;
}
```

- [ ] **Step 10: Run review tests**

Run:

```bash
cd backend
. .venv/bin/activate
pytest tests/test_graph_service.py -q
cd ../frontend
npm test
```

Expected:

- Backend graph service test passes.
- Frontend relationship review test passes.
- Existing frontend workspace test still passes.

- [ ] **Step 11: Commit**

Run:

```bash
git add backend frontend
git commit -m "feat: add relationship review loop"
```

Expected:

- Commit succeeds if the workspace has been initialized as a git repository.
- If this directory is still not a git repository, skip commit and record that in the task handoff.

## Task 9: Cited AI Answer Contract Service and Chat UI

**Files:**
- Create: `backend/graphmind/core/answer_contract.py`
- Create: `backend/graphmind/services/chat_service.py`
- Modify: `backend/graphmind/api/schemas.py`
- Modify: `backend/graphmind/api/routes.py`
- Create: `backend/tests/test_chat_service.py`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/components/ChatPanel.tsx`
- Modify: `frontend/src/components/Workspace.tsx`
- Create: `frontend/tests/ChatPanel.test.tsx`

- [ ] **Step 1: Write failing chat service test**

Create `backend/tests/test_chat_service.py`:

```python
from graphmind.services.chat_service import ChatService
from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.repositories import ProjectRepository
from graphmind.storage.workspace import WorkspacePaths


def test_chat_service_returns_cited_schema_answer(tmp_workspace, sample_csv):
    from graphmind.services.import_service import ImportService

    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        project = ProjectRepository(session).create_project("Demo")
        session.commit()
        project_id = project.id

    ImportService(paths, session_factory).import_file(project_id, sample_csv)

    service = ChatService(paths=paths, session_factory=session_factory)
    answer = service.answer_question(project_id=project_id, question="What fields are in Orders?")

    assert "Orders" in answer.content
    assert answer.answer_confidence == "high"
    assert answer.citations
    assert answer.query_plan["question_type"] == "schema_explanation"
```

- [ ] **Step 2: Write failing chat panel test**

Create `frontend/tests/ChatPanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ChatPanel from "../src/components/ChatPanel";

describe("ChatPanel", () => {
  it("submits a question and renders an answer", () => {
    const onAsk = vi.fn();
    render(
      <ChatPanel
        messages={[
          {
            role: "assistant",
            content: "Orders contains order_id and amount.",
            citations: [{ label: "Orders.order_id", source_ref: "orders.order_id" }],
            answer_confidence: "high"
          }
        ]}
        onAsk={onAsk}
      />
    );

    fireEvent.change(screen.getByLabelText("Ask about relationships"), {
      target: { value: "What fields are in Orders?" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    expect(onAsk).toHaveBeenCalledWith("What fields are in Orders?");
    expect(screen.getByText("Orders contains order_id and amount.")).toBeInTheDocument();
    expect(screen.getByText("Orders.order_id")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run chat tests to verify failure**

Run:

```bash
cd backend
. .venv/bin/activate
pytest tests/test_chat_service.py -q
cd ../frontend
npm test
```

Expected:

- Backend test fails because chat service does not exist.
- Frontend test fails because chat panel does not exist.

- [ ] **Step 4: Implement answer contract core**

Create `backend/graphmind/core/answer_contract.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Citation:
    label: str
    source_ref: str
    citation_type: str


@dataclass(frozen=True)
class CitedAnswer:
    content: str
    query_plan: dict[str, Any]
    answer_confidence: str
    citations: list[Citation]
    highlighted_graph_path: list[int]


def classify_question(question: str) -> str:
    lowered = question.lower()
    if "field" in lowered or "column" in lowered or "schema" in lowered:
        return "schema_explanation"
    if "relationship" in lowered or "connected" in lowered or "path" in lowered:
        return "relationship_path"
    if "highest" in lowered or "average" in lowered or "total" in lowered or "compare" in lowered:
        return "aggregate_analysis"
    return "unsupported"
```

- [ ] **Step 5: Implement chat service**

Create `backend/graphmind/services/chat_service.py`:

```python
from collections.abc import Callable

from sqlalchemy.orm import Session

from graphmind.core.answer_contract import Citation, CitedAnswer, classify_question
from graphmind.storage.models import FieldProfile, Sheet
from graphmind.storage.workspace import WorkspacePaths


class ChatService:
    def __init__(self, paths: WorkspacePaths, session_factory: Callable[[], Session]) -> None:
        self.paths = paths
        self.session_factory = session_factory

    def answer_question(self, project_id: int, question: str) -> CitedAnswer:
        question_type = classify_question(question)
        if question_type == "schema_explanation":
            return self._schema_answer(project_id, question)

        return CitedAnswer(
            content=(
                "I cannot answer that from the trusted graph yet. Review relationships first or ask "
                "about available fields and schema."
            ),
            query_plan={"question_type": "unsupported", "required_context": ["trusted graph path"]},
            answer_confidence="low",
            citations=[],
            highlighted_graph_path=[],
        )

    def _schema_answer(self, project_id: int, question: str) -> CitedAnswer:
        with self.session_factory() as session:
            rows = (
                session.query(Sheet, FieldProfile)
                .join(FieldProfile, FieldProfile.sheet_id == Sheet.id)
                .all()
            )

        fields_by_sheet: dict[str, list[FieldProfile]] = {}
        for sheet, field in rows:
            fields_by_sheet.setdefault(sheet.name, []).append(field)

        if not fields_by_sheet:
            return CitedAnswer(
                content="No imported sheets are available yet.",
                query_plan={"question_type": "schema_explanation", "question": question},
                answer_confidence="low",
                citations=[],
                highlighted_graph_path=[],
            )

        parts = []
        citations: list[Citation] = []
        for sheet_name, fields in fields_by_sheet.items():
            names = ", ".join(field.normalized_name for field in fields)
            parts.append(f"{sheet_name} contains: {names}.")
            citations.extend(
                Citation(
                    label=f"{sheet_name}.{field.normalized_name}",
                    source_ref=f"{sheet_name}.{field.normalized_name}",
                    citation_type="field",
                )
                for field in fields
            )

        return CitedAnswer(
            content=" ".join(parts),
            query_plan={"question_type": "schema_explanation", "question": question},
            answer_confidence="high",
            citations=citations,
            highlighted_graph_path=[],
        )
```

- [ ] **Step 6: Extend backend API schemas and routes for chat**

Append to `backend/graphmind/api/schemas.py`:

```python

class ChatRequest(BaseModel):
    question: str


class CitationResponse(BaseModel):
    label: str
    source_ref: str
    citation_type: str


class ChatAnswerResponse(BaseModel):
    content: str
    query_plan: dict[str, Any]
    answer_confidence: str
    citations: list[CitationResponse]
    highlighted_graph_path: list[int]
```

Add these imports to `backend/graphmind/api/routes.py`:

```python
from graphmind.api.schemas import ChatAnswerResponse, ChatRequest, CitationResponse
from graphmind.services.chat_service import ChatService
```

Add this route inside `create_router`:

```python
    @router.post("/projects/{project_id}/chat", response_model=ChatAnswerResponse)
    def ask_chat(project_id: int, payload: ChatRequest):
        answer = ChatService(
            paths=WorkspacePaths(workspace_root),
            session_factory=session_factory,
        ).answer_question(project_id=project_id, question=payload.question)
        return ChatAnswerResponse(
            content=answer.content,
            query_plan=answer.query_plan,
            answer_confidence=answer.answer_confidence,
            citations=[
                CitationResponse(
                    label=citation.label,
                    source_ref=citation.source_ref,
                    citation_type=citation.citation_type,
                )
                for citation in answer.citations
            ],
            highlighted_graph_path=answer.highlighted_graph_path,
        )
```

If `WorkspacePaths` is not imported in `routes.py`, add:

```python
from graphmind.storage.workspace import WorkspacePaths
```

- [ ] **Step 7: Implement frontend chat types and client**

Append to `frontend/src/api/types.ts`:

```ts

export type Citation = {
  label: string;
  source_ref: string;
  citation_type?: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  answer_confidence?: string;
};

export type ChatAnswer = {
  content: string;
  query_plan: Record<string, unknown>;
  answer_confidence: string;
  citations: Citation[];
  highlighted_graph_path: number[];
};
```

Append to `frontend/src/api/client.ts`:

```ts
import type { ChatAnswer } from "./types";

export async function askQuestion(projectId: number, question: string): Promise<ChatAnswer> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question })
  });
  if (!response.ok) {
    throw new Error(`Ask question failed: ${response.status}`);
  }
  return response.json();
}
```

- [ ] **Step 8: Implement chat panel**

Create `frontend/src/components/ChatPanel.tsx`:

```tsx
import { FormEvent, useState } from "react";
import type { ChatMessage } from "../api/types";

type Props = {
  messages: ChatMessage[];
  onAsk: (question: string) => void;
};

export default function ChatPanel({ messages, onAsk }: Props) {
  const [question, setQuestion] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) {
      return;
    }
    onAsk(trimmed);
    setQuestion("");
  }

  return (
    <section className="chat-panel">
      <h2>AI Relationship Q&A</h2>
      <div className="chat-messages">
        {messages.map((message, index) => (
          <article className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
            <p>{message.content}</p>
            {message.answer_confidence ? <small>Confidence: {message.answer_confidence}</small> : null}
            {message.citations && message.citations.length > 0 ? (
              <div className="citations">
                {message.citations.map((citation) => (
                  <span key={citation.source_ref}>{citation.label}</span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
      <form className="chat-form" onSubmit={handleSubmit}>
        <label htmlFor="relationship-question">Ask about relationships</label>
        <textarea
          id="relationship-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
        />
        <button type="submit">Ask AI</button>
      </form>
    </section>
  );
}
```

- [ ] **Step 9: Wire chat into workspace**

Modify `frontend/src/components/Workspace.tsx` to include chat below relationship review:

```tsx
import type { ChatMessage, GraphResponse, RelationshipSuggestion } from "../api/types";
import ChatPanel from "./ChatPanel";
import GraphCanvas from "./GraphCanvas";
import ImportPanel from "./ImportPanel";
import RelationshipReview from "./RelationshipReview";

type Props = {
  graph: GraphResponse;
  suggestions?: RelationshipSuggestion[];
  messages?: ChatMessage[];
  onReview?: (suggestionId: number, decisionStatus: "accepted" | "edited" | "rejected") => void;
  onAsk?: (question: string) => void;
};

export default function Workspace({
  graph,
  suggestions = [],
  messages = [],
  onReview = () => undefined,
  onAsk = () => undefined
}: Props) {
  return (
    <div className="workspace-grid">
      <ImportPanel />
      <GraphCanvas graph={graph} />
      <aside className="panel review-panel">
        <RelationshipReview suggestions={suggestions} onReview={onReview} />
        <ChatPanel messages={messages} onAsk={onAsk} />
      </aside>
    </div>
  );
}
```

Append to `frontend/src/styles/app.css`:

```css
.chat-panel {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #d7dde7;
}

.chat-messages {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

.chat-message {
  border-radius: 8px;
  padding: 10px;
  font-size: 13px;
  line-height: 1.45;
}

.chat-message p {
  margin: 0;
}

.chat-message.user {
  background: #eef3ff;
}

.chat-message.assistant {
  border: 1px solid #d7dde7;
  background: #fbfcfe;
}

.chat-message small {
  display: block;
  color: #607088;
  margin-top: 6px;
}

.citations {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

.citations span {
  border: 1px solid #d7dde7;
  border-radius: 999px;
  background: #f7f9fc;
  color: #536278;
  padding: 3px 7px;
  font-size: 11px;
}

.chat-form {
  display: grid;
  gap: 7px;
}

.chat-form label {
  color: #243047;
  font-weight: 720;
  font-size: 12px;
}

.chat-form textarea {
  resize: vertical;
  border: 1px solid #cbd4e1;
  border-radius: 8px;
  padding: 8px;
}

.chat-form button {
  border: 1px solid #1d7a6f;
  border-radius: 7px;
  background: #1d7a6f;
  color: #ffffff;
  padding: 8px 10px;
  font-weight: 760;
}
```

- [ ] **Step 10: Run chat tests and full suites**

Run:

```bash
cd backend
. .venv/bin/activate
pytest -q
cd ../frontend
npm test
npm run build
```

Expected:

- Backend tests pass.
- Frontend tests pass.
- Frontend production build succeeds.

- [ ] **Step 11: Commit**

Run:

```bash
git add backend frontend
git commit -m "feat: add cited relationship chat"
```

Expected:

- Commit succeeds if the workspace has been initialized as a git repository.
- If this directory is still not a git repository, skip commit and record that in the task handoff.

## Task 10: End-to-End Local Run and Documentation

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Modify: `docs/superpowers/plans/2026-05-25-graphmind-mvp-implementation.md`

- [x] **Step 1: Create gitignore**

Create `.gitignore`:

```gitignore
.DS_Store
.venv/
__pycache__/
.pytest_cache/
.ruff_cache/
node_modules/
dist/
.graphmind/
.superpowers/
*.duckdb
*.sqlite3
```

- [x] **Step 2: Create README**

Create `README.md`:

````markdown
# GraphMind

GraphMind is a local-first web app for turning spreadsheet files into an editable relationship graph with cited AI-style Q&A.

## MVP Scope

- Upload CSV/XLSX files.
- Profile sheets and fields.
- Infer candidate relationships.
- Review relationship suggestions.
- Visualize the graph.
- Ask questions that return cited answers.

## Backend

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
uvicorn graphmind.api.app:app --reload --host 127.0.0.1 --port 8000
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Tests

```bash
cd backend
. .venv/bin/activate
pytest -q
ruff check graphmind tests

cd ../frontend
npm test
npm run build
```
````

- [x] **Step 3: Run backend server**

Run:

```bash
cd backend
. .venv/bin/activate
uvicorn graphmind.api.app:app --host 127.0.0.1 --port 8000
```

Expected:

- Server starts and logs that it is listening on `http://127.0.0.1:8000`.

- [x] **Step 4: Run frontend dev server in another terminal**

Run:

```bash
cd frontend
npm run dev -- --host 127.0.0.1
```

Expected:

- Vite starts and prints a local URL, usually `http://127.0.0.1:5173/`.

- [x] **Step 5: Verify browser smoke path**

Open `http://127.0.0.1:5173/`.

Expected:

- Top bar shows GraphMind.
- Left panel shows Data Intake.
- Center panel shows Relationship Graph.
- Right panel shows Relationship Review and AI Relationship Q&A.
- If backend is running, the page does not show "Backend unavailable."

- [x] **Step 6: Run full verification**

Run:

```bash
cd backend
. .venv/bin/activate
pytest -q
ruff check graphmind tests
cd ../frontend
npm test
npm run build
```

Expected:

- Backend tests pass.
- Ruff reports no issues.
- Frontend tests pass.
- Frontend build succeeds.

- [x] **Step 7: Commit**

Run:

```bash
git add README.md .gitignore docs/superpowers/plans/2026-05-25-graphmind-mvp-implementation.md
git commit -m "docs: add GraphMind MVP runbook"
```

Expected:

- Commit succeeds if the workspace has been initialized as a git repository.
- If this directory is still not a git repository, skip commit and record that in the task handoff.

Task 10 handoff note: this workspace is not a git repository, so the commit step was skipped.

## Plan Self-Review

Spec coverage:

- CSV/XLSX import is covered by Task 5 and Task 6 API scaffolding.
- Profiling is covered by Task 3 and Task 5 persistence.
- Relationship inference is covered by Task 4.
- User confirmation is covered by Task 8.
- Graph visualization is covered by Task 7.
- Strict cited AI answer behavior is covered by Task 9.
- SQLite and DuckDB storage are covered by Task 2 and Task 5.
- Error handling starts with unsupported file type and backend unavailable states in Task 5 and Task 7, with deeper UI warnings deferred to later refinement.
- Testing fixtures and verification are covered across backend and frontend tasks.

Red-flag scan:

- No unresolved planning instructions remain.

Type consistency:

- Backend dataclass names match service and test imports.
- API response types match frontend `types.ts`.
- Relationship decision statuses consistently use `accepted`, `edited`, and `rejected`.
- Graph node and edge response fields use numeric database IDs in the frontend-facing API.
