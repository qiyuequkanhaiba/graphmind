# GraphMind Professional Knowledge Graph Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the MVP relationship graph into a professional semantic exploration surface with evidence-backed edge inspection, graph filters, review linkage, and AI path highlighting.

**Architecture:** Keep the current FastAPI + SQLite + DuckDB backend and React + React Flow frontend. Extend the graph API contract first so the frontend can treat edges as evidence-bearing semantic objects, then build focused frontend components for graph semantics, custom nodes, canvas controls, and the evidence inspector. Keep all new behavior inside the existing single workspace route.

**Tech Stack:** Python, FastAPI, SQLAlchemy, SQLite JSON columns, pytest, React, TypeScript, React Flow, Vitest, Testing Library, CSS.

---

## File Structure

Modify backend files:

- `backend/graphmind/storage/models.py`: add persisted edge metadata to `GraphEdge`.
- `backend/graphmind/storage/database.py`: migrate existing SQLite databases with the new edge metadata column.
- `backend/graphmind/storage/repositories.py`: persist graph builder edge metadata.
- `backend/graphmind/api/schemas.py`: extend graph edge and relationship suggestion response schemas.
- `backend/graphmind/api/routes.py`: return edge evidence, suggestion linkage, and structured suggestion payloads.
- `backend/tests/test_api.py`: cover the expanded API contract.
- `backend/tests/test_storage.py`: cover the new storage column.

Modify or create frontend files:

- `frontend/src/api/types.ts`: extend graph and suggestion types, add shared graph selection/filter types.
- Create `frontend/src/components/graph/graphSemantics.ts`: pure helpers for labels, filters, evidence rows, and selection lookup.
- Create `frontend/src/components/graph/SemanticNode.tsx`: custom React Flow node renderer.
- Modify `frontend/src/components/GraphCanvas.tsx`: replace default nodes with semantic graph UI, filters, controls, selection, and path highlighting.
- Create `frontend/src/components/EvidenceInspector.tsx`: right-panel edge/node inspector and review actions.
- Modify `frontend/src/components/Workspace.tsx`: own graph selection state and place the inspector above review/chat.
- Modify `frontend/src/components/RelationshipReview.tsx`: keep list behavior compatible with expanded suggestion type.
- Modify `frontend/src/App.tsx`: refresh graph after review and store AI highlighted path from chat answers.
- Modify `frontend/src/state/workspaceStore.ts`: include highlighted graph path in workspace state.
- Modify `frontend/src/styles/app.css`: professional semantic graph, inspector, filters, and responsive polish.
- Create `frontend/tests/graphSemantics.test.ts`: test pure filter and formatting helpers.
- Create `frontend/tests/GraphCanvas.test.tsx`: test canvas controls, semantic nodes, filters, selection, and highlight classes.
- Create `frontend/tests/EvidenceInspector.test.tsx`: test edge evidence, node details, read-only structure edges, and review actions.
- Modify `frontend/tests/App.test.tsx`: update API mocks and verify review refresh + chat path storage.
- Modify `frontend/tests/RelationshipReview.test.tsx`: update fixture suggestions with new response fields.
- Modify `frontend/tests/Workspace.test.tsx`: verify the inspector and graph canvas render together.

This workspace is not a git repository. At each checkpoint, run `git rev-parse --is-inside-work-tree`; if it fails with `fatal: not a git repository`, skip the commit command and record that the checkpoint was verified without a commit.

## Task 1: Backend Evidence Contract

**Files:**
- Modify: `backend/graphmind/storage/models.py`
- Modify: `backend/graphmind/storage/database.py`
- Modify: `backend/graphmind/storage/repositories.py`
- Modify: `backend/graphmind/api/schemas.py`
- Modify: `backend/graphmind/api/routes.py`
- Modify: `backend/tests/test_api.py`
- Modify: `backend/tests/test_storage.py`

- [ ] **Step 1: Write failing backend API tests**

In `backend/tests/test_api.py`, update the expected edge objects in `test_get_graph_maps_fields_and_orders_by_id` so each edge contains the new response fields. Replace the two expected edge dictionaries with:

```python
            {
                "id": first_edge_id,
                "source_node_id": first_node_id,
                "target_node_id": second_node_id,
                "edge_type": "contains",
                "confidence": 0.75,
                "status": "accepted",
                "evidence_ref": "manual:2",
                "created_from_suggestion_id": None,
                "metadata": {},
                "evidence_summary": None,
                "evidence_payload": None,
            },
            {
                "id": second_edge_id,
                "source_node_id": second_node_id,
                "target_node_id": first_node_id,
                "edge_type": "belongs_to",
                "confidence": 0.9,
                "status": "suggested",
                "evidence_ref": "suggestion:1",
                "created_from_suggestion_id": None,
                "metadata": {},
                "evidence_summary": None,
                "evidence_payload": None,
            },
```

Add this test after `test_get_graph_maps_fields_and_orders_by_id`:

```python
def test_get_graph_returns_edge_evidence_and_suggestion_linkage(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Evidence Project", settings={})
        session.add(project)
        session.flush()

        dataset = Dataset(
            project_id=project.id,
            filename="orders.csv",
            file_type="csv",
            raw_data_ref="imports/orders.csv",
        )
        session.add(dataset)
        session.flush()

        sheet = Sheet(
            dataset_id=dataset.id,
            name="Orders",
            normalized_name="orders",
            row_count=3,
            column_count=2,
            duckdb_table_name="orders",
        )
        session.add(sheet)
        session.flush()

        source = FieldProfile(
            sheet_id=sheet.id,
            original_name="Customer ID",
            normalized_name="customer_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1", "c2"],
            key_candidate_score=0.88,
        )
        target = FieldProfile(
            sheet_id=sheet.id,
            original_name="Account ID",
            normalized_name="account_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1", "c2"],
            key_candidate_score=0.8,
        )
        session.add_all([source, target])
        session.flush()

        suggestion = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=source.id,
            target_field_id=target.id,
            relationship_type="foreign_key",
            confidence=0.94,
            evidence_summary="2 of 2 distinct source values overlap.",
            evidence_payload={"overlap_count": 2, "source_match_ratio": 1.0},
            decision_status="pending",
        )
        session.add(suggestion)
        session.flush()

        source_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={"inferred_type": "string"},
            position_x=0,
            position_y=0,
        )
        target_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.account_id",
            source_ref="orders.account_id",
            node_metadata={"inferred_type": "string"},
            position_x=160,
            position_y=0,
        )
        session.add_all([source_node, target_node])
        session.flush()

        edge = GraphEdge(
            project_id=project.id,
            source_node_id=source_node.id,
            target_node_id=target_node.id,
            edge_type="foreign_key",
            confidence=0.94,
            status="suggested",
            evidence_ref="suggestion:0",
            edge_metadata={"evidence_payload": {"overlap_count": 2}},
            created_from_suggestion_id=suggestion.id,
        )
        session.add(edge)
        session.commit()

        project_id = project.id
        edge_id = edge.id
        source_node_id = source_node.id
        target_node_id = target_node.id
        suggestion_id = suggestion.id

    response = client.get(f"/api/projects/{project_id}/graph")

    assert response.status_code == 200
    body = response.json()
    assert body["edges"] == [
        {
            "id": edge_id,
            "source_node_id": source_node_id,
            "target_node_id": target_node_id,
            "edge_type": "foreign_key",
            "confidence": 0.94,
            "status": "suggested",
            "evidence_ref": "suggestion:0",
            "created_from_suggestion_id": suggestion_id,
            "metadata": {"evidence_payload": {"overlap_count": 2}},
            "evidence_summary": "2 of 2 distinct source values overlap.",
            "evidence_payload": {"overlap_count": 2, "source_match_ratio": 1.0},
        }
    ]
```

Update `test_get_relationship_suggestions_maps_field_labels_for_project` so the expected suggestion object is:

```python
        {
            "id": suggestion_id,
            "source_field_id": source_id,
            "target_field_id": target_id,
            "source_label": "Orders.customer_id",
            "target_label": "Orders.account_id",
            "relationship_type": "same_entity",
            "confidence": 0.91,
            "evidence_summary": "Matched identifiers.",
            "evidence_payload": {"overlap": 0.95},
            "decision_status": "pending",
        }
```

Before leaving the setup `with` block in that test, store:

```python
        source_id = source.id
        target_id = target.id
```

Update `test_get_relationship_suggestions_uses_none_for_missing_target` so the expected suggestion object is:

```python
        {
            "id": suggestion_id,
            "source_field_id": source_id,
            "target_field_id": None,
            "source_label": "Orders.customer_id",
            "target_label": None,
            "relationship_type": "derived_dimension",
            "confidence": 0.82,
            "evidence_summary": "Repeated values.",
            "evidence_payload": {},
            "decision_status": "pending",
        }
```

Before leaving the setup `with` block in that test, store:

