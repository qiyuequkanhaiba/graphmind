import re
import unicodedata
from collections.abc import Iterable


def _ascii_words(value: str) -> list[str]:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return re.findall(r"[a-zA-Z0-9]+", ascii_value.lower())


def normalize_header(value: str) -> str:
    words = _ascii_words(value)
    if not words:
        return "field"
    filtered = [word for word in words if word not in {"usd", "rmb", "cny"}]
    return "_".join(filtered or words)


def normalize_sheet_name(value: str) -> str:
    words = _ascii_words(value)
    if not words:
        return "sheet"
    return "_".join(words)


def unique_normalized_sheet_names(sheet_names: Iterable[str]) -> list[tuple[str, str]]:
    """Keep sheet table suffixes stable when distinct names normalize alike."""
    counts: dict[str, int] = {}
    names: list[tuple[str, str]] = []
    for sheet_name in sheet_names:
        base_name = normalize_sheet_name(sheet_name)
        count = counts.get(base_name, 0) + 1
        counts[base_name] = count
        names.append((sheet_name, base_name if count == 1 else f"{base_name}_{count}"))
    return names
