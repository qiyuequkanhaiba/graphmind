# GraphMind MVP Design

## Summary

GraphMind is a local-first web app that turns generic spreadsheet files into an editable, evidence-backed knowledge graph and lets users ask AI questions about the data relationships.

The MVP focuses on one complete loop:

1. Upload CSV or Excel files.
2. Profile sheets, tables, and columns.
3. Infer candidate relationships.
4. Let the user accept, edit, or reject those relationships.
5. Visualize the resulting graph.
6. Answer AI questions with graph paths, field citations, and query evidence.

The product should not promise perfect automatic understanding of every spreadsheet. It should promise that any supported spreadsheet can be imported, inspected, converted into a draft relationship graph, corrected by the user, and queried with cited AI answers.

## Goals

- Support generic CSV and XLSX uploads in a local web app.
- Generate useful table-level and field-level graph views from messy spreadsheet data.
- Make relationship inference transparent through confidence scores and evidence.
- Treat user-confirmed relationships as trusted graph state.
- Provide AI answers grounded in confirmed graph paths and tabular evidence.
- Keep raw spreadsheet data local by default.

## Non-Goals

- Building a hosted SaaS platform.
- Supporting collaborative multi-user projects.
- Replacing full BI tools or data warehouses.
- Providing a custom ontology editor in the MVP.
- Requiring a graph database in the MVP.
- Sending entire raw spreadsheets to an AI provider by default.
- Guaranteeing causal explanations from correlational spreadsheet data.

## Product Shape

The MVP is a local web app with a single workspace screen:

- Left panel: file import, sheet list, table profiles, and detected fields.
- Center canvas: graph visualization with table, field, and limited entity views.
- Right panel: relationship review and AI Q&A.

The first version should feel like a working analysis surface rather than a marketing demo. Users should see their spreadsheet structure, understand why relationships were inferred, correct mistakes, and then ask questions grounded in the corrected graph.

## MVP Scope

The selected scope is "Upload + Confirm + Ask."

Included:

- CSV and XLSX import.
- Sheet and table preview.
- Header normalization.
- Column type profiling.
- Key candidate detection.
- Relationship scoring across tables and fields.
- Graph nodes and edges for tables, fields, and selected derived entities.
- Accept, edit, and reject controls for relationship suggestions.
- Saved local project state.
- AI Q&A with graph paths, field citations, confidence language, and limitations.

Deferred:

- Database connectors.
- Cloud sync.
- Multi-project dashboard beyond local saved projects.
- Full text entity extraction from arbitrary note columns.
- Advanced graph analytics.
- Custom ontology builder.
- Graph database integration.

## Architecture

GraphMind uses a React frontend and a Python local backend.

### Frontend

Responsibilities:

- Upload files and show import status.
- Display sheet and table previews.
- Render profile summaries.
- Render graph canvas.
- Provide table, field, and limited entity graph view modes.
- Show candidate relationships with evidence and confidence.
- Let users accept, edit, or reject relationship suggestions.
- Provide AI chat UI.
- Highlight cited graph paths and source fields after answers.

Recommended graph library options:

- React Flow for controllable node-edge UI and custom panels.
- Cytoscape.js if graph layout and graph interaction depth become more important.

The MVP can start with React Flow because it is straightforward for editable, product-like graph workflows.

### Backend

Responsibilities:

- Parse CSV and XLSX files.
- Normalize headers and sheet names.
- Store imported table data locally.
- Generate table and column profiles.
- Infer candidate relationships.
- Persist project metadata, graph objects, review decisions, and chat sessions.
- Query tabular data for AI evidence.
- Build minimized AI context.
- Coordinate AI query planning and answer composition.

Python is preferred because spreadsheet parsing, data profiling, and DuckDB integration are stronger and simpler in the Python ecosystem.

### Storage

Use SQLite and DuckDB for the MVP.

SQLite stores:

