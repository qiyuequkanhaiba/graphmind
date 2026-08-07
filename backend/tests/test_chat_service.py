from graphmind.core.answer_contract import Citation, classify_question
from graphmind.services.ai_provider import AIProviderResult
from graphmind.services.chat_service import ChatService
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
    answer = service.answer_question(
        project_id=project_id,
        question="What fields are in customers_orders?",
    )

    assert "customers_orders" in answer.content
    assert "order_id" in answer.content
    assert answer.answer_confidence == "high"
    assert answer.citations
    assert answer.query_plan["question_type"] == "schema_explanation"


def test_chat_service_uses_configured_provider_to_enhance_rule_answer(tmp_workspace, sample_csv):
    from graphmind.services.import_service import ImportService

    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        project = ProjectRepository(session).create_project("Demo")
        project.settings = {
            "ai": {
                "chat": {
                    "provider": "openai-compatible",
                    "model": "gpt-4.1-mini",
                    "base_url": "https://api.example.com/v1",
                    "api_key": "",
                    "temperature": 0.1,
                }
            }
        }
        session.commit()
        project_id = project.id

    ImportService(paths, session_factory).import_file(project_id, sample_csv)
    calls = []

    class FakeProvider:
        def generate(self, settings, question, rule_answer, citations, retrieved_evidence=None):
            calls.append(
                {
                    "settings": settings,
                    "question": question,
                    "rule_answer": rule_answer,
                    "citations": citations,
                    "retrieved_evidence": retrieved_evidence,
                }
            )
            return AIProviderResult(content="模型增强后的图谱解释", answer_mode="model_enhanced")

    answer = ChatService(
        paths=paths,
        session_factory=session_factory,
        ai_provider=FakeProvider(),
    ).answer_question(
        project_id=project_id,
        question="解释当前图谱的主要结构",
    )

    assert answer.content == "模型增强后的图谱解释"
    assert answer.answer_confidence == "high"
    assert answer.citations
    assert answer.query_plan["answer_mode"] == "model_enhanced"
    assert answer.query_plan["ai_provider"] == "openai-compatible"
    assert calls[0]["settings"]["model"] == "gpt-4.1-mini"
    assert "customers_orders" in calls[0]["rule_answer"]
    assert calls[0]["citations"]


