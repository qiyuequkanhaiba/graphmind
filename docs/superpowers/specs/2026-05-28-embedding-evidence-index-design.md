# Embedding Evidence Index Design

## Goal

Upgrade GraphMind's current lexical evidence retrieval into a lightweight persistent evidence index that can use OpenAI-compatible embedding models for semantic search while preserving deterministic fallback behavior.

## Scope

This phase keeps the implementation local-first and SQLite-backed. It does not introduce a vector database, background workers, streaming index jobs, or provider-specific SDKs. The existing `POST /api/projects/{project_id}/vector-index/build` endpoint remains the build trigger.

## Architecture

Evidence documents are still derived from graph nodes, graph edges, field profiles, and relationship suggestions. Building the index now replaces prior persisted entries for the project and stores each document in an `evidence_index_entries` table.

When vector settings contain an OpenAI-compatible provider, model, and base URL, the build step calls `/embeddings` with batches of document text. Successful responses store embedding vectors as JSON arrays with the embedding model name. If configuration is incomplete or the provider request fails, GraphMind still persists the document text and marks the index ready for lexical retrieval.

Search follows a hybrid decision path:

1. If persisted entries have vectors and the current query can be embedded, rank by cosine similarity.
2. If embeddings are unavailable, invalid, or the query embedding request fails, rank by the existing lexical scoring function.
3. If no persisted entries exist, rebuild transient documents from source tables and use lexical scoring, preserving current behavior.

## Data Model

Add `EvidenceIndexEntry` with:

- `id`
- `project_id`
- `document_id`
- `kind`
- `label`
- `content`
- `source_ref`
- `embedding`
- `embedding_model`
- `created_at`

The table uses SQLite JSON storage for embeddings. This is enough for early product validation and keeps the implementation portable.

## Provider Contract

Create an OpenAI-compatible embedding provider that posts to:

```text
{base_url.rstrip("/")}/embeddings
```

Payload:

```json
{
  "model": "embedding-model-name",
  "input": ["document text"]
}
```

Headers include `Content-Type: application/json` and `Authorization: Bearer <api_key>` when a key is configured. Responses are parsed from `data[].embedding`. Provider errors are swallowed by the retrieval service and converted into lexical fallback, so user chat never fails only because embeddings are unavailable.

## API Behavior

The existing vector build endpoint reads `Project.settings.ai.vector`, builds the persisted evidence index, and writes back:

- `index_status`: `ready` when at least one evidence document exists, otherwise `not_built`
- `document_count`
- `last_built_at`
- `embedding_model`: configured model when vectors were stored, empty string otherwise

The response remains `ProjectSettingsResponse`.

## Testing

Backend tests cover:

- index build persists entries and metadata;
- embedding provider posts to `/embeddings` and parses vectors;
- semantic search ranks by cosine similarity when vectors exist;
- failed or missing embedding configuration falls back to lexical retrieval.

No tests call a real external provider. Provider transport is injected.

## Risks

SQLite JSON vectors are not suitable for large production indexes. That is acceptable for this phase because the goal is to validate AI-assisted relationship Q&A inside a local workbench. A later phase can replace the search backend with a vector database while keeping the document-building and provider contracts.

## Self-Review

- Placeholder scan: no placeholders or deferred requirements.
- Consistency check: storage, provider, API, and search paths all use the existing project settings model.
- Scope check: one backend retrieval phase; no frontend redesign or vector database.
- Ambiguity check: provider failures explicitly fall back to lexical retrieval.
