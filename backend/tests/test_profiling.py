import warnings

import pandas as pd

from graphmind.core.profiling import profile_dataframe


def test_profile_dataframe_detects_keys_categories_and_numbers():
    df = pd.DataFrame(
        {
            "order_id": ["o1", "o2", "o3"],
            "customer_id": ["c1", "c1", "c2"],
            "amount": [120.5, 240.0, 80.0],
            "region": ["East", "East", "West"],
            "ordered_at": ["2026-01-01", "2026-01-03", "2026-02-01"],
        }
    )

    profile = profile_dataframe(sheet_name="Orders", duckdb_table_name="orders", df=df)

    assert profile.name == "Orders"
    assert profile.normalized_name == "orders"
    assert profile.row_count == 3
    assert profile.column_count == 5

    by_name = {field.normalized_name: field for field in profile.fields}
    assert by_name["order_id"].inferred_type == "identifier"
    assert by_name["order_id"].key_candidate_score == 1.0
    assert by_name["amount"].inferred_type == "number"
    assert by_name["region"].inferred_type == "category"
    assert by_name["ordered_at"].inferred_type == "date"


def test_profile_dataframe_reports_nulls_and_sample_values():
    df = pd.DataFrame({"Name": ["Ada", None, "Lin"], "Score": [10, None, 12]})

    profile = profile_dataframe(sheet_name="People", duckdb_table_name="people", df=df)
    by_name = {field.normalized_name: field for field in profile.fields}

    assert by_name["name"].null_count == 1
    assert by_name["name"].sample_values == ["Ada", "Lin"]
    assert by_name["score"].null_count == 1


def test_non_date_like_names_do_not_trigger_pandas_date_warnings():
    df = pd.DataFrame(
        {
            "status": ["new", "pending", "closed"],
            "category": ["alpha", "beta", "gamma"],
        }
    )

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        profile = profile_dataframe(sheet_name="Tickets", duckdb_table_name="tickets", df=df)

    pandas_user_warnings = [warning for warning in caught if warning.category is UserWarning]
    assert pandas_user_warnings == []

    by_name = {field.normalized_name: field for field in profile.fields}
    assert by_name["status"].inferred_type != "date"
    assert by_name["category"].inferred_type != "date"


def test_category_threshold_treats_exactly_point_eight_as_category():
    df = pd.DataFrame({"label": ["a", "b", "c", "d", "d"]})

    profile = profile_dataframe(sheet_name="Labels", duckdb_table_name="labels", df=df)

    by_name = {field.normalized_name: field for field in profile.fields}
    assert by_name["label"].inferred_type == "category"


def test_category_threshold_treats_above_point_eight_as_text():
    df = pd.DataFrame({"label": ["a", "b", "c", "d", "e", "e"]})

    profile = profile_dataframe(sheet_name="Labels", duckdb_table_name="labels", df=df)

    by_name = {field.normalized_name: field for field in profile.fields}
    assert by_name["label"].inferred_type == "text"
