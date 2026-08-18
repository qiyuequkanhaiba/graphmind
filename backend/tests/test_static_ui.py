from fastapi.testclient import TestClient

from graphmind.api.app import create_app


def test_api_health_still_works_when_static_ui_is_mounted(tmp_path, monkeypatch):
    ui_dir = tmp_path / "ui"
    ui_dir.mkdir()
    (ui_dir / "index.html").write_text("<html><body>GraphMind</body></html>", encoding="utf-8")
    (ui_dir / "app.js").write_text("window.graphmind = true;", encoding="utf-8")
    monkeypatch.setenv("GRAPHMIND_STATIC_DIR", str(ui_dir))

    app = create_app(workspace_root=tmp_path / "workspace")
    client = TestClient(app)

    health = client.get("/api/health")
    index = client.get("/")
    asset = client.get("/app.js")

    assert health.status_code == 200
    assert health.json() == {"status": "ok"}
    assert index.status_code == 200
    assert "GraphMind" in index.text
    assert asset.status_code == 200
    assert "graphmind" in asset.text


def test_missing_static_ui_dir_raises(tmp_path, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_STATIC_DIR", str(tmp_path / "missing-ui"))

    try:
        create_app(workspace_root=tmp_path / "workspace")
    except RuntimeError as error:
        assert "GRAPHMIND_STATIC_DIR" in str(error)
    else:
        raise AssertionError("expected GRAPHMIND_STATIC_DIR to be rejected")
