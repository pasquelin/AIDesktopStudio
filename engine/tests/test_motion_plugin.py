import pytest

from aidesktopstudio_engine.adapters.loading import LoadRefusedError
from aidesktopstudio_engine.core.jobqueue import CancelledError
from aidesktopstudio_engine.motion.plugin import load, run_motion


def test_missing_local_files_refuses_before_import_or_network(tmp_path):
    with pytest.raises(LoadRefusedError, match="local"):
        load(str(tmp_path), "cpu")


def test_cancelled_motion_never_calls_model_or_leaves_output(tmp_path):
    path = tmp_path / "result.glb"
    with pytest.raises(CancelledError):
        run_motion(None, {"prompt": "walk"}, str(path), "cpu", None, lambda: True)
    assert not path.exists()


def test_invalid_prompt_refuses_before_model(tmp_path):
    with pytest.raises(LoadRefusedError):
        run_motion(None, {"prompt": ""}, str(tmp_path / "out.glb"), "cpu", None, lambda: False)


def test_motion_uses_cpu_when_the_machine_prefers_an_unsupported_accelerator(monkeypatch, tmp_path):
    from dataclasses import replace

    from aidesktopstudio_engine.adapters import plugin_adapter
    from aidesktopstudio_engine.adapters.plugin_runtime import PluginAdapter

    model_id = "kimodo-soma-rp-v1.1"
    loaded_on = []
    monkeypatch.setattr(plugin_adapter, "device", lambda: "mps")
    monkeypatch.setattr(plugin_adapter, "held_bytes", lambda _: 0)
    monkeypatch.setattr(plugin_adapter, "tensor_bytes", lambda _: 0)
    monkeypatch.setattr(plugin_adapter, "release_cache", lambda: None)
    monkeypatch.setitem(
        plugin_adapter.PLUGINS,
        model_id,
        replace(plugin_adapter.PLUGINS[model_id], load=lambda folder, on: loaded_on.append(on)),
    )
    held = PluginAdapter().load(model_id, str(tmp_path))
    assert loaded_on == ["cpu"]
    assert held.device == "cpu"
