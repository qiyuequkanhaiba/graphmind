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
class AIProviderResult:
    content: str | None
    answer_mode: str
    fallback_reason: str | None = None


class OpenAICompatibleChatProvider:
    # Atria 等大上下文模型生成长答案可能超过 20 秒，默认放宽到 90 秒，
    # 并允许项目设置通过 ai.chat.timeout 覆盖。
    def __init__(self, transport: Transport | None = None, timeout: int = 90) -> None:
        self.transport = transport or post_json
        self.timeout = timeout

    def generate(
        self,
        settings: dict[str, Any],
        question: str,
        rule_answer: str,
        citations: list[str],
        retrieved_evidence: list[str] | None = None,
    ) -> AIProviderResult:
        model = str(settings.get("model") or "").strip()
        base_url = str(settings.get("base_url") or "").strip()
        if not model or not base_url:
            return AIProviderResult(
                content=None,
                answer_mode="rule_fallback",
                fallback_reason="missing_model_or_base_url",
            )

        payload = build_openai_chat_payload(
            model=model,
            question=question,
            rule_answer=rule_answer,
            citations=citations,
            temperature=float(settings.get("temperature") or 0.1),
            retrieved_evidence=retrieved_evidence,
        )
        try:
            provider_url = _chat_completions_url(base_url)
            validate_runtime_provider_endpoint(provider_url)
            headers = {"Content-Type": "application/json"}
            api_key = runtime_provider_api_key(settings, "GRAPHMIND_AI_CHAT_API_KEY")
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            effective_timeout = int(settings.get("timeout") or self.timeout)
            response = self.transport(
                provider_url,
                payload,
                headers,
                effective_timeout,
            )
        except Exception:
            return AIProviderResult(
                content=None,
                answer_mode="rule_fallback",
                fallback_reason="provider_request_failed",
            )

        content = _extract_content(response)
        if not content:
            return AIProviderResult(
                content=None,
                answer_mode="rule_fallback",
                fallback_reason="empty_provider_response",
            )
        return AIProviderResult(content=content, answer_mode="model_enhanced")


def build_openai_chat_payload(
    model: str,
    question: str,
    rule_answer: str,
    citations: list[str],
    temperature: float,
    retrieved_evidence: list[str] | None = None,
) -> dict[str, Any]:
    citation_text = "；".join(citations) if citations else "无"
    evidence_text = "\n".join(f"- {item}" for item in retrieved_evidence or [])
    retrieved_evidence_section = (
        f"\n\n检索证据：\n{evidence_text}" if evidence_text else ""
    )
    return {
        "model": model,
        "temperature": temperature,
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是 GraphMind 的数据关系解释助手。只能基于可信图谱答案和证据引用回答，"
                    "不要编造未出现在证据中的字段、表或关系。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"问题：{question}\n\n"
                    f"可信图谱答案：{rule_answer}\n\n"
                    f"证据引用：{citation_text}"
                    f"{retrieved_evidence_section}"
                ),
            },
        ],
    }


def _chat_completions_url(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/chat/completions"


def _extract_content(response: dict[str, Any]) -> str | None:
    choices = response.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        return None
    message = first_choice.get("message")
    if not isinstance(message, dict):
        return None
    content = message.get("content")
    return content.strip() if isinstance(content, str) and content.strip() else None
