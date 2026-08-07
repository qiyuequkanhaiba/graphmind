from __future__ import annotations

import hashlib
import html
import http.client
import ipaddress
import os
import re
import socket
from dataclasses import dataclass, field
from datetime import UTC, datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse, urlunparse
from urllib.request import Request

MAX_URL_RESPONSE_BYTES = 10 * 1024 * 1024
MAX_URL_REDIRECTS = 3
URL_FETCH_TIMEOUT_SECONDS = 10
URL_ALLOWED_PORTS = [80, 443, 8080, 8443]
ALLOWED_URL_CONTENT_TYPES = {
    "application/csv",
    "application/json",
    "application/schema+json",
    "application/xhtml+xml",
    "text/csv",
    "text/html",
    "text/markdown",
    "text/plain",
    "text/x-markdown",
}
_URL_IMPORTS_USED = 0


@dataclass(frozen=True)
class FetchedURLSource:
    requested_url: str
    final_url: str
    title: str
    content_type: str
    status_code: int
    body: bytes
    extension: str
    fetched_at: str
    safety_diagnostics: dict[str, object] = field(default_factory=dict)

    @property
    def byte_count(self) -> int:
        return len(self.body)

    @property
    def content_hash(self) -> str:
        return hashlib.sha256(self.body).hexdigest()


class URLImportError(ValueError):
    def __init__(self, message: str, diagnostics: dict[str, object] | None = None) -> None:
        super().__init__(message)
        self.diagnostics = diagnostics or {}


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host: str, pinned_ip: str, port: int, timeout: int) -> None:
        super().__init__(host, port=port, timeout=timeout)
        self._pinned_ip = pinned_ip

    def connect(self) -> None:
        self.sock = self._create_connection(
            (self._pinned_ip, self.port),
            self.timeout,
            self.source_address,
        )
        self.sock = self._context.wrap_socket(self.sock, server_hostname=self.host)


class _PinnedURLResponse:
    def __init__(self, response, connection, peer_ip: str) -> None:
        self._response = response
        self._connection = connection
        self.peer_ip = peer_ip
        self.status = response.status
        self.headers = response.headers

    def read(self, size: int) -> bytes:
        return self._response.read(size)

    def close(self) -> None:
        try:
            self._response.close()
        finally:
            self._connection.close()


def reset_url_import_quota() -> None:
    global _URL_IMPORTS_USED
    _URL_IMPORTS_USED = 0