def test_chat_service_passes_retrieved_evidence_to_configured_provider(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        project = Project(
            name="Evidence Chat",
            settings={
                "ai": {
                    "chat": {
                        "provider": "openai-compatible",
                        "model": "gpt-4.1-mini",
                        "base_url": "https://api.example.com/v1",
                        "api_key": "",
                        "temperature": 0.1,
                    }
                }
            },
        )
        session.add(project)
        session.flush()

        source_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        target_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Customers.id",
            source_ref="customers.id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        session.add_all([source_node, target_node])
        session.flush()
        session.add(
            GraphEdge(
                project_id=project.id,
                source_node_id=source_node.id,
                target_node_id=target_node.id,
                edge_type="foreign_key",
                confidence=0.97,
                status="suggested",
                evidence_ref="suggestion:12",
                edge_metadata={"evidence_summary": "Customer IDs overlap."},
            )
        )
        session.commit()
        project_id = project.id

    calls = []

    class FakeProvider:
        def generate(self, settings, question, rule_answer, citations, retrieved_evidence=None):
            calls.append(retrieved_evidence or [])
            return AIProviderResult(content="基于检索证据的回答", answer_mode="model_enhanced")

    answer = ChatService(
        paths=paths,
        session_factory=session_factory,
        ai_provider=FakeProvider(),
    ).answer_question(
        project_id=project_id,
        question="解释 Orders.customer_id 和 Customers.id 的外键关系",
    )

    assert answer.content == "基于检索证据的回答"
    assert calls
    assert any("Customer IDs overlap" in evidence for evidence in calls[0])
    assert answer.query_plan["retrieval_document_count"] >= 1


def test_chat_service_returns_structured_retrieved_evidence(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        project = Project(name="Evidence Disclosure", settings={})
        session.add(project)
        session.flush()

        source_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        target_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Customers.id",
            source_ref="customers.id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        session.add_all([source_node, target_node])
        session.flush()
        session.add(
            GraphEdge(
                project_id=project.id,
                source_node_id=source_node.id,
                target_node_id=target_node.id,
                edge_type="foreign_key",
                confidence=0.97,
                status="suggested",
                evidence_ref="suggestion:12",
                edge_metadata={"evidence_summary": "Customer IDs overlap."},
            )
        )
        session.commit()
        project_id = project.id

    answer = ChatService(paths=paths, session_factory=session_factory).answer_question(
        project_id=project_id,
        question="解释 Orders.customer_id 和 Customers.id 的外键关系",
    )

    assert answer.query_plan["retrieval_document_count"] == len(answer.retrieved_evidence)
    assert answer.retrieved_evidence
    first_evidence = answer.retrieved_evidence[0]
    assert first_evidence.label == "Orders.customer_id -> Customers.id"
    assert first_evidence.kind == "graph_edge"
    assert first_evidence.source_ref == "suggestion:12"
    assert first_evidence.score > 0
    assert "Customer IDs overlap" in first_evidence.excerpt


def test_chat_service_falls_back_to_rule_answer_when_provider_fails(tmp_workspace, sample_csv):
    from graphmind.services.import_service import ImportService

    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        project = ProjectRepository(session).create_project("Demo")
        project.settings = {
            "ai": {
                "chat": {
                    "provider": "openai-compatible",
                    "model": "gpt-4.1-mini",
                    "base_url": "https://api.example.com/v1",
                    "api_key": "",
                    "temperature": 0.1,
                }
            }
        }
        session.commit()
        project_id = project.id

    ImportService(paths, session_factory).import_file(project_id, sample_csv)

    class FailingProvider:
        def generate(self, settings, question, rule_answer, citations, retrieved_evidence=None):
            return AIProviderResult(
                content=None,
                answer_mode="rule_fallback",
                fallback_reason="provider_request_failed",
            )

    answer = ChatService(
        paths=paths,
        session_factory=session_factory,
        ai_provider=FailingProvider(),
    ).answer_question(
        project_id=project_id,
        question="解释当前图谱的主要结构",
    )

    assert "customers_orders" in answer.content
    assert "order_id" in answer.content
    assert answer.answer_confidence == "high"
    assert answer.query_plan["answer_mode"] == "rule_fallback"
    assert answer.query_plan["ai_provider"] == "openai-compatible"
    assert answer.query_plan["ai_fallback_reason"] == "provider_request_failed"


def test_chat_service_returns_chinese_schema_answer_for_chinese_question(
    tmp_workspace, sample_csv
):
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

    answer = ChatService(paths=paths, session_factory=session_factory).answer_question(
        project_id=project_id,
        question="哪些字段可能有关联？",
    )

    assert "customers_orders 包含字段：" in answer.content
    assert "order_id" in answer.content
    assert "contains:" not in answer.content
    assert answer.answer_confidence == "high"
    assert answer.citations
    assert answer.query_plan["question_type"] == "schema_explanation"


def test_chat_service_filters_schema_answer_by_project(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Demo", settings={})
        other_project = Project(name="Other", settings={})
        session.add_all([project, other_project])
        session.flush()

        dataset = Dataset(
            project_id=project.id,
            filename="orders.csv",
            file_type="csv",
            raw_data_ref="imports/orders.csv",
        )
        other_dataset = Dataset(
            project_id=other_project.id,
            filename="secret.csv",
            file_type="csv",
            raw_data_ref="imports/secret.csv",
        )
        session.add_all([dataset, other_dataset])
        session.flush()

        sheet = Sheet(
            dataset_id=dataset.id,
            name="Orders",
            normalized_name="orders",
            row_count=1,
            column_count=1,
            duckdb_table_name="orders",
        )
        other_sheet = Sheet(
            dataset_id=other_dataset.id,
            name="Secrets",
            normalized_name="secrets",
            row_count=1,
            column_count=1,
            duckdb_table_name="secrets",
        )
        session.add_all([sheet, other_sheet])
        session.flush()

        session.add_all(
            [
                FieldProfile(
                    sheet_id=sheet.id,
                    original_name="Order ID",
                    normalized_name="order_id",
                    inferred_type="string",
                    null_count=0,
                    unique_count=1,
                    sample_values=["o1"],
                    key_candidate_score=1.0,
                ),
                FieldProfile(
                    sheet_id=other_sheet.id,
                    original_name="Secret Token",
                    normalized_name="secret_token",
                    inferred_type="string",
                    null_count=0,
                    unique_count=1,
                    sample_values=["s1"],
                    key_candidate_score=0.0,
                ),
            ]
        )
        session.commit()
        project_id = project.id

    answer = ChatService(paths=paths, session_factory=session_factory).answer_question(
        project_id=project_id,
        question="What fields are in Orders?",
    )

    assert "Orders" in answer.content
    assert "order_id" in answer.content
    assert "Secrets" not in answer.content
    assert "secret_token" not in answer.content
    assert [citation.label for citation in answer.citations] == ["Orders.order_id"]


def test_chat_service_returns_pending_relationship_review_answer(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
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
            name="Orders",
            normalized_name="orders",
            row_count=2,
            column_count=2,
            duckdb_table_name="orders",
        )
        session.add(sheet)
        session.flush()

        customer_id = FieldProfile(
            sheet_id=sheet.id,
            original_name="Customer ID",
            normalized_name="customer_id",
            inferred_type="identifier",
            null_count=0,
            unique_count=2,
            sample_values=["c1", "c2"],
            key_candidate_score=0.8,
        )
        region = FieldProfile(
            sheet_id=sheet.id,
            original_name="Region",
            normalized_name="region",
            inferred_type="category",
            null_count=0,
            unique_count=2,
            sample_values=["East", "West"],
            key_candidate_score=0.0,
        )
        session.add_all([customer_id, region])
        session.flush()

        customer_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        region_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.region",
            source_ref="orders.region",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        session.add_all([customer_node, region_node])
        session.flush()

        pending = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=customer_id.id,
            target_field_id=region.id,
            relationship_type="foreign_key",
            confidence=0.82,
            evidence_summary="2 of 2 values overlap.",
            evidence_payload={"overlap_count": 2},
            decision_status="pending",
        )
        accepted = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=region.id,
            target_field_id=None,
            relationship_type="derived_dimension",
            confidence=0.76,
            evidence_summary="Region has 2 distinct values.",
            evidence_payload={"unique_count": 2},
            decision_status="accepted",
        )
        session.add_all([pending, accepted])
        session.commit()
        project_id = project.id
        pending_id = pending.id
        customer_node_id = customer_node.id
        region_node_id = region_node.id

    answer = ChatService(paths=paths, session_factory=session_factory).answer_question(
        project_id=project_id,
        question="哪些关系需要人工确认？",
    )

    assert "有 1 条关系需要人工确认" in answer.content
    assert "Orders.customer_id -> Orders.region" in answer.content
    assert "foreign_key" in answer.content
    assert "82%" in answer.content
    assert "Region has 2 distinct values." not in answer.content
    assert answer.answer_confidence == "high"
    assert answer.query_plan["question_type"] == "relationship_path"
    assert answer.citations == [
        Citation(
            label="Orders.customer_id -> Orders.region",
            source_ref="suggestion:1",
            citation_type="relationship_suggestion",
        )
    ]
    assert answer.highlighted_graph_path == [customer_node_id, region_node_id]
    assert answer.graph_actions[0].type == "filter_pending_reviews"
    assert answer.graph_actions[0].suggestion_ids == [pending_id]
    assert answer.graph_actions[1].type == "highlight_path"
    assert answer.graph_actions[1].node_ids == [customer_node_id, region_node_id]
    assert answer.next_steps == [
        "查看 AI 高亮路径中的字段关系。",
        "打开审核面板确认或拒绝待审核关系。",
    ]


def test_chat_service_deduplicates_repeated_pending_relationship_answers(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Demo", settings={})
        session.add(project)
        session.flush()

        dataset = Dataset(
            project_id=project.id,
            filename="sales.xlsx",
            file_type="xlsx",
            raw_data_ref="imports/sales.xlsx",
        )
        session.add(dataset)
        session.flush()

        orders = Sheet(
            dataset_id=dataset.id,
            name="Orders",
            normalized_name="orders",
            row_count=5,
            column_count=1,
            duckdb_table_name="orders",
        )
        customers = Sheet(
            dataset_id=dataset.id,
            name="Customers",
            normalized_name="customers",
            row_count=4,
            column_count=1,
            duckdb_table_name="customers",
        )
        session.add_all([orders, customers])
        session.flush()

        customer_id = FieldProfile(
            sheet_id=orders.id,
            original_name="Customer ID",
            normalized_name="customer_id",
            inferred_type="identifier",
            null_count=0,
            unique_count=4,
            sample_values=["c1", "c2"],
            key_candidate_score=0.8,
        )
        customer_pk = FieldProfile(
            sheet_id=customers.id,
            original_name="ID",
            normalized_name="id",
            inferred_type="identifier",
            null_count=0,
            unique_count=4,
            sample_values=["c1", "c2"],
            key_candidate_score=1.0,
        )
        session.add_all([customer_id, customer_pk])
        session.flush()

        source_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        target_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Customers.id",
            source_ref="customers.id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        session.add_all([source_node, target_node])
        session.flush()

        evidence_summary = "4 个源字段不同取值中有 4 个与目标字段重合。"
        first_duplicate = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=customer_id.id,
            target_field_id=customer_pk.id,
            relationship_type="foreign_key",
            confidence=0.99,
            evidence_summary=evidence_summary,
            evidence_payload={"overlap_count": 4},
            decision_status="pending",
        )
        second_duplicate = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=customer_id.id,
            target_field_id=customer_pk.id,
            relationship_type="foreign_key",
            confidence=0.99,
            evidence_summary=evidence_summary,
            evidence_payload={"overlap_count": 4},
            decision_status="pending",
        )
        session.add_all([first_duplicate, second_duplicate])
        session.commit()
        project_id = project.id
        first_duplicate_id = first_duplicate.id
        source_node_id = source_node.id
        target_node_id = target_node.id

    answer = ChatService(paths=paths, session_factory=session_factory).answer_question(
        project_id=project_id,
        question="哪些关系需要人工确认？",
    )

    assert "有 1 条关系需要人工确认" in answer.content
    assert answer.content.count("Orders.customer_id -> Customers.id") == 1
    assert answer.citations == [
        Citation(
            label="Orders.customer_id -> Customers.id",
            source_ref=f"suggestion:{first_duplicate_id}",
            citation_type="relationship_suggestion",
        )
    ]
    assert answer.highlighted_graph_path == [source_node_id, target_node_id]


