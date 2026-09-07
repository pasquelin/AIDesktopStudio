"""Picks the adapter the loaded model actually needs. The door holds one of these."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from aidesktopstudio_engine.adapters.diffusers_adapter import DiffusersAdapter
from aidesktopstudio_engine.adapters.loading import LoadedModel
from aidesktopstudio_engine.adapters.modalities import Modality
from aidesktopstudio_engine.adapters.model_adapter import ModelAdapter
from aidesktopstudio_engine.adapters.plugin_adapter import PluginAdapter, is_plugin_model


class RoutingAdapter:
    """Diffusers by default; a plugin id swaps the inner adapter and unloads the previous."""

    def __init__(self, modality: Modality) -> None:
        self.modality = modality
        self._inner: ModelAdapter = DiffusersAdapter(modality)

    @property
    def loaded(self) -> LoadedModel | None:
        return self._inner.loaded

    def backend(self) -> str:
        return self._inner.backend()

    def device(self) -> str:
        return self._inner.device()

    def load(
        self,
        model_id: str,
        folder: str,
        torch_weights: bool = False,
        attachment: dict[str, Any] | None = None,
    ) -> LoadedModel:
        plugin = is_plugin_model(model_id)
        if plugin != isinstance(self._inner, PluginAdapter):
            self._inner.unload()
            self._inner = PluginAdapter() if plugin else DiffusersAdapter(self.modality)
        return self._inner.load(
            model_id, folder, torch_weights=torch_weights, attachment=attachment
        )

    def unload(self) -> None:
        self._inner.unload()

    def generate(
        self,
        params: dict[str, Any],
        destination: str,
        door: str,
        on_step: Callable[[int, int], None] | None = None,
        stopping: Callable[[], bool] | None = None,
    ) -> dict[str, Any]:
        return self._inner.generate(params, destination, door, on_step, stopping)

    def auto_rig(
        self,
        params: dict[str, Any],
        destination: str,
        door: str,
        on_phase: Callable[[int, int, str], None],
        stopping: Callable[[], bool],
    ) -> dict[str, Any]:
        return self._inner.auto_rig(params, destination, door, on_phase, stopping)
