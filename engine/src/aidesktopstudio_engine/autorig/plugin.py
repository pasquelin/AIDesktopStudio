"""Plugin entry points for the Make-It-Animatable backend."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from aidesktopstudio_engine.adapters.loading import LoadRefusedError


def load(folder: str, device: str) -> Any:
    from aidesktopstudio_engine.autorig.make_it_animatable import load as load_models

    return load_models(folder, device)


def generate(_handle: Any, _params: dict[str, Any], _destination: str, _device: str) -> None:
    raise LoadRefusedError("make-it-animatable only supports Auto Rig")


def auto_rig(
    handle: Any,
    params: dict[str, Any],
    destination: str,
    report: Callable[[int, int, str], None],
    stopping: Callable[[], bool],
) -> dict[str, Any]:
    from aidesktopstudio_engine.autorig.make_it_animatable import run

    return run(handle, params, destination, report, stopping)
