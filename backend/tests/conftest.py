from collections.abc import Iterator
from pathlib import Path

import pytest


@pytest.fixture
def tmp_workspace(tmp_path: Path) -> Path:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    return workspace


@pytest.fixture
def sample_csv(tmp_path: Path) -> Iterator[Path]:
    path = tmp_path / "customers_orders.csv"
    path.write_text(
        "\n".join(
            [
                "order_id,customer_id,product_id,amount,region",
                "o1,c1,p1,120,East",
                "o2,c1,p2,240,East",
                "o3,c2,p1,80,West",
            ]
        ),
        encoding="utf-8",
    )
    yield path
