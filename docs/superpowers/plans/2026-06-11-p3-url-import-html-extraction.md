# P3 URL Import HTML Extraction

Date: 2026-06-11

## Goal

Close the remaining local/private URL import governance documentation gap and
improve static HTML extraction quality without adding a new dependency.

## Scope

- Confirm existing URL import governance:
  - host allowlist
  - host denylist
  - process-local quota
  - production readiness checks
  - URL safety diagnostics
- Replace regex-only HTML text extraction with a standard-library parser.
- Ignore page chrome and unsafe/non-content tags:
  - `script`
  - `style`
  - `noscript`
  - `svg`
  - `template`
  - top-level `nav`, `header`, `footer`
  - hidden / `aria-hidden="true"` content
- Preserve main/article headings, paragraphs, and list items.

Out of scope:

- Third-party readability libraries.
- Shared/distributed rate limiting.
- Per-project hosted URL quotas.
- Authenticated connectors, recursive crawlers, browser-rendered pages, and
  custom request headers.

## TDD Evidence

Red test added first:

- `backend/tests/test_url_import_phase_60.py`
  - `test_html_to_text_prefers_main_article_content_and_ignores_chrome`

Initial targeted run failed because the previous regex extractor retained
navigation, hidden aside, and footer text.

## Implementation

- `backend/graphmind/services/url_import.py`
  - Added `StaticHTMLTextExtractor` based on `html.parser.HTMLParser`.
  - Kept `html_to_text()` as the public helper.
  - Preserved existing title extraction and URL safety behavior.
- Documentation updated:
  - `docs/productization-implementation-tracker.md`
  - `docs/productization-p3-implementation-tracker.md`
  - `docs/productization-roadmap.md`
  - `docs/productization-acceptance-plan.md`

## Verification

Fresh command evidence:

```bash
cd backend && . .venv/bin/activate && pytest tests/test_url_import_phase_60.py -q
# 16 passed

cd backend && . .venv/bin/activate && ruff check graphmind/services/url_import.py tests/test_url_import_phase_60.py
# All checks passed
```

## Remaining Follow-Ups

- Add shared rate limiting and per-project quotas only if GraphMind becomes
  shared/hosted across multiple API instances.
- Consider a third-party readability extractor only if real-world static pages
  exceed the quality of the dependency-free parser.
