from __future__ import annotations

import http.client
import ipaddress
import json
import socket
from typing import Any
from urllib.parse import urlparse, urlunsplit

from graphmind.services.provider_policy import validate_runtime_provider_endpoint

MAX_JSON_RESPONSE_BYTES = 2 * 1024 * 1024


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


def post_json(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str],
    timeout: int,
) -> dict[str, Any]:
    validate_runtime_provider_endpoint(url)
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Provider URL must be an absolute HTTP(S) URL")
    if parsed.username or parsed.password or parsed.fragment:
        raise ValueError("Provider URL contains unsupported URL components")

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    addresses = _public_addresses(parsed.hostname, port)
    pinned_ip = str(addresses[0])
    if parsed.scheme == "https":
        connection: http.client.HTTPConnection = _PinnedHTTPSConnection(
            parsed.hostname,
            pinned_ip,
            port,
            timeout,
        )
    else:
        connection = http.client.HTTPConnection(pinned_ip, port=port, timeout=timeout)

    request_headers = dict(headers)
    request_headers["Host"] = parsed.netloc
    body = json.dumps(payload).encode("utf-8")
    target = urlunsplit(("", "", parsed.path or "/", parsed.query, ""))
    try:
        connection.request("POST", target, body=body, headers=request_headers)
        response = connection.getresponse()
        if response.status < 200 or response.status >= 300:
            raise ValueError(f"Provider returned HTTP {response.status}")
        response_body = response.read(MAX_JSON_RESPONSE_BYTES + 1)
        if len(response_body) > MAX_JSON_RESPONSE_BYTES:
            raise ValueError("Provider response exceeded the configured size limit")
        decoded = json.loads(response_body.decode("utf-8"))
        if not isinstance(decoded, dict):
            raise ValueError("Provider response must be a JSON object")
        return decoded
    finally:
        connection.close()


def _public_addresses(
    hostname: str,
    port: int,
) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    addresses = list(
        dict.fromkeys(
            ipaddress.ip_address(sockaddr[0])
            for _family, _type, _proto, _canonname, sockaddr in socket.getaddrinfo(
                hostname,
                port,
                type=socket.SOCK_STREAM,
            )
        )
    )
    if not addresses:
        raise ValueError("Provider host did not resolve to an address")
    if any(_is_blocked_address(address) for address in addresses):
        raise ValueError("Provider host resolves to a blocked network address")
    return addresses


def _is_blocked_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return (
        address.is_loopback
        or address.is_private
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
    )
