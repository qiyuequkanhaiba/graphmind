# Universal Multisource Knowledge Graph Import Design

## Summary

GraphMind should evolve from a spreadsheet relationship workbench into a local-first multisource knowledge graph importer. The next architecture supports many CSV/XLSX files plus JSON, PDF, Word, Markdown, code repositories, and logs. It uses two coordinated pipelines:

1. A deterministic structured-data pipeline for CSV, XLSX, and table-shaped JSON.
2. A document/code/log pipeline for semi-structured and unstructured sources.

Both pipelines feed a shared entity resolution and graph merge layer. The first implementation should use medium-scale data models and resumable stage metadata, while keeping the runtime simple with FastAPI background tasks, SQLite, DuckDB, and filesystem artifact caches.

## Goals

- Import multiple files in one batch and preserve per-file status.
- Reuse the existing CSV/XLSX profiling, relationship inference, graph, review, and evidence systems.
- Add JSON, PDF, Word, Markdown, code repository, and log ingestion.
- Generate a unified project knowledge graph with typed source, entity, document, table, field, code, and log nodes.
- Keep relationship evidence inspectable, source-linked, and suitable for human review.
- Default to local deterministic rules, with optional LLM and embedding enhancement only when the user configures providers.
- Design the data model for hundreds to thousands of files, while keeping the first runtime implementation lightweight.

## Non-Goals

- Replacing SQLite/DuckDB with a graph database in the first version.
- Adding Celery, RQ, distributed workers, or hosted infrastructure in the first version.
- Building a full ontology editor.
- Automatically trusting all AI-extracted relationships.
- Sending entire projects or raw file batches to an external model by default.
- Building complete language-specific AST analyzers for every programming language in the first phase.

## Architecture

Add a `UniversalImportService` as a batch orchestration layer. It should not replace the current `ImportService`; instead, it should call or adapt it for structured sources and coordinate additional parsers for other file kinds.

The high-level flow is:

```text
ImportBatch
  -> ImportItem[]
  -> file type dispatch
  -> StructuredArtifact or DocumentArtifact
  -> relationship extraction
  -> entity resolution
  -> graph merge
  -> evidence indexing
```

### Structured Pipeline

The structured pipeline handles CSV, XLSX, and table-shaped JSON. It produces `StructuredArtifact` objects containing:

- tables
- fields
- normalized headers
- DuckDB table references
- field profiles
- key candidates
- sample values
- candidate foreign keys and derived dimensions

This path should reuse existing modules where possible:

- `ImportService`
- `profile_dataframe`
- `infer_relationships`
- `build_graph`
- `RelationshipSuggestion`

The main change is expanding relationship inference from one imported dataset to all structured profiles in the current batch or project, so relationships can be discovered across separate files.

### Document Pipeline

The document pipeline handles PDF, Word, Markdown, nested JSON, code repositories, and logs. It produces `DocumentArtifact` objects containing:

- document sources
- sections
- chunks
- extracted entities
- extracted relationships
- evidence references

Rule-based extraction should run by default. Optional LLM extraction may be added later at chunk level only, using structured JSON schemas and source references.

### Shared Merge Layer

Both pipelines feed the same merge layer:

```text
ExtractedRelationship
  -> resolve or create source entity
  -> resolve or create target entity
  -> dedupe equivalent relationships
  -> create GraphNode and GraphEdge when trusted
  -> create RelationshipSuggestion when review is needed
  -> add evidence documents for retrieval and chat grounding
```

The graph remains stored in normal SQLite node and edge tables for this phase. A graph database can be considered later if traversal and graph analytics workloads outgrow the relational model.

## Data Model

Keep the current tables:

- `datasets`
- `sheets`
- `field_profiles`
- `relationship_suggestions`
- `graph_nodes`
- `graph_edges`
- `evidence_index_entries`

Add the following tables.

### ImportBatch

Represents one user-initiated multisource import.

Fields:

- `id`
- `project_id`
- `label`
- `status`: `queued | running | succeeded | failed | canceled`
- `progress`
- `summary`
- `created_at`
- `updated_at`

### ImportItem

Represents one file or repository entry inside a batch.

Fields:

- `id`
- `batch_id`
- `project_id`
- `filename`
- `file_type`
- `source_kind`: `table | document | code | log | json`
- `status`
- `raw_data_ref`
- `artifact_ref`
- `error_message`
- `summary`

### DocumentSource

Represents a parsed non-table source.

Fields:

- `id`
- `project_id`
- `import_item_id`
- `title`
- `document_type`: `pdf | word | markdown | code | log | json_document`
- `source_ref`
- `metadata`

### DocumentChunk

Represents a retrievable and citable section of source text.

Fields:

- `id`
- `project_id`
- `document_id`
- `chunk_index`
- `heading`
- `content`
- `token_count`
- `source_ref`
- `content_hash`
- `metadata`

### ExtractedEntity

Represents a canonical entity or concept inferred from any source.

Fields:

- `id`
- `project_id`
- `canonical_name`
- `entity_type`: `person | org | product | metric | file | function | module | endpoint | error | concept | unknown`
- `aliases`
- `confidence`
- `source_refs`
- `metadata`

### ExtractedRelationship

Represents a relationship before or during graph merge.

Fields:

- `id`
- `project_id`
- `source_entity_id`
- `target_entity_id`
- `relationship_type`
- `confidence`
- `status`: `suggested | auto_trusted | accepted | rejected`
- `evidence_summary`
- `evidence_payload`
- `source_refs`

## Import State Machine

Each `ImportItem.summary` should track stage-level progress. The first implementation can persist this as JSON metadata rather than a separate stage table.

Stages:

1. `staged`: raw file saved locally.
2. `parsed`: file converted into a structured or document artifact.
3. `profiled`: table profiles or document chunks created.
4. `extracted`: rule-based entities and relationships extracted.
5. `resolved`: entity resolution and alias matching completed.
6. `graphed`: graph nodes and edges written.
7. `indexed`: evidence index entries written.

Intermediate artifacts should be cached as JSON under:

```text
.graphmind/artifacts/project_{project_id}/batch_{batch_id}/item_{item_id}/
```

The database should store artifact references, not every large intermediate payload. This keeps debugging simple and makes it possible to rerun later stages without reparsing unchanged files.

## File Type Handling

### CSV and XLSX

CSV and XLSX should continue to use the existing structured import path:

- read sheets or files with pandas
- normalize headers
- persist data to DuckDB
- create `Dataset`, `Sheet`, and `FieldProfile`
- infer foreign keys and derived dimensions
- create graph nodes and candidate relationships

The relationship inference scope should expand to all structured profiles selected for the batch or project.

### JSON

JSON should choose a path based on shape:

- Top-level array of objects: flatten into a table and use the structured path.
- Nested object: create document-like sections from paths and scalar values.

Relationships:

- JSON object hierarchy creates `contains`.
- Repeated id-like values create `references`.
- Values overlapping table fields create `matches_entity` or `foreign_key` suggestions.

### PDF and Word

PDF and Word sources should be parsed locally into text, headings when available, and chunks.

Default rule extraction:

- headings, list labels, and table captions become `concept` candidates
- URLs, emails, file paths, versions, error codes, and API paths become typed entities
- explicit reference words and dependency phrases create `references` or `depends_on` candidates

Optional LLM enhancement should only process chunks and must return structured JSON with source references.

### Markdown

Markdown should be parsed by heading:

- headings become sections
- links become `references`
- fenced code blocks retain language metadata
- tables can be profiled lightly or converted to structured artifacts when table-shaped
- frontmatter is saved in metadata

Markdown references to files, API paths, code symbols, and URLs should become entities or relationship candidates.

### Code Repositories

The first version should use lightweight repository parsing rather than full AST analysis.

Rules:

- directories and files become document/source nodes
- exported functions/classes and recognizable declarations become `code_symbol` entities
- import/include/from statements create `depends_on`
- README, documentation, and config references to paths or symbols create `mentions`

The importer must ignore common generated or irrelevant directories:

- `.git`
- `node_modules`
- `dist`
- `build`
- `__pycache__`
- virtualenv directories
- large binary files

Later phases can add language-specific AST parsers for Python, TypeScript, and JavaScript.

### Logs

Logs should be split into events by line or multi-line continuation rules.

Extract:

- timestamp
- level
- service
- trace id
- request id
- endpoint
- file path
- error code
- error message

Relationships:

- events with the same trace or request id create `co_occurs_with`
- errors mentioning endpoints, files, or functions create `mentions`
- raw log event chunks remain evidence rather than visible graph nodes by default

## Ontology

The first graph ontology should stay generic and source-oriented.

Node types:

- `document`
- `section`
- `chunk`
- `entity`
- `table`
- `field`
- `code_symbol`
- `log_event`
- `concept`

Edge types:

- `contains`
- `mentions`
- `references`
- `depends_on`
- `similar_to`
- `matches_entity`
- `foreign_key`
- `derived_dimension`
- `co_occurs_with`

Source-specific or domain-specific ontology can be layered on top later through filters, views, and optional extraction schemas.

## Entity Resolution

Use three levels of entity resolution.

### Deterministic Resolution

Automatically merge when identity is exact and source-backed:

- identical `source_ref`
- identical JSON path
- identical fully qualified code symbol
- identical URL, email, file path, API path, or error code
- identical id/code values with strong table-field evidence

### Normalized Name Resolution

Normalize case, whitespace, underscores, dashes, and common identifier styles. This catches pairs such as:

- `customer_id`
- `Customer ID`
- `customerId`

Name-only matches should generally create `matches_entity` suggestions, not trusted merges, unless value overlap or source identity provides stronger evidence.

### Optional AI or Embedding Resolution

When embedding or chat providers are configured:

- embeddings can propose similar entity candidates
- chat models can explain whether two candidates should merge
- all AI-suggested merges remain reviewable in the first version

## Graph Generation

`GraphNode` remains the frontend visualization table. Not every extracted object should appear on the canvas.

Default visibility:

- tables, fields, documents, files, and important entities are visible
- chunks are evidence-only
- log lines are evidence-only unless grouped into error, trace, endpoint, or service nodes
- entities are visible when they appear in multiple sources or participate in relationships

Relationship writing rules:

- deterministic `contains` edges are `auto_trusted`
- structured high-confidence foreign keys can be `suggested` or `auto_trusted` based on existing thresholds
- code import dependencies can be `auto_trusted`
- semantic document relationships default to `suggested`
- AI-enhanced relationships default to `suggested`

Graph merge should dedupe nodes and edges by stable keys, relationship type, normalized labels, source references, and evidence summaries. Existing API response dedupe can remain as a frontend protection, but persistent graph creation should also avoid avoidable duplicates.

## Evidence Strategy

Every relationship must answer:

- why the edge exists
- where it came from
- what the user can inspect

Store this through:

- `evidence_summary`
- `source_refs`
- `evidence_payload`

Payloads differ by relationship source.

Structured table payload:

- overlapping values
- match ratio
- row coverage
- unique ratios
- null ratios
- key candidate scores
- sample matches

Document payload:

- chunk ids
- source excerpts
- parser rule name
- heading or section path

Code payload:

- file path
- line number when available
- import statement or symbol text
- language
- parser rule name

Log payload:

- timestamp range
- level
- trace id or request id
- sample lines
- parser rule name

AI payload:

- model
- extraction schema version
- confidence rubric result
- chunk refs
- source excerpts

Evidence documents should be added to `EvidenceRetrievalService` so chat answers can cite document chunks, code snippets, log evidence, and cross-source relationships.

## API Design

Add batch-oriented endpoints while keeping existing single-file endpoints.

Suggested endpoints:

- `POST /api/projects/{project_id}/import-batches`
- `GET /api/projects/{project_id}/import-batches`
- `GET /api/projects/{project_id}/import-batches/{batch_id}`
- `GET /api/projects/{project_id}/import-items`
- `GET /api/projects/{project_id}/sources`
- `GET /api/projects/{project_id}/sources/{source_id}/chunks`
- `GET /api/projects/{project_id}/entities`

The first `POST /import-batches` can accept multiple uploaded files. Folder and repository import can follow after file batches by allowing a staged zip or local path reference.

Batch responses should include:

- batch status
- progress
- item counts by status
- source counts by kind
- graph node and edge counts
- suggestion counts
- errors

## Frontend Design

### ImportPanel

Upgrade the import area to support multisource batches:

- multiple file upload
- batch progress
- per-file status
- source type detection
- error messages
- extraction summary

### DataExplorerPanel