def test_chat_service_explains_selected_node_upstream_and_downstream(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Demo", settings={})
        session.add(project)
        session.flush()

        table_node = GraphNode(
            project_id=project.id,
            node_type="table",
            label="Orders",
            source_ref="orders",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        field_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        target_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Customers.customer_id",
            source_ref="customers.customer_id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        session.add_all([table_node, field_node, target_node])
        session.flush()

        contains_edge = GraphEdge(
            project_id=project.id,
            source_node_id=table_node.id,
            target_node_id=field_node.id,
            edge_type="contains_field",
            confidence=1,
            status="auto_trusted",
            evidence_ref="field:orders.customer_id",
        )
        relationship_edge = GraphEdge(
            project_id=project.id,
            source_node_id=field_node.id,
            target_node_id=target_node.id,
            edge_type="foreign_key",
            confidence=0.94,
            status="suggested",
            evidence_ref="suggestion:4",
            edge_metadata={"evidence_summary": "Customer IDs overlap."},
        )
        session.add_all([contains_edge, relationship_edge])
        session.commit()
        project_id = project.id
        contains_edge_id = contains_edge.id
        relationship_edge_id = relationship_edge.id
        table_node_id = table_node.id
        field_node_id = field_node.id
        target_node_id = target_node.id

    answer = ChatService(paths=paths, session_factory=session_factory).answer_question(
        project_id=project_id,
        question="解释当前选中项的上下游关系",
        selection={"kind": "node", "id": field_node_id},
    )

    assert "Orders.customer_id 的上游有 1 个节点：Orders" in answer.content
    assert "下游有 1 个节点：Customers.customer_id" in answer.content
    assert "foreign_key" in answer.content
    assert answer.answer_confidence == "high"
    assert answer.query_plan["question_type"] == "relationship_path"
    assert answer.query_plan["selection"] == {"kind": "node", "id": field_node_id}
    assert answer.citations == [
        Citation(
            label="Orders -> Orders.customer_id",
            source_ref="field:orders.customer_id",
            citation_type="graph_edge",
        ),
        Citation(
            label="Orders.customer_id -> Customers.customer_id",
            source_ref="suggestion:4",
            citation_type="graph_edge",
        ),
    ]
    assert answer.highlighted_graph_path == [table_node_id, field_node_id, target_node_id]
    assert [action.type for action in answer.graph_actions] == [
        "focus_node",
        "highlight_path",
        "open_evidence",
    ]
    assert answer.graph_actions[0].node_ids == [field_node_id]
    assert answer.graph_actions[1].node_ids == [table_node_id, field_node_id, target_node_id]
    assert answer.graph_actions[2].edge_ids == [contains_edge_id, relationship_edge_id]
    assert answer.next_steps == [
        "聚焦当前节点查看上下游。",
        "打开证据检查器核对相邻关系。",
    ]


def test_chat_service_explains_selected_edge_evidence(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Demo", settings={})
        session.add(project)
        session.flush()

        source_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        target_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Customers.customer_id",
            source_ref="customers.customer_id",
            node_metadata={},
            position_x=0,
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
            evidence_ref="suggestion:9",
            edge_metadata={"evidence_summary": "Customer IDs overlap across imported sheets."},
        )
        session.add(edge)
        session.commit()
        project_id = project.id
        edge_id = edge.id
        source_node_id = source_node.id
        target_node_id = target_node.id

    answer = ChatService(paths=paths, session_factory=session_factory).answer_question(
        project_id=project_id,
        question="解释当前选中关系为什么可能成立，并说明置信度和证据。",
        selection={"kind": "edge", "id": edge_id},
    )

    assert "Orders.customer_id -> Customers.customer_id" in answer.content
    assert "foreign_key" in answer.content
    assert "置信度 94%" in answer.content
    assert "suggested" in answer.content
    assert "Customer IDs overlap across imported sheets." in answer.content
    assert answer.answer_confidence == "high"
    assert answer.query_plan["selection"] == {"kind": "edge", "id": edge_id}
    assert answer.citations == [
        Citation(
            label="Orders.customer_id -> Customers.customer_id",
            source_ref="suggestion:9",
            citation_type="graph_edge",
        )
    ]
    assert answer.highlighted_graph_path == [source_node_id, target_node_id]


def test_classify_question_returns_aggregate_analysis_for_aggregate_terms():
    assert (
        classify_question("Which customer has the highest lifetime value?")
        == "aggregate_analysis"
    )


def test_classify_question_supports_chinese_workbench_prompts():
    assert classify_question("哪些字段可能有关联？") == "schema_explanation"
    assert classify_question("解释当前图谱的主要结构") == "schema_explanation"
    assert classify_question("解释当前选中项的上下游关系") == "relationship_path"
    assert classify_question("哪些关系需要人工确认？") == "relationship_path"


def test_chat_service_returns_low_confidence_for_aggregate_question(
    tmp_workspace,
):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    answer = ChatService(paths=paths, session_factory=session_factory).answer_question(
        project_id=1,
        question="Which customer has the highest lifetime value?",
    )

    assert answer.answer_confidence == "low"
    assert answer.citations == []
    assert answer.query_plan["question_type"] == "aggregate_analysis"


def test_chat_service_returns_low_confidence_for_unsupported_question(
    tmp_workspace,
):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    answer = ChatService(paths=paths, session_factory=session_factory).answer_question(
        project_id=1,
        question="Can you write a haiku about the import?",
    )

    assert answer.answer_confidence == "low"
    assert answer.citations == []
    assert answer.query_plan["question_type"] == "unsupported"
