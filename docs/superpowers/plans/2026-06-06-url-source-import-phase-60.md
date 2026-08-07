# Phase 60: URL Source Import

## Goal

Extend GraphMind from file-only ingestion to evidence-preserving URL source ingestion.
The product should treat a URL as a first-class source, then reuse the existing
source, chunk, extraction, graph, diagnostics, and evidence navigation workflow.

## Product Scope

Phase 60 implements single URL import, not open-ended crawling.

- Add a URL import entry point in the import experience.
- Fetch one HTTP(S) resource with strict safety controls.
- Support HTML, Markdown/text, JSON, CSV-like text, logs, and code-like text when
  the response content type or URL extension can be mapped to an existing parser.
- Persist a URL as `DocumentSource` with stable source refs and metadata.
- Preserve fetch diagnostics: URL, final URL, content type, HTTP status, byte
  count, content hash, fetched time, title, parser, and safety decisions.
- Reuse current graph generation, source inspector, chunk highlight, and evidence
  ref navigation.

## Non-Goals

- Recursive crawling.
- Authenticated connectors.
- Browser-rendered dynamic pages.
- User-controlled request headers or cookies.
- External graph database migration.

## Technical Approach

1. Add a backend URL fetcher with SSRF guardrails.
2. Convert fetched content into a temporary local source artifact.
3. Parse it through the existing document import pipeline.
4. Store URL-specific metadata on `DocumentSource` and `ImportItem.summary`.
5. Add a frontend URL import control that displays as a normal import task.
6. Add tests for API behavior, safety rejection, source/chunk persistence, and
   frontend client/control wiring.

## Safety Requirements

- Only `http` and `https` schemes are allowed.
- URLs must include a host.
- Localhost, loopback, private, link-local, multicast, and unspecified IPs are blocked.
- DNS resolution is checked before fetch.
- Redirects are handled manually and every redirected URL is revalidated.
- Maximum redirects: 3.
- Maximum response size: 10 MB.
- Request timeout: 10 seconds.
- No cookies or caller-supplied headers.

## Frontline Tech Review

- Use a lightweight built-in HTML extractor for Phase 60 so the feature remains
  dependency-light and deterministic.
- Keep room for Trafilatura as the next server-side extraction upgrade for richer
  static web pages.
- Keep room for Crawl4AI as a later connector for AI-ready Markdown and dynamic
  documentation sites.
- Adopt GraphRAG-inspired diagnostics and global summaries later, but do not
  replace GraphMind's editable, evidence-first graph model.
- Use schema-constrained extraction ideas later for URL relationships, especially
  for OpenAPI and documentation sites.

## Acceptance Criteria

- Importing a plain text or Markdown URL creates a source, chunks, entities, and
  graph nodes.
- Importing an HTML URL extracts a readable title/body and stores fetch metadata.
- Unsafe URLs are rejected before any request is made.
- Import diagnostics show URL-specific fetch and extraction metrics.
- Evidence refs from URL chunks can be displayed and navigated like file chunks.
- Backend tests and targeted frontend tests pass.