```python
        source_id = source.id
```

- [ ] **Step 2: Write failing storage test**

In `backend/tests/test_storage.py`, update the imports to include `GraphNode` and `RelationshipSuggestion`:

```python
from graphmind.storage.models import Dataset, GraphEdge, GraphNode, Project, RelationshipSuggestion
```

Add this test after `test_graph_edge_created_from_suggestion_has_foreign_key`:

```python
def test_graph_edge_metadata_round_trips(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Edge Metadata", settings={})
        session.add(project)
        session.flush()

        source = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        target = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Customers.customer_id",
            source_ref="customers.customer_id",
            node_metadata={},
            position_x=120,
            position_y=0,
        )
        session.add_all([source, target])
        session.flush()

        edge = GraphEdge(
            project_id=project.id,
            source_node_id=source.id,
            target_node_id=target.id,
            edge_type="foreign_key",
            confidence=0.91,
            status="suggested",
            evidence_ref="suggestion:0",
            edge_metadata={"evidence_payload": {"overlap_count": 3}},
        )
        session.add(edge)
        session.commit()
        edge_id = edge.id

    with session_factory() as session:
        saved = session.get(GraphEdge, edge_id)
        assert saved is not None
        assert saved.edge_metadata == {"evidence_payload": {"overlap_count": 3}}
```

- [ ] **Step 3: Run backend tests and verify they fail**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/backend
pytest tests/test_api.py tests/test_storage.py -q
```

Expected: failures mention missing `edge_metadata`, missing `created_from_suggestion_id`, missing `metadata`, missing `evidence_payload`, or unexpected response keys.

- [ ] **Step 4: Add graph edge metadata storage**

In `backend/graphmind/storage/models.py`, add `edge_metadata` to `GraphEdge` after `evidence_ref`:

```python
    edge_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
```

In `backend/graphmind/storage/database.py`, update `_migrate_existing_database` so it also migrates `graph_edges`. Keep the existing project migration and add this block before the function returns:

```python
        graph_edge_columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(graph_edges)").fetchall()
        }
        if graph_edge_columns and "edge_metadata" not in graph_edge_columns:
            connection.exec_driver_sql("ALTER TABLE graph_edges ADD COLUMN edge_metadata JSON")
```

In `backend/graphmind/storage/repositories.py`, update `ImportRepository.add_graph` so saved graph edges persist metadata:

```python
            saved = GraphEdge(
                project_id=graph.project_id,
                source_node_id=source_node_id,
                target_node_id=target_node_id,
                edge_type=edge.edge_type,
                confidence=edge.confidence,
                status=edge.status,
                evidence_ref=edge.evidence_ref,
                edge_metadata=edge.metadata,
                created_from_suggestion_id=None,
            )
```

- [ ] **Step 5: Extend API schemas**

In `backend/graphmind/api/schemas.py`, replace `GraphEdgeResponse` with:

```python
class GraphEdgeResponse(BaseModel):
    id: int
    source_node_id: int
    target_node_id: int
    edge_type: str
    confidence: float
    status: str
    evidence_ref: str
    created_from_suggestion_id: int | None
    metadata: dict[str, Any]
    evidence_summary: str | None
    evidence_payload: dict[str, Any] | None
```

Replace `RelationshipSuggestionResponse` with:

```python
class RelationshipSuggestionResponse(BaseModel):
    id: int
    source_field_id: int
    target_field_id: int | None
    source_label: str
    target_label: str | None
    relationship_type: str
    confidence: float
    evidence_summary: str
    evidence_payload: dict[str, Any]
    decision_status: str
```

- [ ] **Step 6: Return evidence data from routes**

In `backend/graphmind/api/routes.py`, update both graph response paths to use one `_graph_response` helper. Replace the body of `get_graph` after the project existence check with:

```python
        return _graph_response(project_id, session)
```

Replace `_graph_response` with:

```python
    def _graph_response(project_id: int, session: Session) -> GraphResponse:
        nodes = (
            session.query(GraphNode)
            .filter(GraphNode.project_id == project_id)
            .order_by(GraphNode.id)
            .all()
        )
        edges = (
            session.query(GraphEdge)
            .filter(GraphEdge.project_id == project_id)
            .order_by(GraphEdge.id)
            .all()
        )
        suggestion_ids = {
            edge.created_from_suggestion_id
            for edge in edges
            if edge.created_from_suggestion_id is not None
        }
        suggestions_by_id = (
            {
                suggestion.id: suggestion
                for suggestion in session.query(RelationshipSuggestion)
                .filter(RelationshipSuggestion.id.in_(suggestion_ids))
                .all()
            }
            if suggestion_ids
            else {}
        )

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
                _graph_edge_response(edge, suggestions_by_id.get(edge.created_from_suggestion_id))
                for edge in edges
            ],
        )
```

Add this helper below `_graph_response`:

```python
    def _graph_edge_response(
        edge: GraphEdge,
        suggestion: RelationshipSuggestion | None,
    ) -> GraphEdgeResponse:
        edge_metadata = edge.edge_metadata or {}
        return GraphEdgeResponse(
            id=edge.id,
            source_node_id=edge.source_node_id,
            target_node_id=edge.target_node_id,
            edge_type=edge.edge_type,
            confidence=edge.confidence,
            status=edge.status,
            evidence_ref=edge.evidence_ref,
            created_from_suggestion_id=edge.created_from_suggestion_id,
            metadata=edge_metadata,
            evidence_summary=(
                suggestion.evidence_summary
                if suggestion is not None
                else edge_metadata.get("evidence_summary")
            ),
            evidence_payload=(
                suggestion.evidence_payload
                if suggestion is not None
                else edge_metadata.get("evidence_payload")
            ),
        )
```

Update `_relationship_suggestion_response` to return the new fields:

```python
        return RelationshipSuggestionResponse(
            id=suggestion.id,
            source_field_id=suggestion.source_field_id,
            target_field_id=suggestion.target_field_id,
            source_label=field_labels[suggestion.source_field_id],
            target_label=(
                field_labels.get(suggestion.target_field_id)
                if suggestion.target_field_id is not None
                else None
            ),
            relationship_type=suggestion.relationship_type,
            confidence=suggestion.confidence,
            evidence_summary=suggestion.evidence_summary,
            evidence_payload=suggestion.evidence_payload,
            decision_status=suggestion.decision_status,
        )
```

- [ ] **Step 7: Run backend tests and fix expected fixtures**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/backend
pytest tests/test_api.py tests/test_storage.py -q
```

Expected: PASS after all expected response objects include the new fields.

- [ ] **Step 8: Run full backend verification**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/backend
pytest -q
ruff check graphmind tests
```

Expected: all tests pass and ruff reports no issues.

- [ ] **Step 9: Checkpoint**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind
git rev-parse --is-inside-work-tree
```

If it prints `true`, run:

```bash
git add backend/graphmind/storage/models.py backend/graphmind/storage/database.py backend/graphmind/storage/repositories.py backend/graphmind/api/schemas.py backend/graphmind/api/routes.py backend/tests/test_api.py backend/tests/test_storage.py
git commit -m "feat: expose graph edge evidence"
```

If it fails with `fatal: not a git repository`, skip the commit and continue.

## Task 2: Frontend Graph Semantics Layer

**Files:**
- Modify: `frontend/src/api/types.ts`
- Create: `frontend/src/components/graph/graphSemantics.ts`
- Create: `frontend/tests/graphSemantics.test.ts`

- [ ] **Step 1: Write failing pure helper tests**