def fetch_url_source(url: str) -> FetchedURLSource:
    requested_url = _normalize_url(url)
    current_url = requested_url
    quota_diagnostics: dict[str, object] | None = None
    safety_diagnostics: dict[str, object] = {}

    for redirect_count in range(MAX_URL_REDIRECTS + 1):
        safety_diagnostics = _validate_url(current_url)
        if quota_diagnostics is None:
            quota_diagnostics = _reserve_url_import_quota(current_url, safety_diagnostics)
        safety_diagnostics = {
            **safety_diagnostics,
            **quota_diagnostics,
            "redirect_count": redirect_count,
        }
        request = Request(
            current_url,
            headers={
                "User-Agent": "GraphMind/0.1 URL Source Import",
                "Accept": "text/html,text/markdown,text/plain,application/json,text/csv,*/*",
            },
            method="GET",
        )
        try:
            response = _open_validated_url(
                request,
                safety_diagnostics,
                timeout=URL_FETCH_TIMEOUT_SECONDS,
            )
        except HTTPError as exc:
            if exc.code in {301, 302, 303, 307, 308}:
                if redirect_count >= MAX_URL_REDIRECTS:
                    raise URLImportError(
                        "URL redirect limit exceeded",
                        {
                            **safety_diagnostics,
                            "safety_decision": "rejected",
                            "rejection_reason": "redirect_limit_exceeded",
                        },
                    ) from exc
                location = exc.headers.get("Location")
                if not location:
                    raise URLImportError(
                        "URL redirect is missing a target location",
                        {
                            **safety_diagnostics,
                            "safety_decision": "rejected",
                            "rejection_reason": "redirect_missing_location",
                        },
                    ) from exc
                current_url = _join_redirect_url(current_url, location)
                continue
            raise URLImportError(
                f"URL fetch failed with HTTP {exc.code}",
                {
                    **safety_diagnostics,
                    "safety_decision": "rejected",
                    "rejection_reason": "http_error",
                    "http_status": exc.code,
                },
            ) from exc
        except (TimeoutError, URLError, OSError) as exc:
            raise URLImportError(
                f"URL fetch failed: {exc}",
                {
                    **safety_diagnostics,
                    "safety_decision": "rejected",
                    "rejection_reason": "fetch_error",
                },
            ) from exc

        peer_ip = _response_peer_ip(response)
        expected_ips = {str(address) for address in safety_diagnostics.get("resolved_ips", [])}
        if peer_ip is None:
            _close_response(response)
            raise URLImportError(
                "URL response peer address could not be verified",
                {
                    **safety_diagnostics,
                    "safety_decision": "rejected",
                    "rejection_reason": "peer_address_unavailable",
                },
            )
        try:
            peer_address = ipaddress.ip_address(peer_ip)
        except ValueError as exc:
            _close_response(response)
            raise URLImportError(
                "URL response peer address is invalid",
                {
                    **safety_diagnostics,
                    "safety_decision": "rejected",
                    "rejection_reason": "peer_address_invalid",
                    "peer_ip": peer_ip,
                },
            ) from exc
        if _is_blocked_ip(peer_address) or str(peer_address) not in expected_ips:
            _close_response(response)
            raise URLImportError(
                "URL response peer address did not match the validated DNS result",
                {
                    **safety_diagnostics,
                    "safety_decision": "rejected",
                    "rejection_reason": "peer_address_mismatch",
                    "peer_ip": str(peer_address),
                },
            )
        safety_diagnostics["peer_ip"] = str(peer_address)
        status_code = int(getattr(response, "status", 200) or 200)
        content_type = _normalize_content_type(response.headers.get("Content-Type"))
        if content_type not in ALLOWED_URL_CONTENT_TYPES:
            _close_response(response)
            raise URLImportError(
                "URL content type is not supported",
                {
                    **safety_diagnostics,
                    "safety_decision": "rejected",
                    "rejection_reason": "unsupported_content_type",
                    "content_type": content_type,
                },
            )
        body = _read_limited_response(response)
        decoded = _decode_body(body)
        title = _title_from_response(current_url, content_type, decoded)
        extension = _extension_for_url(current_url, content_type)
        safety_diagnostics = {
            **safety_diagnostics,
            "safety_decision": "accepted",
            "final_url": current_url,
            "content_type": content_type,
            "http_status": status_code,
        }
        if extension == ".html":
            body = html_to_text(decoded).encode("utf-8")
            extension = ".txt"
        return FetchedURLSource(
            requested_url=requested_url,
            final_url=current_url,
            title=title,
            content_type=content_type or "text/plain",
            status_code=status_code,
            body=body,
            extension=extension,
            fetched_at=datetime.now(UTC).isoformat(),
            safety_diagnostics=safety_diagnostics,
        )

    raise URLImportError(
        "URL redirect limit exceeded",
        {
            **safety_diagnostics,
            "safety_decision": "rejected",
            "rejection_reason": "redirect_limit_exceeded",
        },
    )


def fetch_diagnostics(source: FetchedURLSource) -> dict[str, object]:
    return {
        "source_kind": "url",
        "requested_url": source.requested_url,
        "final_url": source.final_url,
        "content_type": source.content_type,
        "http_status": source.status_code,
        "byte_count": source.byte_count,
        "content_hash": source.content_hash,
        "fetched_at": source.fetched_at,
        "safety": source.safety_diagnostics,
    }


def html_to_text(raw_html: str) -> str:
    extractor = StaticHTMLTextExtractor()
    extractor.feed(raw_html)
    extractor.close()
    return extractor.text()


