# Answer Evidence Explainability Design

## Goal

Make AI answers visibly traceable by showing the evidence documents retrieved for each answer, including source label, evidence type, source reference, score, and a short excerpt.

## Scope

This phase only exposes already-retrieved graph evidence. It does not add a new ranking algorithm, reranker, long context inspector, or citation editor. It builds on the existing `EvidenceRetrievalService.search()` and chat response contract.

## Product Behavior

When a user asks a question, the assistant answer can include a compact "检索证据" section under the answer text. Each evidence item shows:

- label, such as `Orders.customer_id -> Customers.id`;
- kind, such as `graph_edge` or `field_profile`;
- source reference;
- match score rounded for display;
- a short excerpt from the retrieved evidence content.

The evidence list appears for assistant messages only. If no evidence was retrieved, nothing extra is shown.

## Backend Contract

Add a `RetrievedEvidence` contract to the answer path. `ChatService` should call retrieval once, keep structured `EvidenceDocument` objects for the response, and pass only the content strings to the model provider.

The API response adds:

```json
"retrieved_evidence": [
  {
    "label": "Orders.customer_id -> Customers.id",
    "kind": "graph_edge",
    "source_ref": "suggestion:12",
    "score": 3.2,
    "excerpt": "Orders.customer_id -> Customers.id is a foreign_key relationship..."
  }
]
```

The existing `retrieval_document_count` query-plan metadata remains for compatibility and should equal the number of structured evidence items included.

## Frontend Contract

Add `retrieved_evidence` to `ChatAnswer` and optional `retrieved_evidence` to `ChatMessage`.

`App` copies `answer.retrieved_evidence` into assistant messages. `ChatPanel` renders a compact list beneath the answer, after citations. The list should use Chinese default labels through i18n and remain readable inside the existing pro-workbench right panel.

## Error Handling

Retrieval errors remain non-blocking. If retrieval fails, chat still returns an answer with `retrieved_evidence: []`.

## Testing

Backend tests cover:

- `ChatService` exposes structured retrieved evidence while still passing text evidence to providers;
- `/api/projects/{project_id}/chat` includes `retrieved_evidence`.

Frontend tests cover:

- `ChatPanel` renders retrieved evidence labels, source refs, scores, and excerpts;
- `App` preserves `retrieved_evidence` from API answers in assistant messages.

## Self-Review

- Placeholder scan: no placeholders.
- Consistency check: response contract, service contract, and frontend message type use the same field name.
- Scope check: focused on display and transport of existing evidence, not retrieval quality changes.
- Ambiguity check: empty evidence renders no extra UI.