Create `frontend/tests/graphSemantics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode } from "../src/api/types";
import {
  edgeMatchesFilters,
  evidenceRowsFromPayload,
  formatConfidence,
  getEdgeClassName,
  getRelationshipLabel,
  getSelectionForEdge,
  getSelectionForNode,
  nodeSubtitle
} from "../src/components/graph/graphSemantics";

const tableNode: GraphNode = {
  id: 1,
  node_type: "table",
  label: "Orders",
  source_ref: "orders",
  metadata: { row_count: 3, column_count: 5 },
  position_x: 0,
  position_y: 0
};

const sourceNode: GraphNode = {
  id: 2,
  node_type: "field",
  label: "Orders.customer_id",
  source_ref: "orders.customer_id",
  metadata: { inferred_type: "string", key_candidate_score: 0.91 },
  position_x: 100,
  position_y: 0
};

const targetNode: GraphNode = {
  id: 3,
  node_type: "field",
  label: "Customers.customer_id",
  source_ref: "customers.customer_id",
  metadata: { inferred_type: "string" },
  position_x: 240,
  position_y: 0
};

const edge: GraphEdge = {
  id: 10,
  source_node_id: 2,
  target_node_id: 3,
  edge_type: "foreign_key",
  confidence: 0.94,
  status: "suggested",
  evidence_ref: "suggestion:0",
  created_from_suggestion_id: 7,
  metadata: {},
  evidence_summary: "2 of 2 values overlap.",
  evidence_payload: { overlap_count: 2, source_match_ratio: 1 }
};

describe("graphSemantics", () => {
  it("formats graph labels and classes", () => {
    expect(formatConfidence(0.944)).toBe("94%");
    expect(getRelationshipLabel("foreign_key")).toBe("Foreign key");
    expect(getEdgeClassName(edge, [10])).toContain("semantic-edge-foreign-key");
    expect(getEdgeClassName(edge, [10])).toContain("is-highlighted");
  });

  it("creates subtitles from node metadata", () => {
    expect(nodeSubtitle(tableNode)).toBe("3 rows · 5 fields");
    expect(nodeSubtitle(sourceNode)).toBe("string · key 91%");
  });

  it("filters edges by status, type, confidence, and rejected default", () => {
    expect(
      edgeMatchesFilters(edge, {
        statuses: { auto_trusted: true, suggested: true, accepted: true, edited: true, rejected: false },
        types: { contains_field: true, foreign_key: true, derived_dimension: true },
        minConfidence: 0.9
      })
    ).toBe(true);
    expect(
      edgeMatchesFilters(edge, {
        statuses: { auto_trusted: true, suggested: false, accepted: true, edited: true, rejected: false },
        types: { contains_field: true, foreign_key: true, derived_dimension: true },
        minConfidence: 0.9
      })
    ).toBe(false);
    expect(
      edgeMatchesFilters(edge, {
        statuses: { auto_trusted: true, suggested: true, accepted: true, edited: true, rejected: false },
        types: { contains_field: true, foreign_key: false, derived_dimension: true },
        minConfidence: 0.9
      })
    ).toBe(false);
    expect(
      edgeMatchesFilters(edge, {
        statuses: { auto_trusted: true, suggested: true, accepted: true, edited: true, rejected: false },
        types: { contains_field: true, foreign_key: true, derived_dimension: true },
        minConfidence: 0.95
      })
    ).toBe(false);
  });

  it("builds selections with source and target lookup", () => {
    expect(getSelectionForNode("1", [tableNode], [edge])).toEqual({
      kind: "node",
      node: tableNode,
      adjacentEdges: []
    });
    expect(getSelectionForEdge("10", [sourceNode, targetNode], [edge])).toEqual({
      kind: "edge",
      edge,
      sourceNode,
      targetNode
    });
  });

  it("turns evidence payloads into readable rows", () => {
    expect(evidenceRowsFromPayload({ overlap_count: 2, source_match_ratio: 1 })).toEqual([
      { label: "Overlap count", value: "2" },
      { label: "Source match ratio", value: "100%" }
    ]);
  });
});
```

- [ ] **Step 2: Run frontend helper tests and verify they fail**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- graphSemantics.test.ts
```

Expected: FAIL because `graphSemantics.ts` and the expanded types do not exist.

- [ ] **Step 3: Extend shared frontend types**

Replace `frontend/src/api/types.ts` with:

```ts
export type GraphNodeType = "table" | "field" | "derived_entity";

export type GraphEdgeStatus = "auto_trusted" | "suggested" | "accepted" | "edited" | "rejected";

export type GraphEdgeType = "contains_field" | "foreign_key" | "derived_dimension" | string;

export type GraphNode = {
  id: number;
  node_type: GraphNodeType;
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
  edge_type: GraphEdgeType;
  confidence: number;
  status: GraphEdgeStatus | string;
  evidence_ref: string;
  created_from_suggestion_id: number | null;
  metadata: Record<string, unknown>;
  evidence_summary: string | null;
  evidence_payload: Record<string, unknown> | null;
};

export type GraphResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type RelationshipDecisionStatus = "pending" | "accepted" | "edited" | "rejected";

export type RelationshipSuggestion = {
  id: number;
  source_field_id: number;
  target_field_id: number | null;
  source_label: string;
  target_label: string | null;
  relationship_type: string;
  confidence: number;
  evidence_summary: string;
  evidence_payload: Record<string, unknown>;
  decision_status: RelationshipDecisionStatus;
};

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
  highlighted_graph_path?: number[];
};

export type ChatAnswer = {
  content: string;
  query_plan: Record<string, unknown>;
  answer_confidence: string;
  citations: Citation[];
  highlighted_graph_path: number[];
};

export type ImportResult = {
  dataset_id: number;
  sheet_count: number;
  field_count: number;
  suggestion_count: number;
  graph_node_count: number;
  graph_edge_count: number;
  graph: GraphResponse;
  suggestions: RelationshipSuggestion[];
};

export type GraphSelection =
  | {
      kind: "node";
      node: GraphNode;
      adjacentEdges: GraphEdge[];
    }
  | {
      kind: "edge";
      edge: GraphEdge;
      sourceNode?: GraphNode;
      targetNode?: GraphNode;
    };

export type GraphFilters = {
  statuses: Record<GraphEdgeStatus, boolean>;
  types: Record<"contains_field" | "foreign_key" | "derived_dimension", boolean>;
  minConfidence: number;
};
```

- [ ] **Step 4: Create graph semantics helpers**

Create `frontend/src/components/graph/graphSemantics.ts`:

```ts
import type { GraphEdge, GraphFilters, GraphNode, GraphSelection } from "../../api/types";

export const defaultGraphFilters: GraphFilters = {
  statuses: {
    auto_trusted: true,
    suggested: true,
    accepted: true,
    edited: true,
    rejected: false
  },
  types: {
    contains_field: true,
    foreign_key: true,
    derived_dimension: true
  },
  minConfidence: 0
};

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function getRelationshipLabel(edgeType: string): string {
  const labels: Record<string, string> = {
    contains_field: "Contains field",
    foreign_key: "Foreign key",
    derived_dimension: "Dimension"
  };
  return labels[edgeType] ?? edgeType.replaceAll("_", " ");
}

export function getNodeKindLabel(nodeType: string): string {
  const labels: Record<string, string> = {
    table: "Table",
    field: "Field",
    derived_entity: "Dimension"
  };
  return labels[nodeType] ?? nodeType;
}