class StaticHTMLTextExtractor(HTMLParser):
    _BLOCK_TAGS = {
        "address",
        "article",
        "aside",
        "blockquote",
        "br",
        "dd",
        "div",
        "dl",
        "dt",
        "figcaption",
        "figure",
        "footer",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "header",
        "li",
        "main",
        "nav",
        "ol",
        "p",
        "pre",
        "section",
        "table",
        "td",
        "th",
        "tr",
        "ul",
    }
    _IGNORED_TAGS = {"script", "style", "noscript", "svg", "template"}
    _CHROME_TAGS = {"footer", "header", "nav"}
    _CONTENT_ROOTS = {"article", "main"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._tokens: list[str] = []
        self._ignored_depth = 0
        self._chrome_depth = 0
        self._content_root_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        normalized_tag = tag.lower()
        attr_map = {name.lower(): value for name, value in attrs}
        if (
            normalized_tag in self._IGNORED_TAGS
            or attr_map.get("aria-hidden") == "true"
            or "hidden" in attr_map
        ):
            self._ignored_depth += 1
        if normalized_tag in self._CONTENT_ROOTS:
            self._content_root_depth += 1
        if normalized_tag in self._CHROME_TAGS and self._content_root_depth == 0:
            self._chrome_depth += 1
        if normalized_tag in self._BLOCK_TAGS:
            self._append_break()

    def handle_endtag(self, tag: str) -> None:
        normalized_tag = tag.lower()
        if normalized_tag in self._BLOCK_TAGS:
            self._append_break()
        if normalized_tag in self._CHROME_TAGS and self._chrome_depth > 0:
            self._chrome_depth -= 1
        if normalized_tag in self._CONTENT_ROOTS and self._content_root_depth > 0:
            self._content_root_depth -= 1
        if normalized_tag in self._IGNORED_TAGS and self._ignored_depth > 0:
            self._ignored_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._ignored_depth > 0 or self._chrome_depth > 0:
            return
        text = re.sub(r"[ \t\r\f\v\u00a0]+", " ", html.unescape(data)).strip()
        if text:
            self._tokens.append(text)

    def text(self) -> str:
        text = "\n".join(self._tokens)
        text = re.sub(r" *\n *", "\n", text)
        return re.sub(r"\n{2,}", "\n", text).strip()

    def _append_break(self) -> None:
        if self._tokens and self._tokens[-1] != "\n":
            self._tokens.append("\n")


def _normalize_url(url: str) -> str:
    normalized_input = url.strip()
    parsed = _parse_url(normalized_input)
    if parsed.scheme not in {"http", "https"}:
        raise URLImportError(
            "Only HTTP and HTTPS URLs are supported",
            {
                "scheme": parsed.scheme,
                "safety_decision": "rejected",
                "rejection_reason": "unsupported_scheme",
            },
        )
    if not parsed.hostname:
        raise URLImportError(
            "URL must include a host",
            {"safety_decision": "rejected", "rejection_reason": "missing_host"},
        )
    return urlunparse(parsed._replace(fragment=""))


def _validate_url(url: str) -> dict[str, object]:
    parsed = _parse_url(url)
    host = (parsed.hostname or "").lower()
    allowlist = _configured_hosts("GRAPHMIND_URL_IMPORT_ALLOWLIST")
    denylist = _configured_hosts("GRAPHMIND_URL_IMPORT_DENYLIST")
    try:
        parsed_port = parsed.port
    except ValueError as exc:
        raise URLImportError(
            "URL port is invalid",
            {
                "url": url,
                "scheme": parsed.scheme,
                "host": host,
                "safety_decision": "rejected",
                "rejection_reason": "invalid_port",
            },
        ) from exc
    diagnostics: dict[str, object] = {
        "url": url,
        "scheme": parsed.scheme,
        "host": host,
        "port": parsed_port,
        "allowed_ports": URL_ALLOWED_PORTS,
        "allowlist": allowlist,
        "denylist": denylist,
    }
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise URLImportError(
            "Only HTTP and HTTPS URLs with a host are supported",
            {
                **diagnostics,
                "safety_decision": "rejected",
                "rejection_reason": "unsupported_scheme_or_missing_host",
            },
        )
    if parsed.username or parsed.password:
        raise URLImportError(
            "URL credentials are not supported",
            {
                **diagnostics,
                "safety_decision": "rejected",
                "rejection_reason": "credentials_not_supported",
            },
        )
    if allowlist and not _host_matches(host, allowlist):
        raise URLImportError(
            "URL host is not in the configured allowlist",
            {
                **diagnostics,
                "safety_decision": "rejected",
                "rejection_reason": "host_not_allowlisted",
            },
        )
    if _host_matches(host, denylist):
        raise URLImportError(
            "URL host is denied by configuration",
            {
                **diagnostics,
                "safety_decision": "rejected",
                "rejection_reason": "host_denylisted",
            },
        )
    literal_ip = _literal_ip(host)
    if literal_ip is not None:
        diagnostics["resolved_ips"] = [str(literal_ip)]
        if _is_blocked_ip(literal_ip):
            raise URLImportError(
                "URL host resolves to a blocked network address",
                {
                    **diagnostics,
                    "safety_decision": "rejected",
                    "rejection_reason": "blocked_network_address",
                    "blocked_ip": str(literal_ip),
                },
            )
    if parsed.port is not None and parsed.port not in URL_ALLOWED_PORTS:
        raise URLImportError(
            "URL port is not allowed",
            {
                **diagnostics,
                "safety_decision": "rejected",
                "rejection_reason": "port_not_allowed",
            },
        )
    resolved_ips = [literal_ip] if literal_ip is not None else _resolve_host_ips(parsed.hostname)
    diagnostics["resolved_ips"] = [str(resolved_ip) for resolved_ip in resolved_ips]
    for resolved_ip in resolved_ips:
        if _is_blocked_ip(resolved_ip):
            raise URLImportError(
                "URL host resolves to a blocked network address",
                {
                    **diagnostics,
                    "safety_decision": "rejected",
                    "rejection_reason": "blocked_network_address",
                    "blocked_ip": str(resolved_ip),
                },
            )
    return diagnostics


def _parse_url(url: str):
    try:
        return urlparse(url)
    except ValueError as exc:
        raise URLImportError(
            "URL is malformed",
            {
                "url": url,
                "safety_decision": "rejected",
                "rejection_reason": "malformed_url",
            },
        ) from exc


def _literal_ip(hostname: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(hostname)
    except ValueError:
        return None


def _reserve_url_import_quota(url: str, diagnostics: dict[str, object]) -> dict[str, object]:
    global _URL_IMPORTS_USED
    quota_limit = _configured_quota_limit()
    if quota_limit is None:
        return {"quota_limit": None, "quota_used": _URL_IMPORTS_USED}
    if _URL_IMPORTS_USED >= quota_limit:
        raise URLImportError(
            "URL import quota exceeded",
            {
                **diagnostics,
                "url": url,
                "safety_decision": "rejected",
                "rejection_reason": "quota_exceeded",
                "quota_limit": quota_limit,
                "quota_used": _URL_IMPORTS_USED,
            },
        )
    _URL_IMPORTS_USED += 1
    return {"quota_limit": quota_limit, "quota_used": _URL_IMPORTS_USED}


def _configured_quota_limit() -> int | None:
    raw_value = os.environ.get("GRAPHMIND_URL_IMPORT_MAX_PER_PROCESS", "").strip()
    if not raw_value:
        return None
    try:
        limit = int(raw_value)
    except ValueError:
        return None
    return limit if limit > 0 else None


def _configured_hosts(env_name: str) -> list[str]:
    return [
        host.strip().lower()
        for host in os.environ.get(env_name, "").split(",")
        if host.strip()
    ]


def _host_matches(host: str, patterns: list[str]) -> bool:
    for pattern in patterns:
        if pattern == host:
            return True
        if pattern.startswith("*.") and host.endswith(pattern[1:]):
            return True
        if pattern.startswith(".") and host.endswith(pattern):
            return True
    return False


def _resolve_host_ips(hostname: str) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    try:
        return [
            ipaddress.ip_address(address)
            for _family, _type, _proto, _canonname, sockaddr in socket.getaddrinfo(
                hostname,
                None,
                type=socket.SOCK_STREAM,
            )
            for address in [sockaddr[0]]
        ]
    except OSError as exc:
        raise URLImportError(f"URL host could not be resolved: {hostname}") from exc


def _response_peer_ip(response) -> str | None:
    explicit_peer = getattr(response, "peer_ip", None)
    if explicit_peer:
        return str(explicit_peer)
    for attribute_path in (
        ("fp", "raw", "_sock"),
        ("fp", "fp", "raw", "_sock"),
        ("_sock",),
    ):
        current = response
        for attribute in attribute_path:
            current = getattr(current, attribute, None)
            if current is None:
                break
        if current is None or not hasattr(current, "getpeername"):
            continue
        try:
            peer = current.getpeername()
        except OSError:
            continue
        if isinstance(peer, tuple) and peer:
            return str(peer[0])
    return None


def _open_validated_url(
    request: Request,
    safety_diagnostics: dict[str, object],
    *,
    timeout: int,
):
    parsed = urlparse(request.full_url)
    resolved_ips = safety_diagnostics.get("resolved_ips")
    if not isinstance(resolved_ips, list) or not resolved_ips:
        raise URLImportError("URL host did not resolve to a validated address")
    pinned_ip = str(resolved_ips[0])
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    if parsed.scheme == "https":
        connection: http.client.HTTPConnection = _PinnedHTTPSConnection(
            parsed.hostname or "",
            pinned_ip,
            port,
            timeout,
        )
    else:
        connection = http.client.HTTPConnection(pinned_ip, port=port, timeout=timeout)
    headers = dict(request.header_items())
    headers["Host"] = parsed.netloc
    target = urlunparse(("", "", parsed.path or "/", parsed.params, parsed.query, ""))
    try:
        connection.request(request.get_method(), target, headers=headers)
        response = connection.getresponse()
        if response.status < 200 or response.status >= 300:
            status = response.status
            response_headers = response.headers
            response.close()
            connection.close()
            raise HTTPError(request.full_url, status, "HTTP request failed", response_headers, None)
    except Exception:
        connection.close()
        raise
    return _PinnedURLResponse(response, connection, pinned_ip)


def _is_blocked_ip(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return (
        address.is_loopback
        or address.is_private
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
    )


def _read_limited_response(response) -> bytes:
    try:
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = response.read(64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_URL_RESPONSE_BYTES:
                raise URLImportError("URL response exceeds the 10 MB import limit")
            chunks.append(chunk)
        return b"".join(chunks)
    finally:
        _close_response(response)


def _close_response(response) -> None:
    close_response = getattr(response, "close", None)
    if callable(close_response):
        close_response()


def _decode_body(body: bytes) -> str:
    try:
        return body.decode("utf-8")
    except UnicodeDecodeError:
        return body.decode("latin-1", errors="ignore")


def _normalize_content_type(raw_content_type: str | None) -> str:
    return (raw_content_type or "text/plain").split(";")[0].strip().lower() or "text/plain"


def _title_from_response(url: str, content_type: str, text: str) -> str:
    if content_type == "text/html":
        match = re.search(r"(?is)<title[^>]*>(.*?)</title>", text)
        if match:
            title = re.sub(r"\s+", " ", html.unescape(match.group(1))).strip()
            if title:
                return title[:160]
    path_name = Path(urlparse(url).path).name
    return path_name or urlparse(url).hostname or "URL source"


def _extension_for_url(url: str, content_type: str) -> str:
    suffix = Path(urlparse(url).path).suffix.lower()
    if suffix in {
        ".md",
        ".markdown",
        ".txt",
        ".log",
        ".json",
        ".csv",
        ".py",
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".java",
        ".go",
        ".rs",
        ".sql",
        ".sh",
        ".yaml",
        ".yml",
        ".toml",
    }:
        return suffix
    if content_type in {"text/html", "application/xhtml+xml"}:
        return ".html"
    if content_type in {"application/json", "application/schema+json"}:
        return ".json"
    if content_type in {"text/csv", "application/csv"}:
        return ".csv"
    if content_type in {"text/markdown", "text/x-markdown"}:
        return ".md"
    return ".txt"


def _join_redirect_url(current_url: str, location: str) -> str:
    from urllib.parse import urljoin

    return _normalize_url(urljoin(current_url, location))