- Projects.
- Datasets.
- Sheets.
- Table profiles.
- Field profiles.
- Graph nodes.
- Graph edges.
- Relationship suggestions.
- User decisions.
- Chat sessions.
- AI answer citations.
- UI graph layout state.

DuckDB stores or queries:

- Imported tabular data.
- Aggregate query results.
- Filtered row samples.
- Evidence outputs used by AI answers.

The graph should be stored as normal node and edge tables in SQLite. A graph database is not needed for the MVP and can be revisited if traversal workloads become complex.

## Core Data Model

### Project

Represents a local workspace.

Fields:

- id
- name
- created_at
- updated_at
- settings
- ai_provider_config_ref

### Dataset

Represents an imported file.

Fields:

- id
- project_id
- filename
- file_type
- imported_at
- import_status
- raw_data_ref
- error_message

### Sheet

Represents one CSV table or one Excel sheet.

Fields:

- id
- dataset_id
- name
- normalized_name
- row_count
- column_count
- duckdb_table_name

### Field Profile

Represents a profiled column.

Fields:

- id
- sheet_id
- original_name
- normalized_name
- inferred_type
- null_count
- unique_count
- sample_values
- min_value
- max_value
- semantic_label
- key_candidate_score

### Graph Node

Represents a table, field, or derived entity.

Fields:

- id
- project_id
- node_type
- label
- source_ref
- metadata
- position_x
- position_y

Node types:

- table
- field
- derived_entity

### Graph Edge

Represents a confirmed or high-confidence relationship.

Fields:

- id
- project_id
- source_node_id
- target_node_id
- edge_type
- confidence
- status
- evidence_ref
- created_from_suggestion_id

Edge statuses:

- suggested
- accepted
- edited
- rejected
- auto_trusted

### Relationship Suggestion

Represents an inferred relationship before or during user review.

Fields:

- id
- project_id
- source_field_id
- target_field_id
- relationship_type
- confidence
- evidence_summary
- evidence_payload
- ai_explanation
- decision_status
- decision_note

### Chat Session

Represents user questions and AI answers.

Fields:

- id
- project_id
- created_at
- title

### Chat Message

Fields:

- id
- chat_session_id
- role
- content
- query_plan
- answer_confidence
- citations
- highlighted_graph_path
- created_at

## Relationship Inference

The MVP should use rules first and AI second.

Rule-based signals:

- Exact normalized header matches.
- Similar header names.
- Uniqueness ratio.
- Value overlap between columns.
- Foreign-key-like pattern: many values in one field match unique values in another.
- Date columns that connect to time-based analysis.
- Low-cardinality categorical columns that can become derived dimension nodes.
- Numeric columns suitable for aggregation.

AI-assisted signals:

- Human-readable explanation of why a relationship may exist.
- Semantic labeling for messy headers.
- Entity naming for ambiguous fields.
- Suggested relationship labels when rules find a likely link but cannot name it well.

Every suggestion must include:

- Source field.
- Target field or derived entity.
- Relationship type.
- Confidence score.
- Evidence summary.
- Supporting statistics or samples.
- Decision status.

## AI Answer Contract

The AI chat must follow a strict cited-answer contract.

For each question:

1. Classify the question type.
2. Build a query plan.
3. Select relevant graph paths and fields.
4. Run required table queries through DuckDB.
5. Compose an answer using only available evidence.
6. Attach citations and confidence language.
7. Highlight related graph nodes and edges in the UI.

Question types:

- Schema explanation.
- Relationship path explanation.
- Aggregate analysis.
- Anomaly or outlier analysis.
- Comparison.
- Unsupported question.

Every substantive answer should include:

- Direct answer.
- Graph path references.
- Table and field citations.
- Aggregate or sample evidence.
- Confidence level.
- Limitations.

Unsupported answers should say what is missing, such as:

- No confirmed graph path exists.
- Required field is missing.
- Required relationship was rejected or not reviewed.
- Data does not support causal inference.
- Question requires external context not available in the project.

The AI layer should receive minimized context by default:

- Schema summaries.
- Field profiles.
- Confirmed graph snippets.
- Relationship evidence summaries.
- Query outputs.
- Small selected row samples only when needed.

It should not receive full raw spreadsheets by default.

## Error Handling

### Import Errors

Handle:

- Unsupported file type.
- Empty file.
- Empty sheet.
- Malformed CSV.
- Password-protected Excel file.
- Encoding problems.
- Extremely large file.

Behavior:

- Show a clear error in the upload panel.
- Preserve the project state.
- Allow retry or removal of the failed dataset.

### Profiling Warnings

Handle:

- Missing headers.
- Duplicate headers.
- Mostly empty columns.
- Mixed data types.
- Very high-cardinality text fields.
- No obvious key candidates.

Behavior:

- Show warnings beside affected sheets or fields.
- Continue analysis where possible.
- Let users manually label or ignore fields.

### Relationship Inference Uncertainty

Handle:

- Low-confidence suggestions.
- Conflicting candidate keys.
- Multiple possible targets.
- Weak value overlap.

Behavior:

- Keep uncertain edges in review state.
- Do not auto-trust weak edges.
- Explain confidence reasons.

### AI Limitations

Handle:

- Missing graph path.
- Unsupported calculation.
- Ambiguous question.
- Insufficient data.
- AI provider unavailable.

Behavior:

- Ask for clarification when needed.
- Return missing-data explanations.
- Keep prior graph and project state usable without AI.

## Testing Strategy

### Unit Tests

Cover:

- Header normalization.
- CSV/XLSX parsing edge cases.
- Column type inference.
- Uniqueness and overlap scoring.
- Relationship confidence calculation.
- Graph node and edge creation.
- Citation object generation.

### Integration Tests

Cover:

- Upload file to generated profile.
- Profile to relationship suggestions.
- Accept/edit/reject suggestion persistence.
- Graph query after user decisions.
- AI query plan to DuckDB evidence query.
- Answer response with citations.

### Fixture Files

Create small representative datasets:

- Clean relational workbook with customers, orders, and products.
- Messy headers workbook.
- Single-table CSV with categorical and numeric columns.
- Workbook with no clear relationships.
- Workbook with ambiguous duplicate ID-like fields.
- File with missing values and mixed types.

### UI Tests

Cover:

- Upload flow.
- Sheet preview.
- Relation review controls.
- Graph mode switching.
- Chat answer citation rendering.
- Graph path highlighting from an answer.

## Milestones

### Milestone 1: Import and Profile

- Create React app shell.
- Create Python backend.
- Support CSV/XLSX upload.
- Store project and dataset metadata.
- Parse files into local queryable storage.
- Generate sheet and field profiles.
- Display import preview and profiling warnings.

### Milestone 2: Draft Graph

- Generate table and field graph nodes.
- Infer candidate key and foreign-key-like relationships.
- Store relationship suggestions.
- Render graph canvas.
- Display confidence and evidence summaries.

### Milestone 3: Review Loop

- Add accept, edit, and reject controls.
- Persist user decisions.
- Convert accepted suggestions into trusted graph edges.
- Show graph state changes after decisions.
- Save layout state.

### Milestone 4: Cited AI Q&A

- Add AI provider adapter.
- Build minimized graph/schema context.
- Classify user questions.
- Generate query plans.
- Run DuckDB evidence queries.
- Compose cited answers.
- Render citations and highlight graph paths.

## Implementation Defaults

Use these defaults for the first implementation plan unless new constraints appear:

- Graph canvas: React Flow.
- Python backend: FastAPI.
- Local project layout: one project directory containing the SQLite database plus imported data files or DuckDB-managed storage.
- AI integration: provider-agnostic adapter with one configured provider first.
- Upload limits: conservative file size limit with a clear warning for large files.

These defaults are intentionally reversible. The MVP should avoid abstractions that make it hard to swap graph rendering, AI providers, or local storage layout after the first working loop exists.
