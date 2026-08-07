from graphmind.services.embedding_provider import OpenAICompatibleEmbeddingProvider


def test_embedding_provider_returns_fallback_when_required_config_is_missing():
    provider = OpenAICompatibleEmbeddingProvider(transport=lambda *_args, **_kwargs: {})

    result = provider.embed(
        settings={
            "provider": "openai-compatible",
            "model": "",
            "base_url": "https://api.example.com/v1",
            "api_key": "",
        },
        inputs=["Orders.customer_id"],
    )

    assert result.vectors == []
    assert result.fallback_reason == "missing_model_or_base_url"


def test_embedding_provider_posts_to_embeddings_endpoint_and_parses_vectors():
    calls = []

    def fake_transport(url, payload, headers, timeout):
        calls.append((url, payload, headers, timeout))
        return {
            "data": [
                {"embedding": [0.1, 0.2, 0.3]},
                {"embedding": [0.4, 0.5, 0.6]},
            ]
        }

    provider = OpenAICompatibleEmbeddingProvider(transport=fake_transport)

    result = provider.embed(
        settings={
            "provider": "openai-compatible",
            "model": "text-embedding-3-small",
            "base_url": "https://api.example.com/v1/",
            "api_key": "sk-test",
        },
        inputs=["document one", "document two"],
    )

    assert result.vectors == [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
    assert result.fallback_reason is None
    assert calls[0][0] == "https://api.example.com/v1/embeddings"
    assert calls[0][1] == {
        "model": "text-embedding-3-small",
        "input": ["document one", "document two"],
    }
    assert calls[0][2]["Authorization"] == "Bearer sk-test"
    assert calls[0][3] == 20


def test_embedding_provider_returns_fallback_for_invalid_provider_response():
    provider = OpenAICompatibleEmbeddingProvider(transport=lambda *_args, **_kwargs: {"data": []})

    result = provider.embed(
        settings={
            "provider": "openai-compatible",
            "model": "text-embedding-3-small",
            "base_url": "https://api.example.com/v1",
        },
        inputs=["document"],
    )

    assert result.vectors == []
    assert result.fallback_reason == "invalid_provider_response"


def test_embedding_provider_uses_environment_key_in_production(monkeypatch):
    calls = []

    def fake_transport(url, payload, headers, timeout):
        calls.append((url, payload, headers, timeout))
        return {"data": [{"embedding": [0.1]}]}

    monkeypatch.setenv("GRAPHMIND_DEPLOYMENT_MODE", "production")
    monkeypatch.setenv("GRAPHMIND_AI_PROVIDER_ALLOWLIST", "api.example.com")
    monkeypatch.setenv("GRAPHMIND_AI_VECTOR_API_KEY", "environment-vector-key")
    provider = OpenAICompatibleEmbeddingProvider(transport=fake_transport)

    result = provider.embed(
        {
            "model": "text-embedding-3-small",
            "base_url": "https://api.example.com/v1",
            "api_key": "database-vector-key",
        },
        ["document"],
    )

    assert result.vectors == [[0.1]]
    assert calls[0][2]["Authorization"] == "Bearer environment-vector-key"
