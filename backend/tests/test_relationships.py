import pandas as pd

from graphmind.core.profiling import profile_dataframe
from graphmind.core.relationships import infer_relationships


def test_infer_relationships_detects_foreign_key_like_overlap():
    customers = pd.DataFrame({"customer_id": ["c1", "c2"], "region": ["East", "West"]})
    orders = pd.DataFrame({"order_id": ["o1", "o2", "o3"], "customer_id": ["c1", "c1", "c2"]})

    customer_profile = profile_dataframe("Customers", "customers", customers)
    order_profile = profile_dataframe("Orders", "orders", orders)

    suggestions = infer_relationships(
        profiles=[customer_profile, order_profile],
        dataframes={"customers": customers, "orders": orders},
    )

    match = next(
        suggestion
        for suggestion in suggestions
        if suggestion.source_sheet == "Orders" and suggestion.target_sheet == "Customers"
    )
    assert match.source_field == "customer_id"
    assert match.target_field == "customer_id"
    assert match.relationship_type == "foreign_key"
    assert match.confidence >= 0.9
    assert match.evidence_summary == (
        "2 个源字段不同取值中有 2 个与目标字段重合；"
        "3 行非空源数据中有 3 行可匹配目标取值。"
    )


def test_infer_relationships_creates_derived_dimension_for_categories():
    products = pd.DataFrame(
        {"product_id": ["p1", "p2", "p3"], "category": ["Analytics", "CRM", "Analytics"]}
    )
    profile = profile_dataframe("Products", "products", products)

    suggestions = infer_relationships(profiles=[profile], dataframes={"products": products})

    derived = [item for item in suggestions if item.relationship_type == "derived_dimension"]
    assert len(derived) == 1
    assert derived[0].source_field == "category"
    assert derived[0].target_field is None
    assert derived[0].evidence_summary == (
        "Products.category 有 2 个不同类别值，可作为维度进行分析。"
    )


def test_infer_relationships_deduplicates_symmetric_unique_matches():
    accounts = pd.DataFrame({"id": ["1", "2", "3"], "name": ["Ada", "Lin", "Grace"]})
    exports = pd.DataFrame({"id": ["1", "2", "3"], "status": ["new", "old", "new"]})

    account_profile = profile_dataframe("Accounts", "accounts", accounts)
    export_profile = profile_dataframe("Exports", "exports", exports)

    suggestions = infer_relationships(
        profiles=[account_profile, export_profile],
        dataframes={"accounts": accounts, "exports": exports},
    )

    foreign_keys = [item for item in suggestions if item.relationship_type == "foreign_key"]
    assert len(foreign_keys) == 1
    assert {
        foreign_keys[0].source_sheet,
        foreign_keys[0].target_sheet,
    } == {"Accounts", "Exports"}


def test_infer_relationships_detects_foreign_key_when_field_names_differ():
    customers = pd.DataFrame(
        {
            "id": ["c1", "c2", "c3"],
            "customer_name": ["Ada", "Lin", "Grace"],
            "region": ["East", "West", "North"],
        }
    )
    orders = pd.DataFrame(
        {
            "order_id": ["o1", "o2", "o3", "o4"],
            "customer_id": ["c1", "c1", "c2", "c3"],
            "amount": [120, 240, 80, 320],
        }
    )

    customer_profile = profile_dataframe("Customers", "customers", customers)
    order_profile = profile_dataframe("Orders", "orders", orders)

    suggestions = infer_relationships(
        profiles=[customer_profile, order_profile],
        dataframes={"customers": customers, "orders": orders},
    )

    match = next(
        suggestion
        for suggestion in suggestions
        if suggestion.source_sheet == "Orders"
        and suggestion.source_field == "customer_id"
        and suggestion.target_sheet == "Customers"
        and suggestion.target_field == "id"
    )
    assert match.relationship_type == "foreign_key"
    assert match.confidence >= 0.85
    assert match.evidence_payload["source_match_ratio"] == 1.0
    assert match.evidence_payload["matched_row_count"] == 4
    assert match.evidence_payload["source_non_null_count"] == 4
    assert match.evidence_payload["source_null_ratio"] == 0.0
    assert match.evidence_payload["target_null_ratio"] == 0.0
    assert match.evidence_payload["field_type_compatible"] is True
    assert match.evidence_payload["field_name_similarity"] > 0
    assert match.evidence_payload["sample_matches"] == ["c1", "c2", "c3"]
    assert match.evidence_payload["relationship_strength"] in {"likely", "strong"}
    assert "字段名相似度" in match.evidence_summary
