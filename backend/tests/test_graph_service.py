import pytest

from graphmind.services.graph_service import GraphService
from graphmind.services.relationship_governance import RelationshipGovernanceService
from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.models import (
    Dataset,
    FieldProfile,
    GraphEdge,
    GraphNode,
    Project,
    RelationshipSuggestion,
    Sheet,
)
from graphmind.storage.workspace import WorkspacePaths


def _create_suggestion(session):
    project = Project(name="Demo", settings={})
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
        name="orders",
        normalized_name="orders",
        row_count=2,
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
        key_candidate_score=0.9,
    )
    target = FieldProfile(
        sheet_id=sheet.id,
        original_name="Customers ID",
        normalized_name="customers_id",
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
        relationship_type="same_entity",
        confidence=0.92,
        evidence_summary="Values overlap strongly.",
        evidence_payload={"overlap": 1.0},
        ai_explanation="Likely the same customer identifier.",
        decision_status="pending",
    )
    session.add(suggestion)
    session.flush()
    return suggestion


def _attach_suggested_edge(session, suggestion):
    source_node = GraphNode(
        project_id=suggestion.project_id,
        node_type="field",
        label="orders.customer_id",
        source_ref="orders.customer_id",
        node_metadata={},
        position_x=0,
        position_y=0,
    )
    target_node = GraphNode(
        project_id=suggestion.project_id,
        node_type="field",
        label="orders.customers_id",
        source_ref="orders.customers_id",
        node_metadata={},
        position_x=100,
        position_y=0,
    )
    session.add_all([source_node, target_node])
    session.flush()
    edge = GraphEdge(
        project_id=suggestion.project_id,
        source_node_id=source_node.id,
        target_node_id=target_node.id,
        edge_type=suggestion.relationship_type,
        confidence=suggestion.confidence,
        status="suggested",
        evidence_ref="suggestion:0",
        created_from_suggestion_id=suggestion.id,
    )
    session.add(edge)
    session.flush()
    return edge


def _create_duplicate_suggestions(session):
    first = _create_suggestion(session)
    duplicate = RelationshipSuggestion(
        project_id=first.project_id,
        source_field_id=first.source_field_id,
        target_field_id=first.target_field_id,
        relationship_type=first.relationship_type,
        confidence=0.88,
        evidence_summary=first.evidence_summary,
        evidence_payload={"overlap": 0.88},
        decision_status="pending",
    )
    session.add(duplicate)
    session.flush()
    duplicate_edge = _attach_suggested_edge(session, duplicate)
    return first, duplicate, duplicate_edge


