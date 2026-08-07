from graphmind.core.relationship_quality import assess_relationship_quality


def test_relationship_quality_marks_strong_foreign_key_as_high_priority():
    quality = assess_relationship_quality(
        relationship_type="foreign_key",
        confidence=0.88,
        evidence_payload={
            "source_match_ratio": 1.0,
            "matched_row_count": 4,
            "source_non_null_count": 4,
            "field_type_compatible": True,
            "relationship_strength": "likely",
        },
    )

    assert quality.quality_label == "high"
    assert quality.review_priority == "high"
    assert quality.quality_reasons == [
        "confidence:high",
        "high_source_match",
        "high_row_coverage",
        "compatible_field_types",
        "strength:likely",
    ]


def test_relationship_quality_prioritizes_low_quality_pending_suggestions():
    quality = assess_relationship_quality(
        relationship_type="derived_dimension",
        confidence=0.58,
        evidence_payload={"unique_count": 3},
    )

    assert quality.quality_label == "low"
    assert quality.review_priority == "high"


def test_relationship_quality_uses_human_reviewed_evidence_quality():
    quality = assess_relationship_quality(
        relationship_type="foreign_key",
        confidence=0.99,
        evidence_payload={"review_evidence_quality": "medium"},
        decision_status="accepted",
    )

    assert quality.quality_label == "medium"
    assert quality.review_priority == "low"
    assert quality.quality_reasons == ["human_review:medium"]


def test_relationship_quality_promotes_multi_source_extracted_relationships():
    quality = assess_relationship_quality(
        relationship_type="mentions",
        confidence=0.82,
        evidence_payload={
            "source_kind": "extracted_relationship",
            "source_refs": ["architecture.md#overview", "trace.log:line:3"],
            "evidence_refs": ["architecture.md#overview", "trace.log:line:3"],
        },
    )

    assert quality.quality_label == "high"
    assert quality.review_priority == "medium"
    assert quality.quality_reasons == [
        "confidence:high",
        "source:extracted_relationship",
        "evidence:multi_source",
        "evidence:multiple_refs",
    ]


def test_relationship_quality_prioritizes_weak_document_relationships_for_review():
    quality = assess_relationship_quality(
        relationship_type="mentions",
        confidence=0.62,
        evidence_payload={
            "source_kind": "extracted_relationship",
            "source_refs": ["architecture.md#overview"],
            "evidence_refs": ["architecture.md#overview"],
        },
    )

    assert quality.quality_label == "low"
    assert quality.review_priority == "high"
    assert quality.quality_reasons == [
        "confidence:low",
        "source:extracted_relationship",
    ]
