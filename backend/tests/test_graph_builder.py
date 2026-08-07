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


def test_build_graph_skips_suggestions_with_missing_nodes():
    orders = profile_dataframe(
        "Orders",
        "orders",
        pd.DataFrame({"order_id": ["o1"], "customer_id": ["c1"]}),
    )
    stale_suggestion = RelationshipSuggestionData(
        source_sheet="Orders",
        source_field="missing_customer_id",
        target_sheet="Customers",
        target_field="customer_id",
        relationship_type="foreign_key",
        confidence=0.95,
        evidence_summary="stale suggestion",
        evidence_payload={},
    )

    graph = build_graph(project_id=1, profiles=[orders], suggestions=[stale_suggestion])

    assert [edge for edge in graph.edges if edge.edge_type == "foreign_key"] == []


def test_build_graph_makes_duplicate_normalized_field_node_ids_unique():
    contacts = profile_dataframe(
        "Contacts",
        "contacts",
        pd.DataFrame(
            {
                "Customer ID": ["c1"],
                "customer_id": ["c1"],
            }
        ),
    )

    graph = build_graph(project_id=1, profiles=[contacts], suggestions=[])

    node_ids = [node.id for node in graph.nodes]
    assert len(node_ids) == len(set(node_ids))
    assert "field:Contacts.customer_id" in node_ids
    assert "field:Contacts.customer_id#2" in node_ids
