"""Description of one inference plugin family."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

Loader = Callable[[str, str], Any]
Runner = Callable[[Any, dict[str, Any], str, str], None]
AutoRigger = Callable[
    [Any, dict[str, Any], str, Callable[[int, int, str], None], Callable[[], bool]], dict[str, Any]
]


@dataclass(frozen=True)
class Plugin:
    load: Loader
    run: Runner
    needs_cuda: bool = False
    auto_rig: AutoRigger | None = None
    devices: tuple[str, ...] | None = None
    fallback_device: str | None = None
    run_cancellable: Callable | None = None
