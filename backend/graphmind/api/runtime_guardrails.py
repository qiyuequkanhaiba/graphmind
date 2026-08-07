import time
import uuid
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable
from ipaddress import ip_address, ip_network
from re import fullmatch

from fastapi import Request, Response
from fastapi.responses import JSONResponse

REQUEST_ID_PATTERN = r"[A-Za-z0-9._:-]{1,80}"
RATE_LIMIT_EXEMPT_PATHS = {"/api/health", "/api/ready"}

CallNext = Callable[[Request], Awaitable[Response]]


class InMemoryRateLimiter:
    def __init__(self, requests_per_minute: int | None) -> None:
        self.requests_per_minute = requests_per_minute
        self._requests: dict[str, deque[float]] = defaultdict(deque)

    def check(self, client_key: str, now: float | None = None) -> tuple[bool, int]:
        if self.requests_per_minute is None:
            return True, -1
        current_time = now if now is not None else time.monotonic()
        window_start = current_time - 60
        requests = self._requests[client_key]
        while requests and requests[0] <= window_start:
            requests.popleft()
        remaining = self.requests_per_minute - len(requests)
        if remaining <= 0:
            return False, 0
        requests.append(current_time)
        return True, remaining - 1


def request_id_from_headers(request: Request) -> str:
    candidate = request.headers.get("x-request-id", "").strip()
    if fullmatch(REQUEST_ID_PATTERN, candidate):
        return candidate
    return uuid.uuid4().hex


def client_key_from_request(request: Request, trusted_proxy_cidrs: list[str]) -> str:
    if request.client is None:
        return "unknown"
    peer = request.client.host
    if not _is_trusted_proxy(peer, trusted_proxy_cidrs):
        return peer
    forwarded = [value.strip() for value in request.headers.get("x-forwarded-for", "").split(",")]
    forwarded_ips = [value for value in forwarded if _is_ip_address(value)]
    for candidate in reversed(forwarded_ips):
        if not _is_trusted_proxy(candidate, trusted_proxy_cidrs):
            return candidate
    return forwarded_ips[0] if forwarded_ips else peer


def _is_ip_address(value: str) -> bool:
    try:
        ip_address(value)
    except ValueError:
        return False
    return True


def _is_trusted_proxy(value: str, trusted_proxy_cidrs: list[str]) -> bool:
    try:
        address = ip_address(value)
    except ValueError:
        return False
    return any(address in ip_network(cidr, strict=False) for cidr in trusted_proxy_cidrs)


def rate_limit_response(request_id: str, limit: int) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "detail": {
                "code": "RATE_LIMIT_EXCEEDED",
                "message": "Too many API requests",
                "user_action": "Wait briefly before retrying this operation.",
                "retryable": True,
                "field_errors": {},
            }
        },
        headers={
            "Retry-After": "60",
            "X-RateLimit-Limit": str(limit),
            "X-RateLimit-Remaining": "0",
            "X-Request-ID": request_id,
        },
    )


def apply_rate_limit_headers(response: Response, limit: int | None, remaining: int) -> None:
    if limit is None:
        return
    response.headers.setdefault("X-RateLimit-Limit", str(limit))
    response.headers.setdefault("X-RateLimit-Remaining", str(max(remaining, 0)))
