# Graph Evidence Retrieval Design

## Goal

Add a local graph-evidence retrieval layer so AI answers can use relevant table, field, and relationship evidence before a full embedding/vector database is introduced.

## Scope

This phase builds a deterministic local evidence index from existing graph nodes, graph edges, field profiles, and relationship suggestions. It updates vector index status in project settings and passes retrieved evidence into the chat provider context. It does not persist dense embeddings or call an embedding model yet.

## Approach

GraphMind will create evidence documents from already trusted project data:

- table and field nodes from `graph_nodes`;
- graph relationships from `graph_edges`;
- pending/accepted relationship suggestions from `relationship_suggestions`;
- field profile metadata such as type, uniqueness, and sample values.

Retrieval uses lexical scoring over the question, labels, source refs, relation types, and evidence summaries. The result is intentionally simple and deterministic, which makes it easy to test and safe to use as the first RAG step. The provider prompt will receive these evidence snippets in addition to the existing rule answer.

## API Behavior

Add `POST /api/projects/{project_id}/vector-index/build`.

The endpoint:

1. verifies the project exists;
2. builds evidence documents from graph/project data;
3. stores status in `Project.settings.ai.vector`:
   - `index_status: "ready"` when documents exist;
   - `index_status: "not_built"` when no documents exist;
   - `document_count`;
   - `last_built_at`;
4. returns the updated `ProjectSettingsResponse`.

The existing settings API will keep merging missing fields safely.

## Chat Flow

`ChatService` will retrieve the top evidence snippets for every question. The rule answer remains the trusted base answer. If model execution is configured, the provider context will include:

- user question;
- rule answer;
- citation labels;
- retrieved evidence snippets.

If no evidence is available, the provider still receives the rule answer and citations.

## Frontend Behavior

The AI status strip gains a “构建索引” action. Clicking it calls the new build endpoint, updates settings state, and changes the displayed vector status to “已就绪” when evidence documents exist.

## Error Handling

Build failure leaves existing settings unchanged and surfaces the existing app error path. Chat retrieval failure is non-fatal: GraphMind returns the rule answer and records `retrieval_status: "failed"` in the query plan.

## Testing

Backend tests cover document construction, lexical retrieval ranking, build endpoint status updates, missing project errors, and ChatService provider context. Frontend tests cover the build button call and status update.

## Self-Review

- Placeholder scan: no TBD/TODO placeholders remain.
- Scope check: this is a single deterministic retrieval phase, not full vector embeddings.
- Ambiguity check: dense vector persistence is explicitly out of scope.