def test_review_suggestion_updates_decision_status_and_note(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        suggestion = _create_suggestion(session)
        suggestion_id = suggestion.id
        session.commit()

    result = GraphService(session_factory).review_suggestion(
        suggestion_id=suggestion_id,
        decision_status="accepted",
        decision_note="Looks right.",
    )

    assert result is None

    with session_factory() as session:
        saved = session.get(RelationshipSuggestion, suggestion_id)
        assert saved is not None
        assert saved.decision_status == "accepted"
        assert saved.decision_note == "Looks right."


def test_review_suggestion_records_reviewer_attribution(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        suggestion = _create_suggestion(session)
        suggestion_id = suggestion.id
        session.commit()

    GraphService(session_factory).review_suggestion(
        suggestion_id=suggestion_id,
        decision_status="rejected",
        decision_note="Not enough evidence.",
        reviewed_by="ops-reviewer",
    )

    with session_factory() as session:
        saved = session.get(RelationshipSuggestion, suggestion_id)
        assert saved is not None
        assert saved.reviewed_by == "ops-reviewer"


def test_relationship_governance_summary_reports_duplicate_suggestions(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        first, duplicate, _edge = _create_duplicate_suggestions(session)
        project_id = first.project_id
        first_id = first.id
        duplicate_id = duplicate.id
        session.commit()

    summary = RelationshipGovernanceService(session_factory).get_summary(project_id)

    assert summary.total_suggestion_count == 2
    assert summary.visible_suggestion_count == 1
    assert summary.duplicate_suggestion_count == 1
    assert summary.duplicate_groups[0].canonical_suggestion_id == first_id
    assert summary.duplicate_groups[0].duplicate_suggestion_ids == [duplicate_id]
    assert summary.duplicate_groups[0].source_label == "orders.customer_id"
    assert summary.duplicate_groups[0].target_label == "orders.customers_id"


def test_relationship_governance_cleanup_removes_duplicates_and_relinks_edges(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        first, duplicate, duplicate_edge = _create_duplicate_suggestions(session)
        project_id = first.project_id
        first_id = first.id
        duplicate_id = duplicate.id
        edge_id = duplicate_edge.id
        session.commit()

    result = RelationshipGovernanceService(session_factory).cleanup_duplicates(project_id)

    assert result.removed_duplicate_count == 1
    assert result.relinked_edge_count == 1
    assert result.remaining_duplicate_count == 0
    with session_factory() as session:
        assert session.get(RelationshipSuggestion, first_id) is not None
        assert session.get(RelationshipSuggestion, duplicate_id) is None
        edge = session.get(GraphEdge, edge_id)
        assert edge is not None
        assert edge.created_from_suggestion_id == first_id


def test_review_suggestion_updates_linked_graph_edge_status(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        suggestion = _create_suggestion(session)
        edge = _attach_suggested_edge(session, suggestion)
        suggestion_id = suggestion.id
        edge_id = edge.id
        session.commit()

    GraphService(session_factory).review_suggestion(
        suggestion_id=suggestion_id,
        decision_status="rejected",
        decision_note="Not meaningful.",
    )

    with session_factory() as session:
        saved_edge = session.get(GraphEdge, edge_id)
        assert saved_edge is not None
        assert saved_edge.status == "rejected"


def test_review_suggestion_persists_relationship_type_and_evidence_quality(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        suggestion = _create_suggestion(session)
        edge = _attach_suggested_edge(session, suggestion)
        edge.edge_metadata = {"evidence_summary": "Values overlap strongly."}
        suggestion_id = suggestion.id
        edge_id = edge.id
        session.commit()

    GraphService(session_factory).review_suggestion(
        suggestion_id=suggestion_id,
        decision_status="edited",
        decision_note="Adjusted during import modeling.",
        relationship_type="foreign_key",
        evidence_quality="high",
    )

    with session_factory() as session:
        saved = session.get(RelationshipSuggestion, suggestion_id)
        assert saved is not None
        assert saved.decision_status == "edited"
        assert saved.relationship_type == "foreign_key"
        assert saved.evidence_payload["review_evidence_quality"] == "high"
        saved_edge = session.get(GraphEdge, edge_id)
        assert saved_edge is not None
        assert saved_edge.status == "edited"
        assert saved_edge.edge_type == "foreign_key"
        assert saved_edge.edge_metadata["evidence_summary"] == "Values overlap strongly."
        assert saved_edge.edge_metadata["review_evidence_quality"] == "high"


@pytest.mark.parametrize("decision_status", ["accepted", "edited", "rejected"])
def test_review_suggestion_allows_expected_statuses(tmp_workspace, decision_status):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        suggestion = _create_suggestion(session)
        suggestion_id = suggestion.id
        session.commit()

    GraphService(session_factory).review_suggestion(
        suggestion_id=suggestion_id,
        decision_status=decision_status,
        decision_note=None,
    )

    with session_factory() as session:
        saved = session.get(RelationshipSuggestion, suggestion_id)
        assert saved is not None
        assert saved.decision_status == decision_status


def test_review_suggestion_rejects_invalid_status(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        suggestion = _create_suggestion(session)
        suggestion_id = suggestion.id
        session.commit()

    with pytest.raises(ValueError, match="decision_status"):
        GraphService(session_factory).review_suggestion(
            suggestion_id=suggestion_id,
            decision_status="maybe",
            decision_note=None,
        )


def test_review_suggestion_rejects_missing_suggestion(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with pytest.raises(ValueError, match="Relationship suggestion not found"):
        GraphService(session_factory).review_suggestion(
            suggestion_id=999,
            decision_status="accepted",
            decision_note=None,
        )
