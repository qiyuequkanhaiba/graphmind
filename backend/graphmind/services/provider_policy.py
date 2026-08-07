from __future__ import annotations

import os
from collections.abc import Mapping
from urllib.parse import urlparse


def is_runtime_production(environ: Mapping[str, str] | None = None) -> bool:
    env = environ if environ is not None else os.environ
    return env.get("GRAPHMIND_DEPLOYMENT_MODE", "development").strip().lower() == "production"


def runtime_provider_allowlist(
    environ: Mapping[str, str] | None = None,
) -> list[str]:
    env = environ if environ is not None else os.environ
    return [
        value.strip()
        for value in env.get("GRAPHMIND_AI_PROVIDER_ALLOWLIST", "").split(",")
        if value.strip()
    ]


def validate_runtime_provider_endpoint(
    url: str,
    environ: Mapping[str, str] | None = None,
) -> None:
    validate_provider_endpoint(
        url,
        production=is_runtime_production(environ),
        allowlist=runtime_provider_allowlist(environ),
    )


def validate_provider_endpoint(
    url: str,
    *,
    production: bool,
    allowlist: list[str],
) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("AI provider endpoint must be an absolute HTTP(S) URL")
    if parsed.username or parsed.password or parsed.fragment:
        raise ValueError("AI provider endpoint contains unsupported URL components")
    if not production:
        return
    if parsed.scheme != "https":
        raise ValueError("Production AI provider endpoints must use HTTPS")
    if not _host_matches_allowlist(parsed.hostname, allowlist):
        raise ValueError("AI provider host is not in GRAPHMIND_AI_PROVIDER_ALLOWLIST")


def runtime_provider_api_key(
    settings: Mapping[str, object],
    env_name: str,
    environ: Mapping[str, str] | None = None,
) -> str:
    env = environ if environ is not None else os.environ
    if is_runtime_production(env):
        return env.get(env_name, "").strip()
    return str(settings.get("api_key") or "").strip()


def _host_matches_allowlist(host: str, allowlist: list[str]) -> bool:
    normalized_host = host.lower().rstrip(".")
    for entry in allowlist:
        pattern = entry.lower().rstrip(".")
        if pattern.startswith("*."):
            suffix = pattern[1:]
            if normalized_host.endswith(suffix) and normalized_host != suffix[1:]:
                return True
        elif normalized_host == pattern:
            return True
    return False
