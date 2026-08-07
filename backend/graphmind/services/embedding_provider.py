from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from graphmind.services.http_json_transport import post_json
from graphmind.services.provider_policy import (
    runtime_provider_api_key,
    validate_runtime_provider_endpoint,
)

Transport = Callable[[str, dict[str, Any], dict[str, str], int], dict[str, Any]]


@dataclass(frozen=True)
class EmbeddingProviderResult:
    vectors: list[list[float]]
    fallback_reason: str | None = None


class OpenAICompatibleEmbeddingProvider:
    def __init__(self, transport: Transport | None = None, timeout: int = 20) -> None:
        self.transport = transport or post_json
        self.timeout = timeout

    def embed(self, settings: dict[str, Any], inputs: list[str]) -> EmbeddingProviderResult:
        model = str(settings.get("model") or "").strip()
        base_url = str(settings.get("base_url") or "").strip()
        if not model or not base_url:
            return EmbeddingProviderResult(
                vectors=[],
                fallback_reason="missing_model_or_base_url",
            )
        if not inputs:
            return EmbeddingProviderResult(vectors=[])

        try:
            provider_url = _embeddings_url(base_url)
            validate_runtime_provider_endpoint(provider_url)
            headers = {"Content-Type": "application/json"}
            api_key = runtime_provider_api_key(settings, "GRAPHMIND_AI_VECTOR_API_KEY")
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            response = self.transport(
                provider_url,
                {"model": model, "input": inputs},
                headers,
                self.timeout,
            )
        except Exception:
            return EmbeddingProviderResult(
                vectors=[],
                fallback_reason="provider_request_failed",
            )

        vectors = _extract_vectors(response)
        if len(vectors) != len(inputs):
            return EmbeddingProviderResult(
                vectors=[],
                fallback_reason="invalid_provider_response",
            )
        return EmbeddingProviderResult(vectors=vectors)


def _embeddings_url(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/embeddings"


def _extract_vectors(response: dict[str, Any]) -> list[list[float]]:
    data = response.get("data")
    if not isinstance(data, list):
        return []

    vectors = []
    for item in data:
        if not isinstance(item, dict):
            return []
        embedding = item.get("embedding")
        if not isinstance(embedding, list):
            return []
        vector = []
        for value in embedding:
            if isinstance(value, bool) or not isinstance(value, int | float):
                return []
            vector.append(float(value))
        if not vector:
            return []
        vectors.append(vector)
    return vectors
