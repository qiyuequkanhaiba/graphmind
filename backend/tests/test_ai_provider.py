from graphmind.services.ai_provider import (
    OpenAICompatibleChatProvider,
    build_openai_chat_payload,
)


def test_build_openai_chat_payload_wraps_trusted_graph_answer():
    payload = build_openai_chat_payload(
        model="gpt-4.1-mini",
        question="哪些字段可能有关联？",
        rule_answer="Orders.customer_id -> Customers.id 可能有关联。",
        citations=["Orders.customer_id -> Customers.id"],
        temperature=0.2,
    )

    assert payload["model"] == "gpt-4.1-mini"
    assert payload["temperature"] == 0.2
    assert payload["messages"][0]["role"] == "system"
    assert "不要编造" in payload["messages"][0]["content"]
    assert payload["messages"][1] == {
        "role": "user",
        "content": (
            "问题：哪些字段可能有关联？\n\n"
            "可信图谱答案：Orders.customer_id -> Customers.id 可能有关联。\n\n"
            "证据引用：Orders.customer_id -> Customers.id"
        ),
    }


def test_build_openai_chat_payload_includes_retrieved_evidence():
    payload = build_openai_chat_payload(
        model="gpt-4.1-mini",
        question="解释订单和客户的关系",
        rule_answer="Orders.customer_id -> Customers.id 可能有关联。",
        citations=["Orders.customer_id -> Customers.id"],
        temperature=0.1,
        retrieved_evidence=[
            "Orders.customer_id -> Customers.id is a foreign_key relationship.",
            "Orders.customer_id is an identifier field.",
        ],
    )

    user_prompt = payload["messages"][1]["content"]
    assert "检索证据：" in user_prompt
    assert "foreign_key relationship" in user_prompt
    assert "identifier field" in user_prompt


def test_provider_returns_fallback_when_required_config_is_missing():
    provider = OpenAICompatibleChatProvider(transport=lambda *_args, **_kwargs: {})

    result = provider.generate(
        settings={
            "provider": "openai-compatible",
            "model": "",
            "base_url": "https://api.example.com/v1",
            "api_key": "",
            "temperature": 0.1,
        },
        question="What fields are related?",
        rule_answer="Orders contains customer_id.",
        citations=[],
    )

    assert result.content is None
    assert result.answer_mode == "rule_fallback"
    assert result.fallback_reason == "missing_model_or_base_url"


def test_provider_posts_to_chat_completions_endpoint_and_returns_content():
    calls = []

    def fake_transport(url, payload, headers, timeout):
        calls.append((url, payload, headers, timeout))
        return {"choices": [{"message": {"content": "模型增强回答"}}]}

    provider = OpenAICompatibleChatProvider(transport=fake_transport)

    result = provider.generate(
        settings={
            "provider": "openai-compatible",
            "model": "gpt-4.1-mini",
            "base_url": "https://api.example.com/v1/",
            "api_key": "sk-test",
            "temperature": 0.3,
        },
        question="哪些字段可能有关联？",
        rule_answer="Orders.customer_id -> Customers.id 可能有关联。",
        citations=["Orders.customer_id -> Customers.id"],
    )

    assert result.content == "模型增强回答"
    assert result.answer_mode == "model_enhanced"
    assert result.fallback_reason is None
    assert calls[0][0] == "https://api.example.com/v1/chat/completions"
    assert calls[0][1]["model"] == "gpt-4.1-mini"
    assert calls[0][2]["Authorization"] == "Bearer sk-test"
    assert calls[0][3] == 20


def test_provider_uses_environment_key_and_stops_after_allowlist_revocation(monkeypatch):
    calls = []

    def fake_transport(url, payload, headers, timeout):
        calls.append((url, payload, headers, timeout))
        return {"choices": [{"message": {"content": "enhanced"}}]}

    monkeypatch.setenv("GRAPHMIND_DEPLOYMENT_MODE", "production")
    monkeypatch.setenv("GRAPHMIND_AI_PROVIDER_ALLOWLIST", "api.example.com")
    monkeypatch.setenv("GRAPHMIND_AI_CHAT_API_KEY", "environment-chat-key")
    provider = OpenAICompatibleChatProvider(transport=fake_transport)
    settings = {
        "model": "gpt-4.1-mini",
        "base_url": "https://api.example.com/v1",
        "api_key": "database-chat-key",
    }

    first_result = provider.generate(settings, "Question", "Answer", [])
    monkeypatch.setenv("GRAPHMIND_AI_PROVIDER_ALLOWLIST", "revoked.example.com")
    revoked_result = provider.generate(settings, "Question", "Answer", [])

    assert first_result.content == "enhanced"
    assert calls[0][2]["Authorization"] == "Bearer environment-chat-key"
    assert revoked_result.fallback_reason == "provider_request_failed"
    assert len(calls) == 1