Evolve the table explorer into a source explorer with categories:

- Tables
- Documents
- Code
- Logs
- JSON

Clicking a source should show parsed chunks, entities, and relationship summaries without putting all details on the graph canvas.

### RelationshipReview

Keep this as the main human-review loop. Add filters for:

- relationship type
- confidence
- source kind
- status
- AI-enhanced relationships

Cards should show source-kind labels and evidence summaries.

### GraphCanvas

The graph should default to the merged project view and provide filters:

- tables
- documents
- entities
- code
- logs
- suggested
- accepted
- rejected

Chunks and raw log lines should appear through the evidence inspector rather than as canvas nodes by default.

### EvidenceInspector

Add payload-specific templates:

- table relationship evidence
- document chunk excerpts
- code path and line evidence
- log event samples
- AI extraction metadata

## Testing Strategy

Backend tests:

- creating an import batch with multiple items
- item status progression through staged, parsed, profiled, extracted, resolved, graphed, and indexed
- CSV/XLSX structured import still works
- JSON array imports as structured data
- nested JSON imports as document-like source
- Markdown headings and links create chunks and references
- code imports create dependency relationships from import statements
- logs create events and trace/request groupings
- entity resolution dedupes exact source refs and creates suggestions for name-only matches
- graph merge avoids duplicate nodes and edges
- evidence retrieval includes document, code, log, and cross-source relationship documents

Frontend tests:

- multisource import progress display
- source explorer category display
- relationship review source-kind filtering
- graph filters preserve existing table graph behavior
- evidence inspector formats table, document, code, log, and AI payloads

No test should call a real external AI provider.

## Rollout Plan

### Phase 1: Batch and Structured Expansion

- Add `ImportBatch` and `ImportItem`.
- Support multiple CSV/XLSX/JSON files.
- Expand structured relationship inference across datasets.
- Add persistent graph merge dedupe.
- Keep frontend changes focused on batch progress and source summaries.

### Phase 2: Documents, Markdown, and Logs

- Add `DocumentSource` and `DocumentChunk`.
- Parse Markdown, PDF/Word text, and logs.
- Add rule-based entity and relationship extraction.
- Extend evidence retrieval and evidence inspector.

### Phase 3: Code Repository Graph

- Add lightweight code repository parser.
- Extract file, symbol, and import dependency nodes.
- Add graph filters for code relationships.
- Connect README and documentation mentions to code symbols.

### Phase 4: Optional AI Enhancement

- Add chunk-level structured extraction.
- Add AI-assisted entity merge explanations.
- Keep AI relationships reviewable.
- Store model name, schema version, source refs, and confidence rubric in evidence payloads.

## Risks and Mitigations

- **Graph explosion:** keep chunks and raw log lines evidence-only by default; show aggregated nodes.
- **Low-quality semantic extraction:** default to rules; mark semantic and AI-derived relationships as suggestions.
- **Import failures in mixed batches:** track per-item failures and let successful items complete.
- **Duplicate nodes across sources:** implement deterministic and normalized entity resolution before graph write.
- **Large project performance:** cache artifacts on disk, store references in SQLite, and keep DuckDB for structured data.
- **Privacy concerns:** never call external AI providers unless user settings explicitly enable them.

## Acceptance Criteria

1. Users can start one batch containing multiple CSV/XLSX/JSON files and see per-file status.
2. Structured relationships can be inferred across separate files in the same project or batch.
3. Markdown, PDF/Word text, code, and logs can be represented as sources, chunks, entities, and relationship candidates.
4. Every generated relationship has source references and inspectable evidence.
5. The graph view shows a merged project-level graph without flooding the canvas with chunks or raw log lines.
6. Existing spreadsheet import and relationship review behavior remains working.
7. Optional AI enhancement is off by default and reviewable when enabled.

## Self-Review

- Placeholder scan: no TBD or TODO placeholders remain.
- Consistency check: the design keeps existing SQLite, DuckDB, graph, suggestion, and evidence-index concepts while adding batch and document extraction layers.
- Scope check: this is intentionally phased and keeps the first implementation focused on batch structured expansion before deeper document, code, log, and AI work.
- Ambiguity check: automatic trust is limited to deterministic relationships; semantic and AI relationships are reviewable by default.
