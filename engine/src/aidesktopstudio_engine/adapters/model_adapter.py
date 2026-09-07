"""
What a door holds, whichever backend answers. No type-checker runs on this tree, so what this
declaration buys is `test_adapter_contract.py`: a parameter that drifts on one of the three
adapters fails at the gate rather than at a call site.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, Protocol

from aidesktopstudio_engine.adapters.loading import LoadedModel


class ModelAdapter(Protocol):
    """One model at a time. What it holds and what it costs are ANSWERED, never guessed."""

    loaded: LoadedModel | None

    def backend(self) -> str: ...

    def device(self) -> str: ...

    def load(
        self,
        model_id: str,
        folder: str,
        torch_weights: bool = False,
        attachment: dict[str, Any] | None = None,
    ) -> LoadedModel: ...

    def unload(self) -> None: ...

    def generate(
        self,
        params: dict[str, Any],
        destination: str,
        door: str,
        on_step: Callable[[int, int], None] | None = None,
        stopping: Callable[[], bool] | None = None,
    ) -> dict[str, Any]: ...

    def auto_rig(
        self,
        params: dict[str, Any],
        destination: str,
        door: str,
        on_phase: Callable[[int, int, str], None],
        stopping: Callable[[], bool],
    ) -> dict[str, Any]: ...
