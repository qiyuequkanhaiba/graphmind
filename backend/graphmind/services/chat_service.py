from collections.abc import Callable
from typing import Any

from sqlalchemy.orm import Session

from graphmind.core.answer_contract import (
    Citation,
    CitedAnswer,
    GraphAction,
    RetrievedEvidence,
    classify_question,
)
from graphmind.services.ai_provider import OpenAICompatibleChatProvider
from graphmind.services.evidence_retrieval import EvidenceRetrievalService
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


class ChatService:
    def __init__(
        self,
        paths: WorkspacePaths,
        session_factory: Callable[[], Session],
        ai_provider: Any | None = None,
    ) -> None:
        self.paths = paths
        self.session_factory = session_factory
        self.ai_provider = ai_provider or OpenAICompatibleChatProvider()
        self.retrieval_service = EvidenceRetrievalService(session_factory=session_factory)

    def answer_question(
        self, project_id: int, question: str, selection: dict[str, Any] | None = None
    ) -> CitedAnswer:
        rule_answer = self._rule_answer_question(project_id, question, selection)
        return self._maybe_enhance_with_ai(project_id, question, rule_answer)

    def _rule_answer_question(
        self, project_id: int, question: str, selection: dict[str, Any] | None = None
    ) -> CitedAnswer:
        question_type = classify_question(question)
        if question_type == "schema_explanation":
            return self._schema_answer(project_id, question)
        if question_type == "relationship_path":
            return self._relationship_answer(project_id, question, selection)

        return CitedAnswer(
            content=(
                "I cannot answer that from the trusted graph yet. Review relationships first "
                "or ask about available fields and schema."
            ),
            query_plan={
                "question_type": question_type,
                "question": question,
                "required_context": ["trusted graph path"],
            },
            answer_confidence="low",
            citations=[],
            highlighted_graph_path=[],
        )

    def _maybe_enhance_with_ai(
        self, project_id: int, question: str, rule_answer: CitedAnswer
    ) -> CitedAnswer:
        chat_settings = self._chat_settings(project_id)
        provider_name = str(chat_settings.get("provider") or "rules")
        retrieved_documents = self._retrieved_documents(project_id, question)
        retrieved_evidence = _retrieved_evidence_items(retrieved_documents)
        retrieved_evidence_text = [document.content for document in retrieved_documents]
        rule_answer = self._with_retrieval_graph_actions(
            project_id, rule_answer, retrieved_documents
        )
        if provider_name == "rules":
            return _with_query_plan_metadata(
                rule_answer,
                {
                    "answer_mode": "rules",
                    "ai_provider": "rules",
                    "retrieval_document_count": len(retrieved_evidence),
                },
                retrieved_evidence=retrieved_evidence,
            )

        result = self.ai_provider.generate(
            settings=chat_settings,
            question=question,
            rule_answer=rule_answer.content,
            citations=[citation.label for citation in rule_answer.citations],
            retrieved_evidence=retrieved_evidence_text,
        )
        if result.content:
            return CitedAnswer(
                content=result.content,
                query_plan={
                    **rule_answer.query_plan,
                    "answer_mode": result.answer_mode,
                    "ai_provider": provider_name,
                    "retrieval_document_count": len(retrieved_evidence),
                },
                answer_confidence=rule_answer.answer_confidence,
                citations=rule_answer.citations,
                highlighted_graph_path=rule_answer.highlighted_graph_path,
                retrieved_evidence=retrieved_evidence,
                graph_actions=rule_answer.graph_actions,
                next_steps=rule_answer.next_steps,
            )

        return _with_query_plan_metadata(
            rule_answer,
            {
                "answer_mode": "rule_fallback",
                "ai_provider": provider_name,
                "ai_fallback_reason": result.fallback_reason or "provider_unavailable",
                "retrieval_document_count": len(retrieved_evidence),
            },
            retrieved_evidence=retrieved_evidence,
        )

    def _with_retrieval_graph_actions(
        self, project_id: int, answer: CitedAnswer, retrieved_documents
    ) -> CitedAnswer:
        if answer.graph_actions:
            return answer

        edge_ids = _edge_ids_from_retrieved_documents(retrieved_documents)
        if not edge_ids:
            return answer

        with self.session_factory() as session:
            edges = (
                session.query(GraphEdge)
                .filter(GraphEdge.project_id == project_id, GraphEdge.id.in_(edge_ids))
                .order_by(GraphEdge.id)
                .all()
            )

        if not edges:
            return answer

        node_ids = unique_ints(
            [
                node_id
                for edge in edges
                for node_id in (edge.source_node_id, edge.target_node_id)
            ]
        )
        edge_ids = [edge.id for edge in edges]
        evidence_refs = unique_strings([edge.evidence_ref for edge in edges])
        suggestion_ids = unique_ints(
            [
                edge.created_from_suggestion_id
                for edge in edges
                if edge.created_from_suggestion_id is not None
            ]
        )

        return CitedAnswer(
            content=answer.content,
            query_plan=answer.query_plan,
            answer_confidence=answer.answer_confidence,
            citations=answer.citations,
            highlighted_graph_path=answer.highlighted_graph_path or node_ids,
            retrieved_evidence=answer.retrieved_evidence,
            graph_actions=[
                GraphAction(
                    id="highlight-path",
                    type="highlight_path",
                    label="高亮图谱路径",
                    description="在图谱中高亮回答涉及的字段和关系。",
                    node_ids=node_ids,
                    edge_ids=edge_ids,
                    suggestion_ids=suggestion_ids,
                    evidence_refs=evidence_refs,
                ),
                GraphAction(
                    id="open-evidence",
                    type="open_evidence",
                    label="打开证据",
                    description="打开回答引用的关系证据。",
                    node_ids=node_ids,
                    edge_ids=edge_ids,
                    suggestion_ids=suggestion_ids,
                    evidence_refs=evidence_refs,
                ),
            ],
            next_steps=[
                "查看 AI 高亮路径中的字段关系。",
                "打开证据检查器核对引用关系。",
            ],
        )

    def _retrieved_documents(self, project_id: int, question: str):
        try:
            return self.retrieval_service.search(project_id, question, limit=5)
        except Exception:
            return []

    def _chat_settings(self, project_id: int) -> dict[str, Any]:
        with self.session_factory() as session:
            project = session.get(Project, project_id)
            if project is None or not isinstance(project.settings, dict):
                return {"provider": "rules"}
            ai_settings = project.settings.get("ai")
            if not isinstance(ai_settings, dict):
                return {"provider": "rules"}
            chat_settings = ai_settings.get("chat")
            return chat_settings if isinstance(chat_settings, dict) else {"provider": "rules"}

    def _schema_answer(self, project_id: int, question: str) -> CitedAnswer:
        wants_chinese = _contains_cjk(question)
        with self.session_factory() as session:
            rows = (
                session.query(Sheet, FieldProfile)
                .join(Dataset, Sheet.dataset_id == Dataset.id)
                .join(FieldProfile, FieldProfile.sheet_id == Sheet.id)
                .filter(Dataset.project_id == project_id)
                .order_by(Sheet.name, FieldProfile.normalized_name)
                .all()
            )

        fields_by_sheet: dict[str, list[FieldProfile]] = {}
        for sheet, field in rows:
            fields_by_sheet.setdefault(sheet.name, []).append(field)

        if not fields_by_sheet:
            return CitedAnswer(
                content=(
                    "当前还没有可分析的已导入工作表。"
                    if wants_chinese
                    else "No imported sheets are available yet."
                ),
                query_plan={"question_type": "schema_explanation", "question": question},
                answer_confidence="low",
                citations=[],
                highlighted_graph_path=[],
            )

        parts = []
        citations: list[Citation] = []
        for sheet_name, fields in fields_by_sheet.items():
            field_names = ", ".join(field.normalized_name for field in fields)
            if wants_chinese:
                parts.append(f"{sheet_name} 包含字段：{field_names}。")
            else:
                parts.append(f"{sheet_name} contains: {field_names}.")
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

    def _relationship_answer(
        self, project_id: int, question: str, selection: dict[str, Any] | None
    ) -> CitedAnswer:
        wants_chinese = _contains_cjk(question)
        if selection is not None:
            return self._selected_item_relationship_answer(project_id, question, selection)

        with self.session_factory() as session:
            suggestions = (
                session.query(RelationshipSuggestion)
                .filter(
                    RelationshipSuggestion.project_id == project_id,
                    RelationshipSuggestion.decision_status == "pending",
                )
                .order_by(RelationshipSuggestion.id)
                .all()
            )

            field_ids = {
                field_id
                for suggestion in suggestions
                for field_id in (suggestion.source_field_id, suggestion.target_field_id)
                if field_id is not None
            }
            fields = (
                session.query(FieldProfile).join(Sheet).filter(FieldProfile.id.in_(field_ids)).all()
                if field_ids
                else []
            )
            field_labels = {
                field.id: f"{field.sheet.name}.{field.normalized_name}"
                for field in fields
                if field.sheet is not None
            }

            graph_nodes = (
                session.query(GraphNode)
                .filter(GraphNode.project_id == project_id, GraphNode.node_type == "field")
                .all()
            )
            graph_node_ids_by_label = {
                node.label.lower(): node.id
                for node in graph_nodes
            } | {
                node.source_ref.lower(): node.id
                for node in graph_nodes
            }

        suggestions = _dedupe_relationship_suggestions(suggestions, field_labels)
        if not suggestions:
            return CitedAnswer(
                content=(
                    "当前没有需要人工确认的关系。"
                    if wants_chinese
                    else "No relationships currently need human review."
                ),
                query_plan={"question_type": "relationship_path", "question": question},
                answer_confidence="high",
                citations=[],
                highlighted_graph_path=[],
            )

        citations: list[Citation] = []
        highlighted_graph_path: list[int] = []
        lines = []
        for suggestion in suggestions:
            source_label = field_labels.get(suggestion.source_field_id, "Unknown field")
            target_label = (
                field_labels.get(suggestion.target_field_id)
                if suggestion.target_field_id is not None
                else None
            )
            relationship_label = (
                f"{source_label} -> {target_label}" if target_label is not None else source_label
            )
            confidence = round(suggestion.confidence * 100)
            if wants_chinese:
                lines.append(
                    f"{relationship_label}：{suggestion.relationship_type}，"
                    f"置信度 {confidence}%，证据：{suggestion.evidence_summary}"
                )
            else:
                lines.append(
                    f"{relationship_label}: {suggestion.relationship_type}, "
                    f"{confidence}% confidence. Evidence: {suggestion.evidence_summary}"
                )
            citations.append(
                Citation(
                    label=relationship_label,
                    source_ref=f"suggestion:{suggestion.id}",
                    citation_type="relationship_suggestion",
                )
            )
            highlighted_graph_path.extend(
                node_id
                for label in (source_label, target_label)
                if label is not None
                for node_id in [graph_node_ids_by_label.get(label.lower())]
                if node_id is not None
            )

        unique_highlighted_path = list(dict.fromkeys(highlighted_graph_path))
        if wants_chinese:
            content = f"有 {len(suggestions)} 条关系需要人工确认：" + " ".join(lines)
        else:
            content = f"{len(suggestions)} relationships need human review: " + " ".join(lines)

        return CitedAnswer(
            content=content,
            query_plan={"question_type": "relationship_path", "question": question},
            answer_confidence="high",
            citations=citations,
            highlighted_graph_path=unique_highlighted_path,
            graph_actions=[
                GraphAction(
                    id="filter-pending-reviews",
                    type="filter_pending_reviews",
                    label="查看待审核关系",
                    description="切换到审核面板查看 AI 提到的待确认关系。",
                    node_ids=unique_highlighted_path,
                    suggestion_ids=[suggestion.id for suggestion in suggestions],
                    metadata={"count": len(suggestions)},
                ),
                GraphAction(
                    id="highlight-path",
                    type="highlight_path",
                    label="高亮图谱路径",
                    description="在图谱中高亮这些待审核关系涉及的字段。",
                    node_ids=unique_highlighted_path,
                    suggestion_ids=[suggestion.id for suggestion in suggestions],
                ),
            ],
            next_steps=[
                "查看 AI 高亮路径中的字段关系。",
                "打开审核面板确认或拒绝待审核关系。",
            ],
        )

    def _selected_item_relationship_answer(
        self, project_id: int, question: str, selection: dict[str, Any]
    ) -> CitedAnswer:
        wants_chinese = _contains_cjk(question)
        if selection.get("kind") == "edge":
            return self._selected_edge_relationship_answer(
                project_id, question, selection, wants_chinese
            )

        if selection.get("kind") != "node":
            return CitedAnswer(
                content=(
                    "当前只支持解释选中节点的上下游关系。"
                    if wants_chinese
                    else "Only selected node upstream and downstream relationships are supported."
                ),
                query_plan={
                    "question_type": "relationship_path",
                    "question": question,
                    "selection": selection,
                },
                answer_confidence="low",
                citations=[],
                highlighted_graph_path=[],
            )

        selected_id = selection.get("id")
        with self.session_factory() as session:
            selected_node = (
                session.query(GraphNode)
                .filter(GraphNode.project_id == project_id, GraphNode.id == selected_id)
                .one_or_none()
            )
            if selected_node is None:
                return CitedAnswer(
                    content=(
                        "当前选中项不在图谱中。"
                        if wants_chinese
                        else "The selected item is not available in the graph."
                    ),
                    query_plan={
                        "question_type": "relationship_path",
                        "question": question,
                        "selection": selection,
                    },
                    answer_confidence="low",
                    citations=[],
                    highlighted_graph_path=[],
                )

            edges = (
                session.query(GraphEdge)
                .filter(
                    GraphEdge.project_id == project_id,
                    (
                        (GraphEdge.source_node_id == selected_node.id)
                        | (GraphEdge.target_node_id == selected_node.id)
                    ),
                )
                .order_by(GraphEdge.id)
                .all()
            )
            adjacent_node_ids = {
                edge.source_node_id
                if edge.target_node_id == selected_node.id
                else edge.target_node_id
                for edge in edges
            }
            adjacent_nodes = (
                session.query(GraphNode)
                .filter(GraphNode.id.in_(adjacent_node_ids))
                .all()
                if adjacent_node_ids
                else []
            )
            adjacent_by_id = {node.id: node for node in adjacent_nodes}

        upstream_edges = [edge for edge in edges if edge.target_node_id == selected_node.id]
        downstream_edges = [edge for edge in edges if edge.source_node_id == selected_node.id]
        upstream_labels = [
            adjacent_by_id[edge.source_node_id].label
            for edge in upstream_edges
            if edge.source_node_id in adjacent_by_id
        ]
        downstream_labels = [
            adjacent_by_id[edge.target_node_id].label
            for edge in downstream_edges
            if edge.target_node_id in adjacent_by_id
        ]
        relationship_types = ", ".join(
            dict.fromkeys(edge.edge_type for edge in [*upstream_edges, *downstream_edges])
        )
        if wants_chinese:
            content = (
                f"{selected_node.label} 的上游有 {len(upstream_labels)} 个节点："
                f"{_join_labels(upstream_labels, wants_chinese)}；"
                f"下游有 {len(downstream_labels)} 个节点："
                f"{_join_labels(downstream_labels, wants_chinese)}。"
            )
            if relationship_types:
                content += f" 涉及关系类型：{relationship_types}。"
        else:
            content = (
                f"{selected_node.label} has {len(upstream_labels)} upstream nodes: "
                f"{_join_labels(upstream_labels, wants_chinese)}; "
                f"{len(downstream_labels)} downstream nodes: "
                f"{_join_labels(downstream_labels, wants_chinese)}."
            )
            if relationship_types:
                content += f" Relationship types: {relationship_types}."

        citations = []
        highlighted_graph_path = [
            edge.source_node_id
            for edge in upstream_edges
            if edge.source_node_id in adjacent_by_id
        ]
        highlighted_graph_path.append(selected_node.id)
        highlighted_graph_path.extend(
            edge.target_node_id
            for edge in downstream_edges
            if edge.target_node_id in adjacent_by_id
        )
        for edge in [*upstream_edges, *downstream_edges]:
            source = adjacent_by_id.get(edge.source_node_id, selected_node)
            target = adjacent_by_id.get(edge.target_node_id, selected_node)
            citations.append(
                Citation(
                    label=f"{source.label} -> {target.label}",
                    source_ref=edge.evidence_ref,
                    citation_type="graph_edge",
                )
            )

        return CitedAnswer(
            content=content,
            query_plan={
                "question_type": "relationship_path",
                "question": question,
                "selection": selection,
            },
            answer_confidence="high",
            citations=citations,
            highlighted_graph_path=list(dict.fromkeys(highlighted_graph_path)),
            graph_actions=[
                GraphAction(
                    id=f"focus-node-{selected_node.id}",
                    type="focus_node",
                    label="聚焦节点",
                    description="把画布视角移动到当前选中节点。",
                    node_ids=[selected_node.id],
                ),
                GraphAction(
                    id="highlight-path",
                    type="highlight_path",
                    label="高亮上下游",
                    description="高亮当前节点的上下游关系路径。",
                    node_ids=list(dict.fromkeys(highlighted_graph_path)),
                    edge_ids=[edge.id for edge in [*upstream_edges, *downstream_edges]],
                    evidence_refs=unique_strings(
                        [edge.evidence_ref for edge in [*upstream_edges, *downstream_edges]]
                    ),
                ),
                GraphAction(
                    id="open-evidence",
                    type="open_evidence",
                    label="打开证据",
                    description="打开当前节点相邻关系的证据。",
                    node_ids=[selected_node.id],
                    edge_ids=[edge.id for edge in [*upstream_edges, *downstream_edges]],
                    evidence_refs=unique_strings(
                        [edge.evidence_ref for edge in [*upstream_edges, *downstream_edges]]
                    ),
                ),
            ],
            next_steps=[
                "聚焦当前节点查看上下游。",
                "打开证据检查器核对相邻关系。",
            ],
        )

    def _selected_edge_relationship_answer(
        self,
        project_id: int,
        question: str,
        selection: dict[str, Any],
        wants_chinese: bool,
    ) -> CitedAnswer:
        edge_id = selection.get("id")
        with self.session_factory() as session:
            edge = (
                session.query(GraphEdge)
                .filter(GraphEdge.project_id == project_id, GraphEdge.id == edge_id)
                .one_or_none()
            )
            if edge is None:
                return CitedAnswer(
                    content=(
                        "当前选中关系不在图谱中。"
                        if wants_chinese
                        else "The selected relationship is not available in the graph."
                    ),
                    query_plan={
                        "question_type": "relationship_path",
                        "question": question,
                        "selection": selection,
                    },
                    answer_confidence="low",
                    citations=[],
                    highlighted_graph_path=[],
                )

            endpoints = (
                session.query(GraphNode)
                .filter(GraphNode.id.in_([edge.source_node_id, edge.target_node_id]))
                .all()
            )
            endpoints_by_id = {node.id: node for node in endpoints}

        source_node = endpoints_by_id.get(edge.source_node_id)
        target_node = endpoints_by_id.get(edge.target_node_id)
        source_label = source_node.label if source_node is not None else str(edge.source_node_id)
        target_label = target_node.label if target_node is not None else str(edge.target_node_id)
        relationship_label = f"{source_label} -> {target_label}"
        confidence = round(edge.confidence * 100)
        evidence_summary = (
            edge.edge_metadata.get("evidence_summary")
            if isinstance(edge.edge_metadata, dict)
            else None
        )
        if not evidence_summary:
            evidence_summary = (
                "这是从导入表格结构中识别出的关系。"
                if wants_chinese
                else "Structural relationship from the imported table profile."
            )

        if wants_chinese:
            content = (
                f"{relationship_label} 是 {edge.edge_type} 关系，"
                f"置信度 {confidence}%，当前状态 {edge.status}。"
                f"证据：{evidence_summary}"
            )
        else:
            content = (
                f"{relationship_label} is a {edge.edge_type} relationship with "
                f"{confidence}% confidence and status {edge.status}. Evidence: {evidence_summary}"
            )

        highlighted_graph_path = [
            node_id
            for node_id in [edge.source_node_id, edge.target_node_id]
            if node_id in endpoints_by_id
        ]

        return CitedAnswer(
            content=content,
            query_plan={
                "question_type": "relationship_path",
                "question": question,
                "selection": selection,
            },
            answer_confidence="high",
            citations=[
                Citation(
                    label=relationship_label,
                    source_ref=edge.evidence_ref,
                    citation_type="graph_edge",
                )
            ],
            highlighted_graph_path=highlighted_graph_path,
            graph_actions=[
                GraphAction(
                    id=f"open-evidence-{edge.id}",
                    type="open_evidence",
                    label="打开证据",
                    description="打开当前关系的证据详情。",
                    node_ids=highlighted_graph_path,
                    edge_ids=[edge.id],
                    evidence_refs=[edge.evidence_ref],
                    suggestion_ids=(
                        [edge.created_from_suggestion_id]
                        if edge.created_from_suggestion_id is not None
                        else []
                    ),
                ),
                GraphAction(
                    id="highlight-path",
                    type="highlight_path",
                    label="高亮关系路径",
                    description="高亮当前关系连接的两个字段。",
                    node_ids=highlighted_graph_path,
                    edge_ids=[edge.id],
                    evidence_refs=[edge.evidence_ref],
                ),
            ],
            next_steps=[
                "打开证据检查器核对当前关系。",
                "根据证据决定接受、编辑或拒绝关系。",
            ],
        )


