import pytest

from graphmind.services import http_json_transport


class _FakeResponse:
    def __init__(self, body: bytes, status: int = 200) -> None:
        self.body = body
        self.status = status

    def read(self, _limit: int) -> bytes:
        return self.body


class _FakeConnection:
    instances = []
    response = _FakeResponse(b'{"ok": true}')

    def __init__(self, host: str, port: int, timeout: int) -> None:
        self.host = host
        self.port = port
        self.timeout = timeout
        self.request_args = None
        self.closed = False
        self.instances.append(self)

    def request(self, method, target, body, headers) -> None:
        self.request_args = (method, target, body, headers)

    def getresponse(self):
        return self.response

    def close(self) -> None:
        self.closed = True


def test_post_json_pins_connection_to_validated_address_and_preserves_host(monkeypatch):
    _FakeConnection.instances.clear()
    _FakeConnection.response = _FakeResponse(b'{"ok": true}')
    monkeypatch.setattr(
        http_json_transport.socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [(2, 1, 6, "", ("93.184.216.34", 0))],
    )
    monkeypatch.setattr(http_json_transport.http.client, "HTTPConnection", _FakeConnection)

    result = http_json_transport.post_json(
        "http://api.example.com/v1/chat/completions",
        {"model": "test"},
        {"Authorization": "Bearer secret"},
        7,
    )

    connection = _FakeConnection.instances[0]
    assert result == {"ok": True}
    assert connection.host == "93.184.216.34"
    assert connection.port == 80
    assert connection.request_args[0:2] == ("POST", "/v1/chat/completions")
    assert connection.request_args[3]["Host"] == "api.example.com"
    assert connection.closed is True


def test_post_json_rejects_any_private_dns_result(monkeypatch):
    monkeypatch.setattr(
        http_json_transport.socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [
            (2, 1, 6, "", ("93.184.216.34", 0)),
            (2, 1, 6, "", ("127.0.0.1", 0)),
        ],
    )

    with pytest.raises(ValueError, match="blocked network address"):
        http_json_transport.post_json(
            "https://api.example.com/v1/chat/completions",
            {},
            {},
            5,
        )


@pytest.mark.parametrize(
    ("response", "message"),
    [
        (_FakeResponse(b"", status=302), "HTTP 302"),
        (
            _FakeResponse(b"x" * (http_json_transport.MAX_JSON_RESPONSE_BYTES + 1)),
            "size limit",
        ),
    ],
)
def test_post_json_rejects_redirects_and_oversized_responses(monkeypatch, response, message):
    _FakeConnection.instances.clear()
    _FakeConnection.response = response
    monkeypatch.setattr(
        http_json_transport.socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [(2, 1, 6, "", ("93.184.216.34", 0))],
    )
    monkeypatch.setattr(http_json_transport.http.client, "HTTPConnection", _FakeConnection)

    with pytest.raises(ValueError, match=message):
        http_json_transport.post_json("http://api.example.com/v1", {}, {}, 5)


def test_dev_private_endpoint_opt_in_allows_private_dns_result(monkeypatch):
    """开发模式 + GRAPHMIND_AI_DEV_ALLOW_PRIVATE_ENDPOINT=1 时放行内网解析结果。

    用于透明代理 / NAT / 沙箱把公网域名解析到内网地址的场景；生产环境保持严格校验。
    """
    _FakeConnection.instances.clear()
    _FakeConnection.response = _FakeResponse(b'{"ok": true}')
    monkeypatch.setattr(
        http_json_transport.socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [(2, 1, 6, "", ("198.18.0.16", 0))],
    )
    monkeypatch.setattr(http_json_transport.http.client, "HTTPConnection", _FakeConnection)
    monkeypatch.delenv("GRAPHMIND_DEPLOYMENT_MODE", raising=False)
    monkeypatch.setenv("GRAPHMIND_AI_DEV_ALLOW_PRIVATE_ENDPOINT", "1")

    result = http_json_transport.post_json(
        "http://api.example.com/v1/chat/completions",
        {"model": "test"},
        {"Authorization": "Bearer secret"},
        10,
    )

    assert result == {"ok": True}


def test_production_ignores_dev_private_endpoint_opt_in(monkeypatch):
    """生产模式即使设置开关也不放行内网地址。"""
    monkeypatch.setattr(
        http_json_transport.socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [(2, 1, 6, "", ("198.18.0.16", 0))],
    )
    monkeypatch.setenv("GRAPHMIND_DEPLOYMENT_MODE", "production")
    monkeypatch.setenv("GRAPHMIND_AI_PROVIDER_ALLOWLIST", "api.example.com")
    monkeypatch.setenv("GRAPHMIND_AI_DEV_ALLOW_PRIVATE_ENDPOINT", "1")

    with pytest.raises(ValueError, match="blocked network address"):
        http_json_transport.post_json("https://api.example.com/v1", {}, {}, 5)
