"""Reading a studio form field: the three spellings both adapters share."""

from __future__ import annotations

from typing import Any


def filled(params: dict[str, Any], key: str) -> Any:
    """A field the form may have left empty, answered as-is. `""` travels as absent."""
    value = params.get(key)
    return None if value is None or value == "" else value


def knob(params: dict[str, Any], key: str, cast: Any, default: Any) -> Any:
    """A field with a fallback the pipeline would not supply. One spelling keeps `0` a seed."""
    value = filled(params, key)
    return default if value is None else cast(value)


def text(params: dict[str, Any], key: str) -> str | None:
    """A field that has to be WORDS. A number where a prompt was expected is absent, not `"7"`."""
    value = params.get(key)
    return value if isinstance(value, str) and value else None
