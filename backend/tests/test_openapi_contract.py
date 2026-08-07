from scripts.export_openapi_contract import (
    DEFAULT_OUTPUT,
    build_openapi_contract_summary,
    load_snapshot,
)


def test_openapi_contract_summary_matches_snapshot(tmp_workspace):
    summary = build_openapi_contract_summary(tmp_workspace)
    snapshot = load_snapshot(DEFAULT_OUTPUT)

    assert summary == snapshot
    paths = summary["paths"]
    assert set(paths["/api/health"]) == {"get"}
    assert set(paths["/api/ready"]) == {"get"}
    assert set(paths["/api/auth/session"]) == {"get", "post"}
    assert set(paths["/api/projects/{project_id}/review-analytics"]) == {"get"}
    assert set(paths["/api/projects/{project_id}/import-jobs/recover"]) == {"post"}
    schemas = summary["components"]["schemas"]
    assert "WorkspaceSnapshotResponse" in schemas
    assert "ReviewAnalyticsSnapshotSummaryResponse" in schemas
