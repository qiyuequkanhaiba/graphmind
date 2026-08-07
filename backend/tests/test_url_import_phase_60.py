from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from graphmind.api.app import create_app
from graphmind.services import import_service as import_service_module
from graphmind.services import url_import as url_import_module
from graphmind.services.import_service import ImportService
from graphmind.services.url_import import (
    URL_FETCH_TIMEOUT_SECONDS,
    FetchedURLSource,
    URLImportError,
    fetch_url_source,
    html_to_text,
    reset_url_import_quota,
)
from graphmind.storage.database import create_session_factory
from graphmind.storage.models import ImportItem
from graphmind.storage.repositories import DocumentRepository
from graphmind.storage.workspace import WorkspacePaths


@pytest.fixture(autouse=True)
def public_response_peer(monkeypatch):
    monkeypatch.setattr(
        "graphmind.services.url_import._response_peer_ip",
        lambda _response: "93.184.216.34",
    )


def test_url_import_persists_source_chunks_and_diagnostics(tmp_workspace, monkeypatch):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "URL Import"}).json()["id"]

    def fake_fetch(url: str) -> FetchedURLSource:
        assert url == "https://example.com/docs/architecture"
        return FetchedURLSource(
            requested_url=url,
            final_url=url,
            title="Architecture Docs",
            content_type="text/html",
            status_code=200,
            body=b"GraphMind links customerId to /api/projects.",
            extension=".txt",
            fetched_at="2026-06-06T00:00:00+00:00",
        )

    monkeypatch.setattr("graphmind.services.import_service.fetch_url_source", fake_fetch)

    response = client.post(
        f"/api/projects/{project_id}/url-imports",
        json={"url": "https://example.com/docs/architecture"},
    )

    assert response.status_code == 200
    batch = response.json()
    assert batch["status"] == "succeeded"
    assert batch["items"][0]["source_kind"] == "url"
    assert batch["summary"]["diagnostics"]["final_url"] == "https://example.com/docs/architecture"
    sources = client.get(f"/api/projects/{project_id}/sources/detail").json()
    assert sources[0]["title"] == "Architecture Docs"
    assert sources[0]["source_ref"] == "https://example.com/docs/architecture"
    assert sources[0]["metadata"]["source_kind"] == "url"
    chunks = client.get(f"/api/projects/{project_id}/sources/{sources[0]['id']}/chunks").json()
    assert chunks[0]["source_ref"] == "https://example.com/docs/architecture#chunk:0"
    assert "customerId" in chunks[0]["content"]


def test_failed_url_import_keeps_archived_source_retryable(tmp_workspace, monkeypatch):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Retry URL Import"}).json()["id"]
    fetched = FetchedURLSource(
        requested_url="https://example.com/retry.txt",
        final_url="https://example.com/retry.txt",
        title="Retry URL",
        content_type="text/plain",
        status_code=200,
        body=b"GraphMind connects customers and orders.",
        extension=".txt",
        fetched_at="2026-06-06T00:00:00+00:00",
    )
    monkeypatch.setattr(
        "graphmind.services.import_service.fetch_url_source",
        lambda _url: fetched,
    )
    original_create_source = DocumentRepository.create_source

    def fail_create_source(*_args, **_kwargs):
        raise RuntimeError("injected URL persistence failure")

    monkeypatch.setattr(DocumentRepository, "create_source", fail_create_source)

    response = client.post(
        f"/api/projects/{project_id}/url-imports",
        json={"url": fetched.requested_url},
    )

    assert response.status_code == 400
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        item = session.query(ImportItem).filter_by(project_id=project_id).one()
        item_id = item.id
        retry_source = paths.root / item.raw_data_ref
        assert item.status == "failed"
        assert retry_source.exists()
        assert retry_source.read_bytes() == fetched.body

    monkeypatch.setattr(DocumentRepository, "create_source", original_create_source)
    result = ImportService(paths, session_factory).retry_import_item(project_id, item_id)

    assert result.document_count == 1


