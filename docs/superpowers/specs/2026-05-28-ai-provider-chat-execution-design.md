# AI Provider Chat Execution Design

## Goal

Connect the saved AI chat configuration to the backend chat endpoint so GraphMind can use a configured model to rewrite and explain traceable graph answers, while keeping the existing rule-based answer as the trusted fallback.

## Scope

This phase implements chat model execution only. It does not build vector embeddings, persistent vector indexes, or semantic retrieval yet. Those remain the next phase after the model call path is proven and testable.

## Recommended Approach

Use a provider layer behind `ChatService`. `ChatService` will still produce the current cited rule answer first. If the project AI settings use `rules`, it returns that rule answer unchanged. If the provider is configured for model execution, the service sends only the question, the rule answer, citations, and selected graph context to the provider. The provider returns a natural-language explanation, and GraphMind preserves the original citations and highlighted graph path.

This approach keeps answers grounded in local graph evidence and avoids sending raw uploaded spreadsheet rows to the model in this phase.

## Behavior

- `rules` provider returns the existing answer path.
- Non-rule provider with a usable `base_url` and `model` attempts an OpenAI-compatible `/chat/completions` request.
- If the model call succeeds, the response content replaces the rule answer content.
- If the model call fails, is unsupported, or is missing required config, GraphMind returns the original rule answer and annotates `query_plan` with fallback details.
- Citations and highlighted graph paths remain from the trusted rule answer.

## Provider Support

Initial execution uses an OpenAI-compatible chat-completions contract for `openai-compatible`, `deepseek`, `openrouter`, and `ollama` when their configured `base_url` exposes an OpenAI-compatible endpoint. The implementation normalizes trailing slashes and appends `/chat/completions`.

## Data Flow

1. Frontend saves project AI settings through the existing settings API.
2. User asks a question through `/api/projects/{project_id}/chat`.
3. `ChatService` builds a cited rule answer from graph data.
4. `ChatService` loads project settings.
5. The provider layer attempts model execution when configured.
6. The API returns either model-enhanced content or rule fallback content with the same citations.

## Error Handling

Model errors are never exposed as raw stack traces. The returned `query_plan` records `answer_mode`, `ai_provider`, and a short fallback reason. The user still receives a useful graph-grounded answer.

## Testing

Backend tests cover:

- default `rules` mode still returns the existing rule answer;
- configured provider receives the graph-grounded context and can replace answer content;
- provider failure falls back to the rule answer;
- OpenAI-compatible client builds the expected request payload without real network calls.

## Self-Review

- Placeholder scan: no TBD/TODO placeholders remain.
- Scope check: this is a single implementation phase focused on chat execution, not full RAG.
- Ambiguity check: vector indexing is explicitly out of scope for this phase.