function numberMetadata(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function nodeSubtitle(node: GraphNode): string {
  if (node.node_type === "table") {
    const rows = numberMetadata(node.metadata, "row_count");
    const columns = numberMetadata(node.metadata, "column_count");
    if (rows !== null && columns !== null) {
      return `${rows} rows · ${columns} fields`;
    }
  }

  if (node.node_type === "field") {
    const inferredType = String(node.metadata.inferred_type ?? "unknown");
    const keyScore = numberMetadata(node.metadata, "key_candidate_score");
    return keyScore === null ? inferredType : `${inferredType} · key ${formatConfidence(keyScore)}`;
  }

  const uniqueCount = numberMetadata(node.metadata, "unique_count");
  return uniqueCount === null ? "derived dimension" : `${uniqueCount} values`;
}

export function getEdgeClassName(edge: GraphEdge, highlightedGraphPath: number[] = []): string {
  const typeClass = edge.edge_type.replaceAll("_", "-");
  const statusClass = String(edge.status).replaceAll("_", "-");
  const highlighted = highlightedGraphPath.includes(edge.id) ? " is-highlighted" : "";
  return `semantic-edge semantic-edge-${typeClass} edge-status-${statusClass}${highlighted}`;
}

export function edgeMatchesFilters(edge: GraphEdge, filters: GraphFilters): boolean {
  const status = edge.status as keyof GraphFilters["statuses"];
  const type = edge.edge_type as keyof GraphFilters["types"];
  const statusVisible = filters.statuses[status] ?? true;
  const typeVisible = filters.types[type] ?? true;
  return statusVisible && typeVisible && edge.confidence >= filters.minConfidence;
}

export function graphNodeIsVisibleForMode(
  node: GraphNode,
  viewMode: "table" | "field" | "entity"
): boolean {
  if (viewMode === "table") {
    return node.node_type === "table" || node.node_type === "field";
  }
  if (viewMode === "entity") {
    return node.node_type === "field" || node.node_type === "derived_entity";
  }
  return true;
}

export function edgeIsVisibleForMode(
  edge: GraphEdge,
  viewMode: "table" | "field" | "entity"
): boolean {
  if (viewMode === "table") {
    return edge.edge_type === "contains_field";
  }
  if (viewMode === "entity") {
    return edge.edge_type === "derived_dimension";
  }
  return edge.edge_type !== "derived_dimension";
}

export function getSelectionForNode(
  nodeId: string,
  nodes: GraphNode[],
  edges: GraphEdge[]
): GraphSelection | null {
  const id = Number(nodeId);
  const node = nodes.find((candidate) => candidate.id === id);
  if (!node) {
    return null;
  }
  return {
    kind: "node",
    node,
    adjacentEdges: edges.filter((edge) => edge.source_node_id === id || edge.target_node_id === id)
  };
}

export function getSelectionForEdge(
  edgeId: string,
  nodes: GraphNode[],
  edges: GraphEdge[]
): GraphSelection | null {
  const id = Number(edgeId);
  const edge = edges.find((candidate) => candidate.id === id);
  if (!edge) {
    return null;
  }
  return {
    kind: "edge",
    edge,
    sourceNode: nodes.find((node) => node.id === edge.source_node_id),
    targetNode: nodes.find((node) => node.id === edge.target_node_id)
  };
}

export function evidenceRowsFromPayload(
  payload: Record<string, unknown> | null | undefined
): { label: string; value: string }[] {
  if (!payload) {
    return [];
  }

  return Object.entries(payload).map(([key, rawValue]) => ({
    label: key
      .split("_")
      .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
      .join(" "),
    value: formatEvidenceValue(rawValue)
  }));
}

function formatEvidenceValue(value: unknown): string {
  if (typeof value === "number") {
    if (value >= 0 && value <= 1 && !Number.isInteger(value)) {
      return formatConfidence(value);
    }
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (value === null || value === undefined) {
    return "empty";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
```

- [ ] **Step 5: Run helper tests**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- graphSemantics.test.ts
```

Expected: PASS.

- [ ] **Step 6: Checkpoint**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind
git rev-parse --is-inside-work-tree
```

If it prints `true`, run:

```bash
git add frontend/src/api/types.ts frontend/src/components/graph/graphSemantics.ts frontend/tests/graphSemantics.test.ts
git commit -m "feat: add frontend graph semantics"
```

If it fails with `fatal: not a git repository`, skip the commit and continue.

## Task 3: Professional React Flow Canvas

**Files:**
- Create: `frontend/src/components/graph/SemanticNode.tsx`
- Modify: `frontend/src/components/GraphCanvas.tsx`
- Create: `frontend/tests/GraphCanvas.test.tsx`

- [ ] **Step 1: Write failing GraphCanvas tests**

Create `frontend/tests/GraphCanvas.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraphResponse } from "../src/api/types";
import GraphCanvas from "../src/components/GraphCanvas";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub;

const graph: GraphResponse = {
  nodes: [
    {
      id: 1,
      node_type: "table",
      label: "Orders",
      source_ref: "orders",
      metadata: { row_count: 3, column_count: 2 },
      position_x: 80,
      position_y: 80
    },
    {
      id: 2,
      node_type: "field",
      label: "Orders.customer_id",
      source_ref: "orders.customer_id",
      metadata: { inferred_type: "string", key_candidate_score: 0.91 },
      position_x: 80,
      position_y: 180
    },
    {
      id: 3,
      node_type: "field",
      label: "Customers.customer_id",
      source_ref: "customers.customer_id",
      metadata: { inferred_type: "string", key_candidate_score: 0.99 },
      position_x: 360,
      position_y: 180
    },
    {
      id: 4,
      node_type: "derived_entity",
      label: "customer_id values",
      source_ref: "Orders.customer_id",
      metadata: { unique_count: 2 },
      position_x: 620,
      position_y: 180
    }
  ],
  edges: [
    {
      id: 10,
      source_node_id: 1,
      target_node_id: 2,
      edge_type: "contains_field",
      confidence: 1,
      status: "auto_trusted",
      evidence_ref: "field:orders.customer_id",
      created_from_suggestion_id: null,
      metadata: {},
      evidence_summary: null,
      evidence_payload: null
    },
    {
      id: 11,
      source_node_id: 2,
      target_node_id: 3,
      edge_type: "foreign_key",
      confidence: 0.94,
      status: "suggested",
      evidence_ref: "suggestion:0",
      created_from_suggestion_id: 7,
      metadata: {},
      evidence_summary: "2 of 2 values overlap.",
      evidence_payload: { overlap_count: 2 }
    },
    {
      id: 12,
      source_node_id: 2,
      target_node_id: 4,
      edge_type: "derived_dimension",
      confidence: 0.76,
      status: "suggested",
      evidence_ref: "suggestion:1",
      created_from_suggestion_id: 8,
      metadata: {},
      evidence_summary: "Can be explored as a dimension.",
      evidence_payload: { unique_count: 2 }
    }
  ]
};

describe("GraphCanvas", () => {
  it("renders professional semantic nodes and graph controls", () => {
    render(<GraphCanvas graph={graph} highlightedGraphPath={[11]} />);

    expect(screen.getByRole("heading", { name: "Relationship Graph" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Table view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Field view" })).toHaveClass("active");
    expect(screen.getByLabelText("Suggested")).toBeChecked();
    expect(screen.getByLabelText("Rejected")).not.toBeChecked();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("3 rows · 2 fields")).toBeInTheDocument();
    expect(screen.getByText("Orders.customer_id")).toBeInTheDocument();
    expect(screen.getByText("string · key 91%")).toBeInTheDocument();
  });

  it("filters edges by status and confidence threshold", () => {
    render(<GraphCanvas graph={graph} />);

    expect(screen.getByText("Foreign key")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Suggested"));
    expect(screen.queryByText("Foreign key")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Suggested"));
    fireEvent.change(screen.getByLabelText("Minimum confidence"), {
      target: { value: "0.95" }
    });
    expect(screen.queryByText("Foreign key")).not.toBeInTheDocument();
    expect(screen.getByText("Contains field")).toBeInTheDocument();
  });

  it("notifies when a node or edge is selected", () => {
    const onSelectionChange = vi.fn();
    render(<GraphCanvas graph={graph} onSelectionChange={onSelectionChange} />);

    fireEvent.click(screen.getByText("Orders.customer_id"));
    expect(onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "node" })
    );

    fireEvent.click(screen.getByText("Foreign key"));
    expect(onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "edge" })
    );
  });
});
```

- [ ] **Step 2: Run GraphCanvas tests and verify they fail**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- GraphCanvas.test.tsx
```

Expected: FAIL because semantic nodes, filters, and selection callbacks are not implemented.

- [ ] **Step 3: Create the custom semantic node component**

Create `frontend/src/components/graph/SemanticNode.tsx`:

```tsx
import { Handle, Position, type NodeProps } from "reactflow";
import type { GraphNode } from "../../api/types";
import { getNodeKindLabel, nodeSubtitle } from "./graphSemantics";

export type SemanticNodeData = {
  graphNode: GraphNode;
  highlighted: boolean;
};

export default function SemanticNode({ data }: NodeProps<SemanticNodeData>) {
  const { graphNode, highlighted } = data;
  return (
    <div
      className={`semantic-node semantic-node-${graphNode.node_type.replaceAll("_", "-")}${
        highlighted ? " is-highlighted" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="semantic-node-kind">{getNodeKindLabel(graphNode.node_type)}</div>
      <strong title={graphNode.label}>{graphNode.label}</strong>
      <small>{nodeSubtitle(graphNode)}</small>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
```

- [ ] **Step 4: Replace GraphCanvas with semantic controls**

Replace `frontend/src/components/GraphCanvas.tsx` with:

```tsx
import { useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  type Edge,
  type Node,
  type ReactFlowInstance
} from "reactflow";
import "reactflow/dist/style.css";
import type { GraphFilters, GraphResponse, GraphSelection } from "../api/types";
import SemanticNode from "./graph/SemanticNode";
import {
  defaultGraphFilters,
  edgeIsVisibleForMode,
  edgeMatchesFilters,
  formatConfidence,
  getEdgeClassName,
  getRelationshipLabel,
  getSelectionForEdge,
  getSelectionForNode,
  graphNodeIsVisibleForMode
} from "./graph/graphSemantics";

type ViewMode = "table" | "field" | "entity";

type Props = {
  graph: GraphResponse;
  highlightedGraphPath?: number[];
  selectedItem?: GraphSelection | null;
  onSelectionChange?: (selection: GraphSelection | null) => void;
};

const nodeTypes = { semantic: SemanticNode };

const viewModes: { label: string; value: ViewMode }[] = [
  { label: "Table", value: "table" },
  { label: "Field", value: "field" },
  { label: "Entity", value: "entity" }
];

const statusFilters: { label: string; value: keyof GraphFilters["statuses"] }[] = [
  { label: "Auto trusted", value: "auto_trusted" },
  { label: "Suggested", value: "suggested" },
  { label: "Accepted", value: "accepted" },
  { label: "Edited", value: "edited" },
  { label: "Rejected", value: "rejected" }
];

const typeFilters: { label: string; value: keyof GraphFilters["types"] }[] = [
  { label: "Contains", value: "contains_field" },
  { label: "Foreign key", value: "foreign_key" },
  { label: "Dimension", value: "derived_dimension" }
];

export default function GraphCanvas({
  graph,
  highlightedGraphPath = [],
  selectedItem = null,
  onSelectionChange = () => undefined
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("field");
  const [filters, setFilters] = useState<GraphFilters>(defaultGraphFilters);
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);

  const visibleGraph = useMemo(() => {
    const nodes = graph.nodes.filter((node) => graphNodeIsVisibleForMode(node, viewMode));
    const visibleNodeIds = new Set(nodes.map((node) => node.id));
    const edges = graph.edges.filter(
      (edge) =>
        edgeMatchesFilters(edge, filters) &&
        edgeIsVisibleForMode(edge, viewMode) &&
        visibleNodeIds.has(edge.source_node_id) &&
        visibleNodeIds.has(edge.target_node_id)
    );
    return { nodes, edges };
  }, [filters, graph.edges, graph.nodes, viewMode]);

  const nodes: Node[] = useMemo(
    () =>
      visibleGraph.nodes.map((node) => ({
        id: String(node.id),
        position: { x: node.position_x, y: node.position_y },
        data: { graphNode: node, highlighted: highlightedGraphPath.includes(node.id) },
        type: "semantic",
        className: selectedItem?.kind === "node" && selectedItem.node.id === node.id ? "is-selected" : undefined
      })),
    [highlightedGraphPath, selectedItem, visibleGraph.nodes]
  );

  const edges: Edge[] = useMemo(
    () =>
      visibleGraph.edges.map((edge) => ({
        id: String(edge.id),
        source: String(edge.source_node_id),
        target: String(edge.target_node_id),
        label: getRelationshipLabel(edge.edge_type),
        ariaLabel: getRelationshipLabel(edge.edge_type),
        className: getEdgeClassName(edge, highlightedGraphPath),
        markerEnd: { type: MarkerType.ArrowClosed },
        selected: selectedItem?.kind === "edge" && selectedItem.edge.id === edge.id
      })),
    [highlightedGraphPath, selectedItem, visibleGraph.edges]
  );

  function toggleStatus(status: keyof GraphFilters["statuses"]) {
    setFilters((current) => ({
      ...current,
      statuses: { ...current.statuses, [status]: !current.statuses[status] }
    }));
  }

  function toggleType(type: keyof GraphFilters["types"]) {
    setFilters((current) => ({
      ...current,
      types: { ...current.types, [type]: !current.types[type] }
    }));
  }

  function focusSelection() {
    if (!instance || !selectedItem) {
      return;
    }
    if (selectedItem.kind === "node") {
      instance.fitView({ nodes: [{ id: String(selectedItem.node.id) }], padding: 0.35 });
      return;
    }
    instance.fitView({
      nodes: [
        { id: String(selectedItem.edge.source_node_id) },
        { id: String(selectedItem.edge.target_node_id) }
      ],
      padding: 0.35
    });
  }

  return (
    <section className="graph-panel">
      <div className="panel-heading graph-heading">
        <h2>Relationship Graph</h2>
        <div className="segmented" aria-label="Graph view mode">
          {viewModes.map((mode) => (
            <button
              aria-label={`${mode.label} view`}
              className={viewMode === mode.value ? "active" : ""}
              key={mode.value}
              onClick={() => setViewMode(mode.value)}
              type="button"
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="graph-toolbar" aria-label="Graph filters">
        <div className="filter-group">
          {statusFilters.map((status) => (
            <label key={status.value}>
              <input
                checked={filters.statuses[status.value]}
                onChange={() => toggleStatus(status.value)}
                type="checkbox"
              />
              {status.label}
            </label>
          ))}
        </div>
        <div className="filter-group">
          {typeFilters.map((type) => (
            <label key={type.value}>
              <input
                checked={filters.types[type.value]}
                onChange={() => toggleType(type.value)}
                type="checkbox"
              />
              {type.label}
            </label>
          ))}
        </div>
        <label className="confidence-filter">
          Minimum confidence
          <input
            aria-label="Minimum confidence"
            max="1"
            min="0"
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                minConfidence: Number(event.target.value)
              }))
            }
            step="0.05"
            type="range"
            value={filters.minConfidence}
          />
          <span>{formatConfidence(filters.minConfidence)}</span>
        </label>
        <div className="graph-toolbar-actions">
          <button onClick={() => instance?.fitView({ padding: 0.2 })} type="button">
            Fit graph
          </button>
          <button disabled={!selectedItem} onClick={focusSelection} type="button">
            Focus selection
          </button>
        </div>
      </div>

      {graph.nodes.length > 0 ? (
          <div className="edge-summary" aria-label="Visible relationships">
            {visibleGraph.edges.map((edge) => (
              <button
                key={edge.id}
                onClick={() =>
                  onSelectionChange(getSelectionForEdge(String(edge.id), graph.nodes, graph.edges))
                }
                type="button"
              >
                {getRelationshipLabel(edge.edge_type)}
              </button>
            ))}
          </div>
      ) : null}

      <div className="graph-canvas">
        {graph.nodes.length === 0 ? (
          <div className="graph-empty-state">
            <h3>Import a spreadsheet to build the graph.</h3>
            <p>GraphMind will infer fields, relationships, and dimensions from local data.</p>
          </div>
        ) : (
          <ReactFlow
            edges={edges}
            fitView
            nodeTypes={nodeTypes}
            nodes={nodes}
            onEdgeClick={(_, edge) => onSelectionChange(getSelectionForEdge(edge.id, graph.nodes, graph.edges))}
            onInit={setInstance}
            onNodeClick={(_, node) => onSelectionChange(getSelectionForNode(node.id, graph.nodes, graph.edges))}
            onPaneClick={() => onSelectionChange(null)}
          >
            <Background />
            <Controls />
            <div className="graph-legend">
              <span><i className="legend-line contains" />Contains</span>
              <span><i className="legend-line foreign-key" />Foreign key</span>
              <span><i className="legend-line dimension" />Dimension</span>
              <span><i className="legend-line suggested" />Suggested</span>
            </div>
          </ReactFlow>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run GraphCanvas tests**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- GraphCanvas.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Checkpoint**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind
git rev-parse --is-inside-work-tree
```

If it prints `true`, run:

```bash
git add frontend/src/components/graph/SemanticNode.tsx frontend/src/components/GraphCanvas.tsx frontend/tests/GraphCanvas.test.tsx
git commit -m "feat: add semantic graph canvas"
```

If it fails with `fatal: not a git repository`, skip the commit and continue.

## Task 4: Evidence Inspector and Workspace Selection

**Files:**
- Create: `frontend/src/components/EvidenceInspector.tsx`
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/tests/EvidenceInspector.test.tsx`
- Modify: `frontend/tests/Workspace.test.tsx`
- Modify: `frontend/tests/RelationshipReview.test.tsx`

- [ ] **Step 1: Write failing EvidenceInspector tests**

Create `frontend/tests/EvidenceInspector.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraphEdge, GraphNode, GraphSelection, RelationshipSuggestion } from "../src/api/types";
import EvidenceInspector from "../src/components/EvidenceInspector";

const sourceNode: GraphNode = {
  id: 2,
  node_type: "field",
  label: "Orders.customer_id",
  source_ref: "orders.customer_id",
  metadata: { inferred_type: "string", key_candidate_score: 0.91 },
  position_x: 80,
  position_y: 180
};

const targetNode: GraphNode = {
  id: 3,
  node_type: "field",
  label: "Customers.customer_id",
  source_ref: "customers.customer_id",
  metadata: { inferred_type: "string", key_candidate_score: 0.99 },
  position_x: 360,
  position_y: 180
};

const evidenceEdge: GraphEdge = {
  id: 11,
  source_node_id: 2,
  target_node_id: 3,
  edge_type: "foreign_key",
  confidence: 0.94,
  status: "suggested",
  evidence_ref: "suggestion:0",
  created_from_suggestion_id: 7,
  metadata: {},
  evidence_summary: "2 of 2 distinct source values overlap.",
  evidence_payload: { overlap_count: 2, source_match_ratio: 1 }
};

const suggestions: RelationshipSuggestion[] = [
  {
    id: 7,
    source_field_id: 21,
    target_field_id: 31,
    source_label: "Orders.customer_id",
    target_label: "Customers.customer_id",
    relationship_type: "foreign_key",
    confidence: 0.94,
    evidence_summary: "Fallback summary.",
    evidence_payload: { overlap_count: 2 },
    decision_status: "pending"
  }
];

describe("EvidenceInspector", () => {
  it("renders selected edge evidence and review actions", () => {
    const onReview = vi.fn();
    const selection: GraphSelection = {
      kind: "edge",
      edge: evidenceEdge,
      sourceNode,
      targetNode
    };

    render(
      <EvidenceInspector
        highlightedGraphPath={[11]}
        onReview={onReview}
        selection={selection}
        suggestions={suggestions}
      />
    );

    expect(screen.getByRole("heading", { name: "Relationship Evidence" })).toBeInTheDocument();
    expect(screen.getByText("Foreign key")).toBeInTheDocument();
    expect(screen.getByText("94%")).toBeInTheDocument();
    expect(screen.getByText("Orders.customer_id")).toBeInTheDocument();
    expect(screen.getByText("Customers.customer_id")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 distinct source values overlap.")).toBeInTheDocument();
    expect(screen.getByText("Overlap count")).toBeInTheDocument();
    expect(screen.getByText("Source match ratio")).toBeInTheDocument();
    expect(screen.getByText("AI answer path: 1 graph item")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Accept selected relationship" }));
    expect(onReview).toHaveBeenCalledWith(7, "accepted");
  });

  it("renders read-only structural edges", () => {
    const structuralEdge: GraphEdge = {
      ...evidenceEdge,
      id: 12,
      edge_type: "contains_field",
      status: "auto_trusted",
      created_from_suggestion_id: null,
      evidence_summary: null,
      evidence_payload: null
    };
    render(
      <EvidenceInspector
        onReview={vi.fn()}
        selection={{ kind: "edge", edge: structuralEdge, sourceNode, targetNode }}
        suggestions={[]}
      />
    );

    expect(screen.getByText("Contains field")).toBeInTheDocument();
    expect(screen.getByText("Structural relationship from the imported table profile.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept selected relationship" })).not.toBeInTheDocument();
  });

  it("renders node details when a node is selected", () => {
    render(
      <EvidenceInspector
        onReview={vi.fn()}
        selection={{ kind: "node", node: sourceNode, adjacentEdges: [evidenceEdge] }}
        suggestions={suggestions}
      />
    );

    expect(screen.getByRole("heading", { name: "Node Details" })).toBeInTheDocument();
    expect(screen.getByText("Field")).toBeInTheDocument();
    expect(screen.getByText("orders.customer_id")).toBeInTheDocument();
    expect(screen.getByText("Adjacent relationships: 1")).toBeInTheDocument();
  });

  it("renders empty state without selection", () => {
    render(<EvidenceInspector onReview={vi.fn()} selection={null} suggestions={[]} />);

    expect(screen.getByText("Select a node or relationship to inspect its evidence.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run EvidenceInspector tests and verify they fail**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- EvidenceInspector.test.tsx
```

Expected: FAIL because `EvidenceInspector.tsx` does not exist.

- [ ] **Step 3: Create EvidenceInspector component**

Create `frontend/src/components/EvidenceInspector.tsx`:

```tsx
import type {
  GraphSelection,
  RelationshipDecisionStatus,
  RelationshipSuggestion
} from "../api/types";
import {
  evidenceRowsFromPayload,
  formatConfidence,
  getNodeKindLabel,
  getRelationshipLabel
} from "./graph/graphSemantics";

type ReviewStatus = Exclude<RelationshipDecisionStatus, "pending">;

type Props = {
  selection: GraphSelection | null;
  suggestions: RelationshipSuggestion[];
  highlightedGraphPath?: number[];
  onReview: (suggestionId: number, decisionStatus: ReviewStatus) => void;
};

const reviewActions: { label: string; ariaLabel: string; status: ReviewStatus }[] = [
  { label: "Accept", ariaLabel: "Accept selected relationship", status: "accepted" },
  { label: "Edit", ariaLabel: "Edit selected relationship", status: "edited" },
  { label: "Reject", ariaLabel: "Reject selected relationship", status: "rejected" }
];

export default function EvidenceInspector({
  selection,
  suggestions,
  highlightedGraphPath = [],
  onReview
}: Props) {
  if (!selection) {
    return (
      <section className="evidence-inspector">
        <h2>Evidence Inspector</h2>
        <p>Select a node or relationship to inspect its evidence.</p>
        {highlightedGraphPath.length > 0 ? (
          <small>{formatPathSummary(highlightedGraphPath.length)}</small>
        ) : null}
      </section>
    );
  }

  if (selection.kind === "node") {
    return (
      <section className="evidence-inspector">
        <h2>Node Details</h2>
        <div className="inspector-kv">
          <span>Type</span>
          <strong>{getNodeKindLabel(selection.node.node_type)}</strong>
          <span>Label</span>
          <strong>{selection.node.label}</strong>
          <span>Source</span>
          <strong>{selection.node.source_ref}</strong>
        </div>
        <div className="metadata-table">
          {Object.entries(selection.node.metadata).map(([key, value]) => (
            <div key={key}>
              <span>{key.replaceAll("_", " ")}</span>
              <strong>{String(value)}</strong>
            </div>
          ))}
        </div>
        <p>Adjacent relationships: {selection.adjacentEdges.length}</p>
        {highlightedGraphPath.length > 0 ? (
          <small>{formatPathSummary(highlightedGraphPath.length)}</small>
        ) : null}
      </section>
    );
  }

  const suggestion = suggestions.find(
    (candidate) => candidate.id === selection.edge.created_from_suggestion_id
  );
  const payload = selection.edge.evidence_payload ?? suggestion?.evidence_payload ?? null;
  const evidenceRows = evidenceRowsFromPayload(payload);
  const evidenceSummary =
    selection.edge.evidence_summary ??
    suggestion?.evidence_summary ??
    "Structural relationship from the imported table profile.";
  const canReview =
    selection.edge.created_from_suggestion_id !== null && selection.edge.status !== "auto_trusted";

  return (
    <section className="evidence-inspector">
      <div className="inspector-heading-row">
        <h2>Relationship Evidence</h2>
        <span className={`status-pill status-${String(selection.edge.status).replaceAll("_", "-")}`}>
          {selection.edge.status}
        </span>
      </div>
      <div className="inspector-kv">
        <span>Type</span>
        <strong>{getRelationshipLabel(selection.edge.edge_type)}</strong>
        <span>Confidence</span>
        <strong>{formatConfidence(selection.edge.confidence)}</strong>
        <span>Source</span>
        <strong>{selection.sourceNode?.label ?? selection.edge.source_node_id}</strong>
        <span>Target</span>
        <strong>{selection.targetNode?.label ?? selection.edge.target_node_id}</strong>
        <span>Evidence ref</span>
        <strong>{selection.edge.evidence_ref}</strong>
        <span>Suggestion</span>
        <strong>{selection.edge.created_from_suggestion_id ?? "not linked"}</strong>
      </div>
      <p>{evidenceSummary}</p>
      {evidenceRows.length > 0 ? (
        <div className="metadata-table">
          {evidenceRows.map((row) => (
            <div key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {highlightedGraphPath.length > 0 ? (
        <small>{formatPathSummary(highlightedGraphPath.length)}</small>
      ) : null}
      {canReview ? (
        <div className="review-actions inspector-actions">
          {reviewActions.map((action) => (
            <button
              aria-label={action.ariaLabel}
              key={action.status}
              onClick={() => onReview(selection.edge.created_from_suggestion_id as number, action.status)}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatPathSummary(count: number): string {
  return `AI answer path: ${count} graph ${count === 1 ? "item" : "items"}`;
}
```

- [ ] **Step 4: Integrate inspector into Workspace**

Replace `frontend/src/components/Workspace.tsx` with:

```tsx
import { useEffect, useState } from "react";
import type {
  ChatMessage,
  GraphResponse,
  GraphSelection,
  RelationshipDecisionStatus,
  RelationshipSuggestion
} from "../api/types";
import ChatPanel from "./ChatPanel";
import EvidenceInspector from "./EvidenceInspector";
import GraphCanvas from "./GraphCanvas";
import ImportPanel from "./ImportPanel";
import RelationshipReview from "./RelationshipReview";

type Props = {
  graph: GraphResponse;
  suggestions?: RelationshipSuggestion[];
  highlightedGraphPath?: number[];
  onReview?: (
    suggestionId: number,
    decisionStatus: Exclude<RelationshipDecisionStatus, "pending">
  ) => void;
  messages?: ChatMessage[];
  onAsk?: (question: string) => void;
  importStatus?: string | null;
  onImport?: (file: File) => void;
};

export default function Workspace({
  graph,
  suggestions = [],
  highlightedGraphPath = [],
  onReview = () => undefined,
  messages = [],
  onAsk = () => undefined,
  importStatus = null,
  onImport = () => undefined
}: Props) {
  const [selection, setSelection] = useState<GraphSelection | null>(null);

  useEffect(() => {
    if (!selection) {
      return;
    }
    const selectionStillExists =
      selection.kind === "node"
        ? graph.nodes.some((node) => node.id === selection.node.id)
        : graph.edges.some((edge) => edge.id === selection.edge.id);
    if (!selectionStillExists) {
      setSelection(null);
    }
  }, [graph.edges, graph.nodes, selection]);

  return (
    <div className="workspace-grid">
      <ImportPanel importStatus={importStatus} onImport={onImport} />
      <GraphCanvas
        graph={graph}
        highlightedGraphPath={highlightedGraphPath}
        onSelectionChange={setSelection}
        selectedItem={selection}
      />
      <aside className="panel review-panel">
        <EvidenceInspector
          highlightedGraphPath={highlightedGraphPath}
          onReview={onReview}
          selection={selection}
          suggestions={suggestions}
        />
        <RelationshipReview suggestions={suggestions} onReview={onReview} />
        <ChatPanel messages={messages} onAsk={onAsk} />
      </aside>
    </div>
  );
}
```

- [ ] **Step 5: Update fixtures in existing frontend tests**

In `frontend/tests/RelationshipReview.test.tsx`, update each suggestion fixture to include:

```ts
source_field_id: 21,
target_field_id: 31,
evidence_payload: { overlap_count: 2 },
```

In `frontend/tests/Workspace.test.tsx`, update the graph edge fixtures to include new `GraphEdge` fields when edges are present. Add this assertion to the existing workspace render test:

```ts
expect(screen.getByRole("heading", { name: "Evidence Inspector" })).toBeInTheDocument();
```

- [ ] **Step 6: Run inspector and workspace tests**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- EvidenceInspector.test.tsx RelationshipReview.test.tsx Workspace.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Checkpoint**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind
git rev-parse --is-inside-work-tree
```

If it prints `true`, run:

```bash
git add frontend/src/components/EvidenceInspector.tsx frontend/src/components/Workspace.tsx frontend/tests/EvidenceInspector.test.tsx frontend/tests/Workspace.test.tsx frontend/tests/RelationshipReview.test.tsx
git commit -m "feat: add relationship evidence inspector"
```

If it fails with `fatal: not a git repository`, skip the commit and continue.

## Task 5: Review Refresh and AI Path Linkage

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/state/workspaceStore.ts`
- Modify: `frontend/tests/App.test.tsx`

- [ ] **Step 1: Write failing App integration expectations**

In `frontend/tests/App.test.tsx`, add these helpers below `jsonResponse`:

```ts
function emptyGraphResponse() {
  return { nodes: [], edges: [] };
}

function pendingSuggestionResponse(decisionStatus: "pending" | "accepted" = "pending") {
  return [
    {
      id: 7,
      source_field_id: 21,
      target_field_id: 31,
      source_label: "Orders.customer_id",
      target_label: "Customers.customer_id",
      relationship_type: "foreign_key",
      confidence: 0.94,
      evidence_summary: "3 of 3 rows match.",
      evidence_payload: { overlap_count: 3 },
      decision_status: decisionStatus
    }
  ];
}

function importSuggestionResponse() {
  return [
    {
      id: 7,
      source_field_id: 21,
      target_field_id: null,
      source_label: "Orders.customer_id",
      target_label: null,
      relationship_type: "derived_dimension",
      confidence: 0.82,
      evidence_summary: "Repeated values.",
      evidence_payload: { unique_count: 2 },
      decision_status: "pending"
    }
  ];
}
```

Then replace mock returns for empty graphs with:

```ts
return jsonResponse(emptyGraphResponse());
```

Replace mock returns for the relationship suggestions list in the review test with:

```ts
return jsonResponse(pendingSuggestionResponse(graphRequestCount > 1 ? "accepted" : "pending"));
```

Replace import result suggestions with:

```ts
suggestions: importSuggestionResponse()
```

In the first test, change the graph mock so the review refresh can be observed:

```ts
let graphRequestCount = 0;
```

Inside the fetch mock branch for `/api/projects/42/graph`, return a suggested edge before review and an accepted edge after review:

```ts
if (url === "/api/projects/42/graph") {
  graphRequestCount += 1;
  return jsonResponse({
    nodes: [
      {
        id: 1,
        node_type: "field",
        label: "Orders.customer_id",
        source_ref: "orders.customer_id",
        metadata: { inferred_type: "string" },
        position_x: 80,
        position_y: 180
      },
      {
        id: 2,
        node_type: "field",
        label: "Customers.customer_id",
        source_ref: "customers.customer_id",
        metadata: { inferred_type: "string" },
        position_x: 360,
        position_y: 180
      }
    ],
    edges: [
      {
        id: 100,
        source_node_id: 1,
        target_node_id: 2,
        edge_type: "foreign_key",
        confidence: 0.94,
        status: graphRequestCount > 1 ? "accepted" : "suggested",
        evidence_ref: "suggestion:0",
        created_from_suggestion_id: 7,
        metadata: {},
        evidence_summary: "3 of 3 rows match.",
        evidence_payload: { overlap_count: 3 }
      }
    ]
  });
}
```

After clicking accept, add:

```ts
await waitFor(() => {
  expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/graph");
});
expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/relationship-suggestions");
```

In the chat test, change the chat response to include a non-empty path:

```ts
highlighted_graph_path: [100]
```

Add this assertion after the answer renders:

```ts
expect(screen.getByText("AI answer path: 1 graph item")).toBeInTheDocument();
```

- [ ] **Step 2: Run App tests and verify they fail**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- App.test.tsx
```

Expected: FAIL because review does not refresh graph state and chat path is not stored.

- [ ] **Step 3: Extend workspace state**

In `frontend/src/state/workspaceStore.ts`, add `highlightedGraphPath` to `WorkspaceState`:

```ts
  highlightedGraphPath: number[];
```

No change is required in `emptyGraph`.

- [ ] **Step 4: Refresh graph and suggestions after review**

In `frontend/src/App.tsx`, update imports:

```ts
import {
  askQuestion,
  getGraph,
  getRelationshipSuggestions,
  importFile,
  reviewRelationshipSuggestion
} from "./api/client";
```

Add `highlightedGraphPath: []` to every `setState` object that initializes or resets the workspace.

Replace `handleReview` with:

```tsx
  async function handleReview(
    suggestionId: number,
    decisionStatus: Exclude<RelationshipDecisionStatus, "pending">
  ) {
    if (state.projectId === null) {
      return;
    }

    try {
      await reviewRelationshipSuggestion(suggestionId, decisionStatus);
      const [graph, suggestions] = await Promise.all([
        getGraph(state.projectId),
        getRelationshipSuggestions(state.projectId)
      ]);
      setState((current) => ({
        ...current,
        graph,
        suggestions,
        error: null
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Review relationship failed";
      setState((current) => ({ ...current, error: message }));
    }
  }
```

- [ ] **Step 5: Store AI highlighted graph paths**

In `handleAsk`, update the assistant message:

```tsx
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: answer.content,
        citations: answer.citations,
        answer_confidence: answer.answer_confidence,
        highlighted_graph_path: answer.highlighted_graph_path
      };
```

Then update the success `setState` call:

```tsx
      setState((current) => ({
        ...current,
        messages: [...current.messages, assistantMessage],
        highlightedGraphPath: answer.highlighted_graph_path,
        error: null
      }));
```

When an import completes, reset the highlighted path:

```tsx
        highlightedGraphPath: [],
```

Pass the path into `Workspace`:

```tsx
          highlightedGraphPath={state.highlightedGraphPath}
```

- [ ] **Step 6: Run App tests**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- App.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Checkpoint**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind
git rev-parse --is-inside-work-tree
```

If it prints `true`, run:

```bash
git add frontend/src/App.tsx frontend/src/state/workspaceStore.ts frontend/tests/App.test.tsx
git commit -m "feat: refresh graph review state"
```

If it fails with `fatal: not a git repository`, skip the commit and continue.

## Task 6: Professional Styling and Responsive QA

**Files:**
- Modify: `frontend/src/styles/app.css`
- Modify: `frontend/tests/GraphCanvas.test.tsx`
- Modify: `frontend/tests/EvidenceInspector.test.tsx`

- [ ] **Step 1: Add style assertions for stable classes**

In `frontend/tests/GraphCanvas.test.tsx`, add these assertions to the first test:

```tsx
expect(screen.getByText("Orders").closest(".semantic-node")).toHaveClass("semantic-node-table");
expect(screen.getByText("Orders.customer_id").closest(".semantic-node")).toHaveClass("semantic-node-field");
```

In `frontend/tests/EvidenceInspector.test.tsx`, add this assertion to the edge evidence test:

```tsx
expect(screen.getByText("suggested")).toHaveClass("status-pill");
```

- [ ] **Step 2: Run focused frontend tests and verify current styling gaps**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- GraphCanvas.test.tsx EvidenceInspector.test.tsx
```

Expected: tests can pass before CSS because class names exist, but the browser QA still needs the visual styling in the next step.

- [ ] **Step 3: Append professional graph and inspector CSS**

Append this CSS to `frontend/src/styles/app.css`:

```css
.graph-heading {
  gap: 12px;
}

.graph-toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(180px, 0.8fr) minmax(180px, 0.6fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.92);
  border-bottom: 1px solid #d7dde7;
}

.filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-group label,
.confidence-filter {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #536278;
  font-size: 12px;
  white-space: nowrap;
}

.confidence-filter input {
  width: 100px;
}

.graph-toolbar-actions {
  display: flex;
  gap: 7px;
  justify-content: flex-end;
}

.graph-toolbar-actions button {
  border: 1px solid #cbd4e1;
  border-radius: 7px;
  background: #ffffff;
  color: #172033;
  padding: 6px 8px;
  font-size: 12px;
  cursor: pointer;
}

.graph-toolbar-actions button:disabled {
  color: #98a7bd;
  cursor: not-allowed;
}

.edge-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 14px 10px;
  background: rgba(255, 255, 255, 0.92);
  border-bottom: 1px solid #d7dde7;
}

.edge-summary button {
  border: 1px solid #d7dde7;
  border-radius: 999px;
  background: #ffffff;
  color: #536278;
  padding: 4px 8px;
  font-size: 11px;
}

.graph-empty-state {
  display: grid;
  place-content: center;
  height: 100%;
  padding: 24px;
  text-align: center;
}

.graph-empty-state h3 {
  margin: 0 0 6px;
  font-size: 16px;
}

.graph-empty-state p {
  margin: 0;
  color: #607088;
}

.semantic-node {
  position: relative;
  display: grid;
  gap: 4px;
  width: 178px;
  min-height: 72px;
  padding: 10px 12px;
  border: 1px solid #cbd4e1;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 8px 22px rgba(36, 48, 71, 0.08);
}

.semantic-node strong {
  overflow: hidden;
  color: #172033;
  font-size: 13px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.semantic-node small {
  overflow: hidden;
  color: #607088;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.semantic-node-kind {
  color: #536278;
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0;
  text-transform: uppercase;
}

.semantic-node-table {
  border-color: #7e9bc7;
  border-left: 4px solid #3157a3;
}

.semantic-node-field {
  border-color: #91b7b2;
  border-left: 4px solid #1d7a6f;
}

.semantic-node-derived-entity {
  border-color: #c8aa68;
  border-left: 4px solid #a46f1b;
}

.semantic-node.is-highlighted,
.react-flow__node.is-selected .semantic-node {
  box-shadow: 0 0 0 3px rgba(49, 87, 163, 0.18), 0 10px 24px rgba(36, 48, 71, 0.12);
}

.semantic-edge .react-flow__edge-path {
  stroke-width: 2;
}

.semantic-edge-contains-field .react-flow__edge-path {
  stroke: #98a7bd;
  stroke-width: 1.4;
}

.semantic-edge-foreign-key .react-flow__edge-path {
  stroke: #3157a3;
}

.semantic-edge-derived-dimension .react-flow__edge-path {
  stroke: #a46f1b;
}

.edge-status-suggested .react-flow__edge-path {
  stroke-dasharray: 6 5;
}

.edge-status-rejected .react-flow__edge-path {
  opacity: 0.32;
}

.semantic-edge.is-highlighted .react-flow__edge-path {
  stroke-width: 3;
  filter: drop-shadow(0 0 3px rgba(49, 87, 163, 0.35));
}

.graph-legend {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: min(520px, calc(100% - 28px));
  padding: 8px 10px;
  border: 1px solid #d7dde7;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  color: #536278;
  font-size: 11px;
}

.graph-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.legend-line {
  display: inline-block;
  width: 18px;
  height: 2px;
  background: #98a7bd;
}

.legend-line.foreign-key {
  background: #3157a3;
}

.legend-line.dimension {
  background: #a46f1b;
}

.legend-line.suggested {
  border-top: 2px dashed #3157a3;
  background: transparent;
}

.evidence-inspector {
  display: grid;
  gap: 10px;
  padding-bottom: 16px;
  border-bottom: 1px solid #d7dde7;
}

.evidence-inspector h2 {
  margin: 0;
  font-size: 15px;
}

.evidence-inspector p {
  margin: 0;
  color: #536278;
  font-size: 13px;
  line-height: 1.45;
}

.evidence-inspector small {
  color: #607088;
}

.inspector-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.status-pill {
  border-radius: 999px;
  background: #eef3ff;
  color: #3157a3;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 760;
}

.status-accepted,
.status-edited {
  background: #eaf7f4;
  color: #1d7a6f;
}

.status-rejected {
  background: #f4edf0;
  color: #9b3451;
}

.inspector-kv,
.metadata-table {
  display: grid;
  grid-template-columns: minmax(88px, 0.8fr) minmax(0, 1.4fr);
  gap: 6px 10px;
  font-size: 12px;
}

.inspector-kv span,
.metadata-table span {
  color: #607088;
}

.inspector-kv strong,
.metadata-table strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: #172033;
}

.metadata-table {
  padding: 10px;
  border: 1px solid #d7dde7;
  border-radius: 8px;
  background: #fbfcfe;
}

.metadata-table div {
  display: contents;
}

.inspector-actions {
  padding-top: 2px;
}

@media (max-width: 1100px) {
  .workspace-grid {
    grid-template-columns: 240px minmax(360px, 1fr);
  }

  .review-panel {
    grid-column: 1 / -1;
    border-left: 0;
    border-top: 1px solid #d7dde7;
  }

  .graph-toolbar {
    grid-template-columns: 1fr;
  }

  .graph-toolbar-actions {
    justify-content: flex-start;
  }
}
```

- [ ] **Step 4: Run focused frontend tests**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- GraphCanvas.test.tsx EvidenceInspector.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run full frontend verification**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test
npm run lint
npm run build
```

Expected: all tests pass, TypeScript emits no errors, and Vite builds successfully.

- [ ] **Step 6: Checkpoint**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind
git rev-parse --is-inside-work-tree
```

If it prints `true`, run:

```bash
git add frontend/src/styles/app.css frontend/tests/GraphCanvas.test.tsx frontend/tests/EvidenceInspector.test.tsx
git commit -m "style: polish semantic graph workspace"
```

If it fails with `fatal: not a git repository`, skip the commit and continue.

## Task 7: End-to-End Verification and Browser Smoke

**Files:**
- No planned code changes.

- [ ] **Step 1: Run full backend verification**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/backend
pytest -q
ruff check graphmind tests
```

Expected: all backend tests pass and ruff reports no issues.

- [ ] **Step 2: Run full frontend verification**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test
npm run lint
npm run build
```

Expected: all frontend tests pass, TypeScript emits no errors, and Vite builds successfully.

- [ ] **Step 3: Start or reuse local services**

If backend is not already running on `127.0.0.1:8000`, run:

```bash
cd /Volumes/outside-ssd/project/graphmind/backend
uvicorn graphmind.api.app:create_app --factory --host 127.0.0.1 --port 8000
```

If frontend is not already running on `127.0.0.1:5173`, run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm run dev -- --port 5173
```

Expected: backend serves `/api/health` and frontend serves `http://127.0.0.1:5173/`.

- [ ] **Step 4: Browser smoke test**

Use the Browser plugin to open:

```text
http://127.0.0.1:5173/
```

Verify:

- `GraphMind` header is visible.
- `Relationship Graph` panel is visible.
- `Evidence Inspector` is visible.
- No `Backend unavailable` message appears.
- The browser console has no React errors or failed API calls.

- [ ] **Step 5: Import smoke data**

Use a small CSV with at least two identifier-like columns. If no fixture file is convenient, create one through the UI upload dialog from this content saved outside the repo or from an existing test fixture:

```csv
order_id,customer_id,region
o1,c1,East
o2,c1,East
o3,c2,West
```

Verify:

- Graph nodes render with custom table/field styling.
- Relationship labels render.
- Status/type filters hide and show edges.
- Clicking an edge opens `Relationship Evidence`.
- Evidence metrics appear when the edge has payload.
- Accepting or rejecting a relationship updates the edge status after refresh.
- Asking a schema question still returns a cited answer.

- [ ] **Step 6: Final checkpoint**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind
git rev-parse --is-inside-work-tree
```

If it prints `true`, run:

```bash
git status --short
```

Expected: only intentional changes are present.

If it fails with `fatal: not a git repository`, record that final verification completed without a git commit.

## Self-Review Checklist

- Spec coverage:
  - Backend graph response evidence fields are implemented in Task 1.
  - Suggestion evidence payload and field ids are implemented in Task 1.
  - Professional graph semantics and filters are implemented in Tasks 2 and 3.
  - Edge evidence inspector and review linkage are implemented in Task 4.
  - Review refresh and AI path highlighting are implemented in Task 5.
  - Styling, responsive behavior, and browser smoke are covered in Tasks 6 and 7.
- Scope remains one implementation plan: all tasks upgrade the existing workspace graph experience without adding a graph database, full ontology editor, new routes, or cloud features.
- Type consistency:
  - `created_from_suggestion_id`, `evidence_summary`, and `evidence_payload` use the same snake_case names in backend responses and TypeScript types.
  - `GraphSelection` is defined once in `frontend/src/api/types.ts` and reused by `GraphCanvas`, `EvidenceInspector`, and `Workspace`.
  - `highlighted_graph_path` stays in chat answer/message data, while app state uses `highlightedGraphPath` for React props.