def test_url_title_cannot_escape_document_import_directory_during_compensation(
    tmp_workspace,
    tmp_path,
    monkeypatch,
):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    original_create_source = DocumentRepository.create_source
    copied_destinations: list[Path] = []
    original_copy2 = import_service_module.shutil.copy2
    unsafe_titles = [
        "../../../../../traversal-title.txt",
        str(tmp_path / "absolute-title.txt"),
    ]

    def fail_create_source(*_args, **_kwargs):
        raise RuntimeError("injected URL persistence failure")

    def record_copy(source, destination, *args, **kwargs):
        copied_destinations.append(Path(destination).resolve(strict=False))
        return original_copy2(source, destination, *args, **kwargs)

    monkeypatch.setattr(DocumentRepository, "create_source", fail_create_source)
    monkeypatch.setattr(import_service_module.shutil, "copy2", record_copy)
    for index, title in enumerate(unsafe_titles):
        outside_path = (
            tmp_path / "traversal-title.txt"
            if title.startswith("..")
            else Path(title)
        )
        outside_path.write_text(f"sentinel-{index}", encoding="utf-8")
        fetched = FetchedURLSource(
            requested_url=f"https://example.com/{index}",
            final_url=f"https://example.com/{index}",
            title=title,
            content_type="text/plain",
            status_code=200,
            body=b"unsafe title test",
            extension=".txt",
            fetched_at="2026-06-06T00:00:00+00:00",
        )
        monkeypatch.setattr(
            "graphmind.services.import_service.fetch_url_source",
            lambda _url, fetched=fetched: fetched,
        )
        project_id = client.post(
            "/api/projects", json={"name": f"Unsafe URL Title {index}"}
        ).json()["id"]

        response = client.post(
            f"/api/projects/{project_id}/url-imports",
            json={"url": fetched.requested_url},
        )

        assert response.status_code == 400
        assert outside_path.read_text(encoding="utf-8") == f"sentinel-{index}"
        assert outside_path.exists()

    imports_dir = WorkspacePaths(tmp_workspace).imports_dir.resolve()
    assert copied_destinations
    assert all(destination.is_relative_to(imports_dir) for destination in copied_destinations)
    monkeypatch.setattr(DocumentRepository, "create_source", original_create_source)


