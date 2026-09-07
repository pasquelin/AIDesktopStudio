"""
Plugin family routing, without torch.

🛑 Nothing here reads the repository: `engine/` imports none of it at runtime, which is what makes
its extraction a `git filter-repo` away. Whether `PLUGINS` matches the studio's catalogue is held
from the studio side, in `localRuntimes.test.ts`.
"""

from pathlib import Path

import pytest

from aidesktopstudio_engine.adapters.loading import LoadRefusedError
from aidesktopstudio_engine.adapters.modalities import MODALITIES
from aidesktopstudio_engine.adapters.plugin_adapter import (
    PLUGINS,
    Plugin,
    PluginAdapter,
    is_plugin_model,
)
from aidesktopstudio_engine.adapters.routing_adapter import RoutingAdapter

CUDA_ONLY = sorted(name for name, plugin in PLUGINS.items() if plugin.needs_cuda)


def test_a_cuda_family_refuses_to_load_on_mps(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """`needs_cuda` is read off the same table `load` dispatches by, so one family carries it."""
    import aidesktopstudio_engine.adapters.plugin_adapter as plugin_adapter

    monkeypatch.setattr(plugin_adapter, "device", lambda: "mps")
    with pytest.raises(LoadRefusedError, match="CUDA"):
        PluginAdapter().load(CUDA_ONLY[0], str(tmp_path))


def test_a_family_that_runs_anywhere_is_not_refused_for_the_device() -> None:
    assert "triposr" not in CUDA_ONLY
    assert not is_plugin_model("sana-600m-1024")


def test_an_unknown_id_is_not_a_plugin_adapter(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    import aidesktopstudio_engine.adapters.plugin_adapter as plugin_adapter

    monkeypatch.setattr(plugin_adapter, "device", lambda: "cpu")
    with pytest.raises(LoadRefusedError, match="no plugin adapter"):
        PluginAdapter().load("ssd-1b", str(tmp_path))


def test_attached_weights_are_refused_rather_than_dropped(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """A ControlNet asked of a plugin used to load as if nothing had been requested."""
    import aidesktopstudio_engine.adapters.plugin_adapter as plugin_adapter

    monkeypatch.setattr(plugin_adapter, "device", lambda: "cpu")
    with pytest.raises(LoadRefusedError, match="no attached weights"):
        PluginAdapter().load("triposr", str(tmp_path), attachment={"folder": "/w", "as": "lora"})


def test_the_door_starts_on_diffusers() -> None:
    adapter = RoutingAdapter(MODALITIES["mesh"])

    assert type(adapter._inner).__name__ == "DiffusersAdapter"


def test_plugin_load_refuses_weights_that_carry_python(tmp_path: Path) -> None:
    (tmp_path / "custom_model.py").write_text("import os")
    adapter = PluginAdapter()

    with pytest.raises(LoadRefusedError, match=r"custom_model\.py"):
        adapter.load("triposr", str(tmp_path))


def test_a_second_plugin_load_unloads_the_first(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    import aidesktopstudio_engine.adapters.plugin_adapter as plugin_adapter

    monkeypatch.setattr(plugin_adapter, "device", lambda: "cpu")
    monkeypatch.setattr(plugin_adapter, "held_bytes", lambda _device: 0)
    monkeypatch.setattr(plugin_adapter, "tensor_bytes", lambda _device: 0)
    monkeypatch.setitem(PLUGINS, "triposr", Plugin(lambda *_args: "handle", PLUGINS["triposr"].run))
    adapter = PluginAdapter()
    calls: list[str] = []
    original = adapter.unload

    def tracking_unload() -> None:
        calls.append("unload")
        original()

    monkeypatch.setattr(adapter, "unload", tracking_unload)
    adapter.load("triposr", str(tmp_path))

    assert calls == ["unload"]
    assert adapter.loaded is not None
    assert adapter.loaded.pipeline == "handle"


def test_a_family_that_reads_a_picture_says_so_rather_than_asking_for_a_prompt() -> None:
    """TripoSR takes no prompt, and the diffusers refusal named one — in the studio's journal."""
    import aidesktopstudio_engine.adapters.plugin_adapter as plugin_adapter

    with pytest.raises(LoadRefusedError, match="needs a picture"):
        plugin_adapter._picture({"prompt": "a red cube"})


def test_a_generation_needs_a_loaded_model() -> None:
    with pytest.raises(LoadRefusedError, match="no model is loaded"):
        PluginAdapter().generate({}, "/tmp/out.ply", "engine/3d")