def _contains_cjk(text: str) -> bool:
    return any("\u4e00" <= character <= "\u9fff" for character in text)


def _with_query_plan_metadata(
    answer: CitedAnswer,
    metadata: dict[str, Any],
    retrieved_evidence: list[RetrievedEvidence] | None = None,
) -> CitedAnswer:
    return CitedAnswer(
        content=answer.content,
        query_plan={**answer.query_plan, **metadata},
        answer_confidence=answer.answer_confidence,
        citations=answer.citations,
        highlighted_graph_path=answer.highlighted_graph_path,
        retrieved_evidence=(
            answer.retrieved_evidence if retrieved_evidence is None else retrieved_evidence
        ),
        graph_actions=answer.graph_actions,
        next_steps=answer.next_steps,
    )


def _join_labels(labels: list[str], wants_chinese: bool) -> str:
    if labels:
        return "、".join(labels) if wants_chinese else ", ".join(labels)
    return "无" if wants_chinese else "none"


def _dedupe_relationship_suggestions(
    suggestions: list[RelationshipSuggestion], field_labels: dict[int, str]
) -> list[RelationshipSuggestion]:
    unique_suggestions: list[RelationshipSuggestion] = []
    seen_keys = set()
    for suggestion in suggestions:
        source_label = field_labels.get(suggestion.source_field_id, "Unknown field")
        target_label = (
            field_labels.get(suggestion.target_field_id)
            if suggestion.target_field_id is not None
            else None
        )
        key = (
            source_label.casefold(),
            target_label.casefold() if target_label is not None else "",
            suggestion.relationship_type.casefold(),
            " ".join((suggestion.evidence_summary or "").casefold().split()),
        )
        if key in seen_keys:
            continue
        seen_keys.add(key)
        unique_suggestions.append(suggestion)
    return unique_suggestions


def _retrieved_evidence_items(documents) -> list[RetrievedEvidence]:
    return [
        RetrievedEvidence(
            label=document.label,
            kind=document.kind,
            source_ref=document.source_ref,
            score=round(document.score, 4),
            excerpt=_evidence_excerpt(document.content),
        )
        for document in documents
    ]


def _evidence_excerpt(content: str, max_length: int = 220) -> str:
    compact = " ".join(content.split())
    if len(compact) <= max_length:
        return compact
    return f"{compact[: max_length - 1].rstrip()}…"


def _edge_ids_from_retrieved_documents(documents) -> list[int]:
    edge_ids = []
    for document in documents:
        if getattr(document, "kind", "") != "graph_edge":
            continue
        document_id = str(getattr(document, "id", ""))
        if not document_id.startswith("edge:"):
            continue
        try:
            edge_ids.append(int(document_id.split(":", 1)[1]))
        except ValueError:
            continue
    return unique_ints(edge_ids)


def unique_ints(values: list[int | None]) -> list[int]:
    return [value for value in dict.fromkeys(values) if value is not None]


def unique_strings(values: list[str | None]) -> list[str]:
    return [value for value in dict.fromkeys(values) if value]
