#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from graphmind.api.app import create_app

DEFAULT_OUTPUT = REPO_ROOT / "docs/api/openapi-contract-summary.json"


def build_openapi_contract_summary(workspace_root: Path | None = None) -> dict[str, Any]:
    if workspace_root is None:
        with tempfile.TemporaryDirectory(prefix="graphmind-openapi-") as tempdir:
            return build_openapi_contract_summary(Path(tempdir))

    app = create_app(workspace_root=workspace_root)
    schema = app.openapi()
    return {
        "openapi": schema.get("openapi"),
        "info": schema.get("info", {}),
        "paths": schema.get("paths", {}),
        "components": {
            "schemas": schema.get("components", {}).get("schemas", {}),
        },
    }


def load_snapshot(path: Path = DEFAULT_OUTPUT) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_snapshot(summary: dict[str, Any], path: Path = DEFAULT_OUTPUT) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export or verify the GraphMind OpenAPI contract")
    parser.add_argument(
        "--workspace-root",
        type=Path,
        default=None,
        help="Workspace root used to initialize the FastAPI app for contract generation.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Snapshot path to write or compare against.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Compare the generated contract summary to the checked-in snapshot.",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write the current contract summary to the snapshot path.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    summary = build_openapi_contract_summary(args.workspace_root)
    if args.write:
        write_snapshot(summary, args.output)
        print(f"Wrote OpenAPI contract summary to {args.output}")
        return 0
    if args.check:
        if not args.output.exists():
            print(f"Missing OpenAPI contract snapshot: {args.output}", file=sys.stderr)
            return 1
        snapshot = load_snapshot(args.output)
        if summary != snapshot:
            print("OpenAPI contract snapshot drift detected.", file=sys.stderr)
            print(f"Compare: {args.output}", file=sys.stderr)
            return 1
        print(
            "OpenAPI contract check passed: "
            f"{len(summary['paths'])} paths, "
            f"{len(summary['components']['schemas'])} schemas."
        )
        return 0
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
