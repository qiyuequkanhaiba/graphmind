from __future__ import annotations


def batch_import_diagnostics(items: list) -> dict[str, object]:
    succeeded_items = [item for item in items if item.status != "failed"]
    source_kind_counts: dict[str, int] = {}
    for item in succeeded_items:
        source_kind_counts[item.source_kind] = source_kind_counts.get(item.source_kind, 0) + 1

    return {
        "document_count": sum(
            _summary_int(item.summary, "document_count")
            or len(_summary_int_list(item.summary, "document_ids"))
            for item in succeeded_items
        ),
        "repository_file_count": sum(
            _summary_int(item.summary, "repository_file_count") for item in succeeded_items
        ),
        "ignored_file_count": sum(
            _summary_int(item.summary, "ignored_file_count") for item in succeeded_items
        ),
        "chunk_count": sum(_summary_int(item.summary, "chunk_count") for item in succeeded_items),
        "entity_count": sum(_summary_int(item.summary, "entity_count") for item in succeeded_items),
        "relationship_count": sum(
            _summary_int(item.summary, "relationship_count") for item in succeeded_items
        ),
        "graph_node_count": sum(
            _summary_int(item.summary, "graph_node_count") for item in succeeded_items
        ),
        "graph_edge_count": sum(
            _summary_int(item.summary, "graph_edge_count") for item in succeeded_items
        ),
        "source_kind_counts": dict(sorted(source_kind_counts.items())),
    }


def _summary_int(summary: dict[str, object] | None, key: str) -> int:
    value = (summary or {}).get(key)
    if isinstance(value, int):
        return value
    diagnostics = (summary or {}).get("diagnostics")
    if isinstance(diagnostics, dict):
        diagnostic_value = diagnostics.get(key)
        if isinstance(diagnostic_value, int):
            return diagnostic_value
    return 0


def _summary_int_list(summary: dict[str, object] | None, key: str) -> list[int]:
    value = (summary or {}).get(key)
    if not isinstance(value, list):
        return []
    return [entry for entry in value if isinstance(entry, int)]
