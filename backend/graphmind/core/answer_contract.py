from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Citation:
    label: str
    source_ref: str
    citation_type: str


@dataclass(frozen=True)
class RetrievedEvidence:
    label: str
    kind: str
    source_ref: str
    score: float
    excerpt: str


@dataclass(frozen=True)
class GraphAction:
    id: str
    type: str
    label: str
    description: str | None = None
    node_ids: list[int] | None = None
    edge_ids: list[int] | None = None
    suggestion_ids: list[int] | None = None
    evidence_refs: list[str] | None = None
    metadata: dict[str, Any] | None = None


@dataclass(frozen=True)
class CitedAnswer:
    content: str
    query_plan: dict[str, Any]
    answer_confidence: str
    citations: list[Citation]
    highlighted_graph_path: list[int]
    retrieved_evidence: list[RetrievedEvidence] | None = None
    graph_actions: list[GraphAction] | None = None
    next_steps: list[str] | None = None


def classify_question(question: str) -> str:
    lowered = question.lower()
    if _contains_any(lowered, ["field", "column", "schema", "字段", "列", "图谱", "结构"]):
        return "schema_explanation"
    if _contains_any(
        lowered,
        ["relationship", "connected", "path", "关联", "关系", "上下游", "人工确认", "审核"],
    ):
        return "relationship_path"
    if (
        "highest" in lowered
        or "average" in lowered
        or "total" in lowered
        or "compare" in lowered
    ):
        return "aggregate_analysis"
    return "unsupported"


def _contains_any(text: str, keywords: list[str]) -> bool:
    return any(keyword in text for keyword in keywords)
