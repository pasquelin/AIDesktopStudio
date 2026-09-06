"""Runtime lifecycle shared by the model-family plugin definitions."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

from ia_studio_engine.adapters.loading import LoadedModel, LoadRefusedError
from ia_studio_engine.core.jobqueue import CancelledError


def _device_for(model_id, plugin, on):
    if plugin.needs_cuda and on != "cuda":
        raise LoadRefusedError(f"{model_id} needs CUDA, this machine is {on}")
    if plugin.devices is not None and on not in plugin.devices:
        if plugin.fallback_device in plugin.devices:
            return plugin.fallback_device
        raise LoadRefusedError(f"{model_id} does not support {on}")
    return on


class PluginAdapter:
    """Hold and run one model-family plugin at a time."""

    def __init__(self) -> None:
        self.loaded: LoadedModel | None = None

    def backend(self) -> str:
        return "pytorch"

    def device(self) -> str:
        from ia_studio_engine.adapters import plugin_adapter

        return plugin_adapter.device()

    def unload(self) -> None:
        from ia_studio_engine.adapters import plugin_adapter

        self.loaded = None
        plugin_adapter._forget_local_repos()
        plugin_adapter.release_cache()

    def load(
        self,
        model_id: str,
        folder: str,
        torch_weights: bool = False,
        attachment: dict[str, Any] | None = None,
    ) -> LoadedModel:
        from ia_studio_engine.adapters import plugin_adapter

        del torch_weights
        if attachment is not None:
            raise LoadRefusedError(f"{model_id} takes no attached weights")
        refusal = plugin_adapter.refuse_reason(folder)
        if refusal is not None:
            raise LoadRefusedError(refusal)
        plugin = plugin_adapter.PLUGINS.get(model_id)
        if plugin is None:
            raise LoadRefusedError(f"no plugin adapter for {model_id}")
        on = _device_for(model_id, plugin, plugin_adapter.device())
        self.unload()
        started = time.perf_counter_ns()
        handle = plugin_adapter.quietened(plugin.load(folder, on))
        self.loaded = LoadedModel(
            model_id=model_id,
            device=on,
            pipeline=handle,
            bytes_resident=plugin_adapter.held_bytes(on),
            tensor_bytes=plugin_adapter.tensor_bytes(on),
            load_ms=(time.perf_counter_ns() - started) / 1e6,
            takes_step_callback=False,
            default_steps=25,
        )
        return self.loaded

    def generate(
        self,
        params: dict[str, Any],
        destination: str,
        door: str,
        on_step: Callable[[int, int], None] | None = None,
        stopping: Callable[[], bool] | None = None,
    ) -> dict[str, Any]:
        from ia_studio_engine.adapters import plugin_adapter

        held = self.loaded
        if held is None:
            raise LoadRefusedError("no model is loaded")
        if stopping is not None and stopping():
            raise CancelledError("the generation was cancelled")
        started = time.perf_counter_ns()
        plugin = plugin_adapter.PLUGINS[held.model_id]
        if plugin.run_cancellable is not None:
            plugin.run_cancellable(
                held.pipeline, params, destination, held.device, on_step, stopping
            )
        else:
            if on_step is not None:
                on_step(1, 1)
            plugin.run(held.pipeline, params, destination, held.device)
        if stopping is not None and stopping():
            raise CancelledError("the generation was cancelled")
        elapsed = (time.perf_counter_ns() - started) / 1e6
        return plugin_adapter.result_frame(door, held.device, self.backend(), destination, elapsed)

    def auto_rig(
        self,
        params: dict[str, Any],
        destination: str,
        door: str,
        on_phase: Callable[[int, int, str], None],
        stopping: Callable[[], bool],
    ) -> dict[str, Any]:
        from ia_studio_engine.adapters import plugin_adapter

        held = self.loaded
        if held is None:
            raise LoadRefusedError("no model is loaded")
        runner = plugin_adapter.PLUGINS[held.model_id].auto_rig
        if runner is None:
            raise LoadRefusedError(f"{held.model_id} does not support Auto Rig")
        if stopping():
            raise CancelledError("the Auto Rig job was cancelled")
        started = time.perf_counter_ns()
        metrics = runner(held.pipeline, params, destination, on_phase, stopping)
        elapsed = (time.perf_counter_ns() - started) / 1e6
        return {
            **plugin_adapter.result_frame(door, held.device, self.backend(), destination, elapsed),
            **metrics,
        }
