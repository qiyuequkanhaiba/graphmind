from graphmind.core.normalizers import normalize_header, normalize_sheet_name


def test_normalize_header_removes_noise_and_lowercases():
    assert normalize_header(" Customer ID ") == "customer_id"
    assert normalize_header("Order-Amount ($)") == "order_amount"
    assert normalize_header("客户 ID") == "id"


def test_normalize_sheet_name_is_stable_for_empty_names():
    assert normalize_sheet_name(" Orders 2026 ") == "orders_2026"
    assert normalize_sheet_name("") == "sheet"