def test_url_import_rejects_unsafe_url_before_import_batch(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Unsafe URL"}).json()["id"]

    response = client.post(
        f"/api/projects/{project_id}/url-imports",
        json={"url": "http://127.0.0.1:8000/internal"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == {
        "code": "URL_IMPORT_UNSAFE_NETWORK",
        "message": "URL resolves to a blocked network address",
        "user_action": "Use a public HTTP or HTTPS URL that is reachable from this machine.",
        "retryable": True,
        "field_errors": {"url": "URL resolves to a blocked network address"},
    }
    assert client.get(f"/api/projects/{project_id}/import-batches").json() == []


def test_fetch_url_source_rejects_non_http_scheme():
    try:
        fetch_url_source("file:///etc/passwd")
    except URLImportError as exc:
        assert "HTTP and HTTPS" in str(exc)
    else:
        raise AssertionError("Expected URLImportError")


def test_fetch_url_source_rejects_disallowed_port():
    try:
        fetch_url_source("https://example.com:22/private")
    except URLImportError as exc:
        assert "port is not allowed" in str(exc)
    else:
        raise AssertionError("Expected URLImportError")


@pytest.mark.parametrize(
    "url, expected_reason",
    [
        ("https://example.com:abc/private", "invalid_port"),
        ("https://example.com:99999/private", "invalid_port"),
        ("https://[bad/private", "malformed_url"),
    ],
)
def test_fetch_url_source_rejects_malformed_url_syntax(url, expected_reason):
    with pytest.raises(URLImportError, match="URL (port is invalid|is malformed)") as exc_info:
        fetch_url_source(url)

    assert exc_info.value.diagnostics["safety_decision"] == "rejected"
    assert exc_info.value.diagnostics["rejection_reason"] == expected_reason


def test_fetch_url_source_rejects_url_credentials():
    try:
        fetch_url_source("https://user:secret@example.com/private")
    except URLImportError as exc:
        assert "credentials are not supported" in str(exc)
    else:
        raise AssertionError("Expected URLImportError")


def test_fetch_url_source_rejects_host_outside_allowlist(monkeypatch):
    monkeypatch.setenv("GRAPHMIND_URL_IMPORT_ALLOWLIST", "docs.example.com")

    try:
        fetch_url_source("https://blog.example.com/notes")
    except URLImportError as exc:
        assert "URL host is not in the configured allowlist" in str(exc)
        assert exc.diagnostics["safety_decision"] == "rejected"
        assert exc.diagnostics["rejection_reason"] == "host_not_allowlisted"
        assert exc.diagnostics["host"] == "blog.example.com"
        assert exc.diagnostics["allowlist"] == ["docs.example.com"]
    else:
        raise AssertionError("Expected URLImportError")


def test_fetch_url_source_rejects_host_in_denylist(monkeypatch):
    monkeypatch.setenv("GRAPHMIND_URL_IMPORT_DENYLIST", "blocked.example.com")

    try:
        fetch_url_source("https://blocked.example.com/notes")
    except URLImportError as exc:
        assert "URL host is denied by configuration" in str(exc)
        assert exc.diagnostics["safety_decision"] == "rejected"
        assert exc.diagnostics["rejection_reason"] == "host_denylisted"
        assert exc.diagnostics["host"] == "blocked.example.com"
        assert exc.diagnostics["denylist"] == ["blocked.example.com"]
    else:
        raise AssertionError("Expected URLImportError")


def test_fetch_url_source_rejects_private_initial_host_resolution(monkeypatch):
    monkeypatch.setattr(
        "graphmind.services.url_import.socket.getaddrinfo",
        lambda *_args, **_kwargs: [(None, None, None, None, ("10.0.0.12", 443))],
    )

    try:
        fetch_url_source("https://private.example.com/notes")
    except URLImportError as exc:
        assert "blocked network address" in str(exc)
    else:
        raise AssertionError("Expected URLImportError")


def test_fetch_url_source_rejects_when_process_quota_is_exhausted(monkeypatch):
    reset_url_import_quota()
    monkeypatch.setenv("GRAPHMIND_URL_IMPORT_MAX_PER_PROCESS", "1")

    class TextResponse:
        status = 200
        headers = {"Content-Type": "text/plain"}

        def __init__(self, body: bytes):
            self._chunks = [body, b""]

        def read(self, size: int) -> bytes:  # noqa: ARG002
            return self._chunks.pop(0)

    class QuotaOpener:
        def __init__(self):
            self.count = 0

        def open(self, request, timeout):  # noqa: ARG002
            self.count += 1
            return TextResponse(f"GraphMind note {self.count}".encode())

    opener = QuotaOpener()
    monkeypatch.setattr(
        "graphmind.services.url_import.socket.getaddrinfo",
        lambda *_args, **_kwargs: [(None, None, None, None, ("93.184.216.34", 443))],
    )
    monkeypatch.setattr(
        "graphmind.services.url_import._open_validated_url",
        lambda request, _diagnostics, *, timeout: opener.open(request, timeout),
    )

    first = fetch_url_source("https://example.com/one.txt")
    assert first.safety_diagnostics["safety_decision"] == "accepted"
    assert first.safety_diagnostics["quota_used"] == 1
    assert first.safety_diagnostics["quota_limit"] == 1

    try:
        fetch_url_source("https://example.com/two.txt")
    except URLImportError as exc:
        assert "URL import quota exceeded" in str(exc)
        assert exc.diagnostics["safety_decision"] == "rejected"
        assert exc.diagnostics["rejection_reason"] == "quota_exceeded"
        assert exc.diagnostics["quota_used"] == 1
        assert exc.diagnostics["quota_limit"] == 1
    else:
        raise AssertionError("Expected URLImportError")
    finally:
        reset_url_import_quota()


def test_fetch_url_source_rejects_private_network_redirect(monkeypatch):
    class RedirectingOpener:
        def open(self, request, timeout):  # noqa: ARG002
            from urllib.error import HTTPError

            headers = {"Location": "http://127.0.0.1/admin"}
            raise HTTPError(request.full_url, 302, "Found", headers, None)

    monkeypatch.setattr(
        "graphmind.services.url_import.socket.getaddrinfo",
        lambda hostname, *_args, **_kwargs: [
            (None, None, None, None, ("93.184.216.34", 443))
        ]
        if hostname == "example.com"
        else [(None, None, None, None, ("127.0.0.1", 80))],
    )
    monkeypatch.setattr(
        "graphmind.services.url_import._open_validated_url",
        lambda request, _diagnostics, *, timeout: RedirectingOpener().open(request, timeout),
    )

    try:
        fetch_url_source("https://example.com/start")
    except URLImportError as exc:
        assert "blocked network address" in str(exc)
    else:
        raise AssertionError("Expected URLImportError")


def test_fetch_url_source_rejects_dns_rebinding_peer_mismatch(monkeypatch):
    class TextResponse:
        status = 200
        headers = {"Content-Type": "text/plain"}

        def read(self, _size: int) -> bytes:
            return b""

    class PublicOpener:
        def open(self, request, timeout):  # noqa: ARG002
            return TextResponse()

    monkeypatch.setattr(
        "graphmind.services.url_import.socket.getaddrinfo",
        lambda *_args, **_kwargs: [(None, None, None, None, ("93.184.216.34", 443))],
    )
    monkeypatch.setattr(
        "graphmind.services.url_import._open_validated_url",
        lambda request, _diagnostics, *, timeout: PublicOpener().open(request, timeout),
    )
    monkeypatch.setattr(
        "graphmind.services.url_import._response_peer_ip",
        lambda _response: "127.0.0.1",
    )

    with pytest.raises(URLImportError, match="did not match") as exc_info:
        fetch_url_source("https://example.com/rebound")

    assert exc_info.value.diagnostics["rejection_reason"] == "peer_address_mismatch"


def test_fetch_url_source_pins_https_connection_to_validated_dns_address(monkeypatch):
    dns_calls = 0

    def rebinding_dns(*_args, **_kwargs):
        nonlocal dns_calls
        dns_calls += 1
        address = "93.184.216.34" if dns_calls == 1 else "127.0.0.1"
        return [(2, 1, 6, "", (address, 443))]

    class TextResponse:
        status = 200
        headers = {"Content-Type": "text/plain"}

        def __init__(self):
            self._chunks = [b"Pinned public response", b""]
            self.closed = False

        def read(self, _size: int) -> bytes:
            return self._chunks.pop(0)

        def close(self) -> None:
            self.closed = True

    class RecordingPinnedConnection:
        instances = []

        def __init__(self, host: str, pinned_ip: str, port: int, timeout: int):
            self.host = host
            self.pinned_ip = pinned_ip
            self.port = port
            self.timeout = timeout
            self.request_args = None
            self.closed = False
            self.instances.append(self)

        def request(self, method, target, *, headers):
            self.request_args = (method, target, headers)

        def getresponse(self):
            return TextResponse()

        def close(self) -> None:
            self.closed = True

    monkeypatch.setattr(url_import_module.socket, "getaddrinfo", rebinding_dns)
    monkeypatch.setattr(
        url_import_module,
        "_PinnedHTTPSConnection",
        RecordingPinnedConnection,
    )

    fetched = fetch_url_source("https://example.com/notes.txt")

    connection = RecordingPinnedConnection.instances[0]
    assert fetched.body == b"Pinned public response"
    assert dns_calls == 1
    assert connection.host == "example.com"
    assert connection.pinned_ip == "93.184.216.34"
    assert connection.port == 443
    assert connection.timeout == URL_FETCH_TIMEOUT_SECONDS
    assert connection.request_args == (
        "GET",
        "/notes.txt",
        {
            "User-agent": "GraphMind/0.1 URL Source Import",
            "Accept": "text/html,text/markdown,text/plain,application/json,text/csv,*/*",
            "Host": "example.com",
        },
    )
    assert connection.closed


def test_fetch_url_source_rejects_response_over_size_limit(monkeypatch):
    class OversizedResponse:
        status = 200
        headers = {"Content-Type": "text/plain"}

        def __init__(self):
            self.read_count = 0

        def read(self, size: int) -> bytes:
            self.read_count += 1
            if self.read_count <= 161:
                return b"x" * size
            return b""

    class OversizedOpener:
        def open(self, request, timeout):  # noqa: ARG002
            return OversizedResponse()

    monkeypatch.setattr(
        "graphmind.services.url_import.socket.getaddrinfo",
        lambda *_args, **_kwargs: [(None, None, None, None, ("93.184.216.34", 443))],
    )
    monkeypatch.setattr(
        "graphmind.services.url_import._open_validated_url",
        lambda request, _diagnostics, *, timeout: OversizedOpener().open(request, timeout),
    )

    try:
        fetch_url_source("https://example.com/large.txt")
    except URLImportError as exc:
        assert "10 MB import limit" in str(exc)
    else:
        raise AssertionError("Expected URLImportError")


def test_fetch_url_source_rejects_unsupported_content_type(monkeypatch):
    read_attempts: list[int] = []

    class ImageResponse:
        status = 200
        headers = {"Content-Type": "image/png"}

        def read(self, size: int) -> bytes:  # noqa: ARG002
            read_attempts.append(size)
            return b"\x89PNG\r\n\x1a\n"

    class ImageOpener:
        def open(self, request, timeout):  # noqa: ARG002
            return ImageResponse()

    monkeypatch.setattr(
        "graphmind.services.url_import.socket.getaddrinfo",
        lambda *_args, **_kwargs: [(None, None, None, None, ("93.184.216.34", 443))],
    )
    monkeypatch.setattr(
        "graphmind.services.url_import._open_validated_url",
        lambda request, _diagnostics, *, timeout: ImageOpener().open(request, timeout),
    )

    try:
        fetch_url_source("https://example.com/logo.png")
    except URLImportError as exc:
        assert "content type is not supported" in str(exc)
        assert read_attempts == []
    else:
        raise AssertionError("Expected URLImportError")


def test_fetch_url_source_passes_timeout_to_url_opener(monkeypatch):
    captured_timeouts: list[int] = []

    class TextResponse:
        status = 200
        headers = {"Content-Type": "text/plain"}

        def __init__(self):
            self._chunks = [b"GraphMind public notes", b""]

        def read(self, size: int) -> bytes:  # noqa: ARG002
            return self._chunks.pop(0)

    class TimeoutCapturingOpener:
        def open(self, request, timeout):
            captured_timeouts.append(timeout)
            return TextResponse()

    monkeypatch.setattr(
        "graphmind.services.url_import.socket.getaddrinfo",
        lambda *_args, **_kwargs: [(None, None, None, None, ("93.184.216.34", 443))],
    )
    monkeypatch.setattr(
        "graphmind.services.url_import._open_validated_url",
        lambda request, _diagnostics, *, timeout: TimeoutCapturingOpener().open(
            request, timeout
        ),
    )

    fetched = fetch_url_source("https://example.com/notes.txt")

    assert fetched.body == b"GraphMind public notes"
    assert captured_timeouts == [URL_FETCH_TIMEOUT_SECONDS]
    assert fetched.safety_diagnostics["safety_decision"] == "accepted"
    assert fetched.safety_diagnostics["host"] == "example.com"
    assert fetched.safety_diagnostics["redirect_count"] == 0
    assert fetched.safety_diagnostics["allowed_ports"] == [80, 443, 8080, 8443]


def test_fetch_url_source_converts_html_to_text_and_title(monkeypatch):
    class HTMLResponse:
        status = 200
        headers = {"Content-Type": "text/html; charset=utf-8"}

        def __init__(self):
            self._chunks = [
                (
                    b"<html><head><title>GraphMind Docs</title><style>.x{}</style></head>"
                    b"<body><h1>Overview</h1><script>alert(1)</script>"
                    b"<p>GraphMind &amp; evidence.</p></body></html>"
                ),
                b"",
            ]

        def read(self, size: int) -> bytes:  # noqa: ARG002
            return self._chunks.pop(0)

    class HTMLOpener:
        def open(self, request, timeout):  # noqa: ARG002
            return HTMLResponse()

    monkeypatch.setattr(
        "graphmind.services.url_import.socket.getaddrinfo",
        lambda *_args, **_kwargs: [(None, None, None, None, ("93.184.216.34", 443))],
    )
    monkeypatch.setattr(
        "graphmind.services.url_import._open_validated_url",
        lambda request, _diagnostics, *, timeout: HTMLOpener().open(request, timeout),
    )

    fetched = fetch_url_source("https://example.com/docs")

    assert fetched.title == "GraphMind Docs"
    assert fetched.extension == ".txt"
    assert fetched.body.decode("utf-8") == "GraphMind Docs\nOverview\nGraphMind & evidence."
    assert "alert" not in fetched.body.decode("utf-8")


def test_html_to_text_strips_scripts_styles_and_svg():
    assert html_to_text(
        "<style>x</style><p>Hello&nbsp;world</p><svg>hidden</svg><p>Next</p>"
    ) == "Hello world\nNext"


def test_html_to_text_prefers_main_article_content_and_ignores_chrome():
    assert html_to_text(
        """
        <html>
          <body>
            <nav>Docs Home Pricing Login</nav>
            <main>
              <article>
                <h1>Architecture Runbook</h1>
                <p>GraphMind links services to owners.</p>
                <ul>
                  <li>Import public docs</li>
                  <li>Review extracted relationships</li>
                </ul>
                <aside aria-hidden="true">Share this page</aside>
              </article>
            </main>
            <footer>Copyright and cookie settings</footer>
          </body>
        </html>
        """
    ) == (
        "Architecture Runbook\n"
        "GraphMind links services to owners.\n"
        "Import public docs\n"
        "Review extracted relationships"
    )
