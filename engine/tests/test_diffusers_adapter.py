"""
What the adapter refuses BEFORE it imports anything.

Everything below runs without torch, and that is deliberate: `pnpm engine:check` must not have to
download 682 MB to be green. What loading a real pipeline does is proven by the end-to-end run.
"""

from pathlib import Path

import pytest

from aidesktopstudio_engine.adapters.diffusers_adapter import (
    DiffusersAdapter,
    accepted_kwargs,
    compute_dtype_name,
    pretrained_file_kwargs,
    pretrained_optional_overrides,
    tune_pipeline,
)
from aidesktopstudio_engine.adapters.loading import (
    LoadedModel,
    LoadRefusedError,
    generation_refusal,
    quietened,
    refuse_reason,
)
from aidesktopstudio_engine.adapters.modalities import MODALITIES


def held(*, model_id: str = "sana", pipeline: object | None = None) -> LoadedModel:
    return LoadedModel(
        model_id=model_id,
        device="cpu",
        pipeline=object() if pipeline is None else pipeline,
        bytes_resident=1,
        tensor_bytes=1,
        load_ms=1,
        takes_step_callback=False,
        default_steps=1,
    )


def test_a_torch_weight_model_does_not_ask_for_an_fp16_sibling() -> None:
    files = pretrained_file_kwargs(True)

    assert files["use_safetensors"] is False
    assert "variant" not in files


def test_safetensors_models_still_take_the_fp16_files() -> None:
    files = pretrained_file_kwargs(False)

    assert files["use_safetensors"] is True
    assert files["variant"] == "fp16"


def test_a_folder_without_fp16_siblings_does_not_ask_for_them(tmp_path: Path) -> None:
    (tmp_path / "model.safetensors").write_bytes(b"")

    files = pretrained_file_kwargs(False, str(tmp_path))

    assert "variant" not in files


def test_a_folder_that_ships_fp16_files_still_asks_for_them(tmp_path: Path) -> None:
    (tmp_path / "model.fp16.safetensors").write_bytes(b"")

    files = pretrained_file_kwargs(False, str(tmp_path))

    assert files["variant"] == "fp16"


def test_refuses_a_folder_that_is_not_one(tmp_path: Path) -> None:
    assert "not a folder" in (refuse_reason(str(tmp_path / "nowhere")) or "")


def test_admits_a_folder_of_weights(tmp_path: Path) -> None:
    (tmp_path / "model_index.json").write_text("{}")
    (tmp_path / "model.safetensors").write_bytes(b"")

    assert refuse_reason(str(tmp_path)) is None


def test_refuses_weights_that_carry_python(tmp_path: Path) -> None:
    (tmp_path / "model_index.json").write_text("{}")
    (tmp_path / "custom_model.py").write_text("import os")

    assert "custom_model.py" in (refuse_reason(str(tmp_path)) or "")


def test_sees_python_hidden_a_folder_down(tmp_path: Path) -> None:
    (tmp_path / "transformer").mkdir()
    (tmp_path / "transformer" / "modeling.py").write_text("import os")

    assert "modeling.py" in (refuse_reason(str(tmp_path)) or "")


def test_unload_drops_the_pipeline_it_held() -> None:
    """`loaded = None` alone leaves the nn.Module cycle alive; the adapter must drop the object."""
    adapter = DiffusersAdapter(MODALITIES["image"])
    adapter.loaded = held()

    adapter.unload()

    assert adapter.loaded is None


def test_a_prompt_is_enough_to_generate() -> None:
    assert generation_refusal({"prompt": "a cat"}) is None


def test_a_picture_without_a_prompt_is_enough_for_shap_e() -> None:
    assert generation_refusal({"image": "opened:/a.png", "output_type": "mesh"}) is None


def test_neither_a_prompt_nor_a_source_is_refused() -> None:
    assert generation_refusal({}) == "a generation needs a prompt"


def test_an_empty_prompt_is_not_a_prompt() -> None:
    assert generation_refusal({"prompt": ""}) == "a generation needs a prompt"


def test_tune_enables_slicing_and_tiling_when_the_pipeline_has_them() -> None:
    class Probe:
        def __init__(self) -> None:
            self.called: list[str] = []

        def enable_attention_slicing(self) -> None:
            self.called.append("attention")

        def enable_vae_slicing(self) -> None:
            self.called.append("vae_slice")

        def enable_vae_tiling(self) -> None:
            self.called.append("vae_tile")

    probe = Probe()
    tune_pipeline(probe)

    assert probe.called == ["attention", "vae_slice", "vae_tile"]


def test_tune_skips_knobs_a_pipeline_does_not_have() -> None:
    tune_pipeline(object())


def test_a_pipeline_a_door_holds_is_asked_to_draw_no_progress_bar() -> None:
    """One stderr line per denoise step, journalled as an ERROR, for a job that went perfectly."""

    class Probe:
        def __init__(self) -> None:
            self.disabled: bool | None = None

        def set_progress_bar_config(self, disable: bool) -> None:
            self.disabled = disable

    probe = Probe()

    assert quietened(probe) is probe
    assert probe.disabled is True


def test_a_pipeline_without_that_knob_is_handed_back_untouched() -> None:
    """A plugin family holds whatever its own code builds, and most are not diffusers pipelines."""
    handle = object()

    assert quietened(handle) is handle


def test_a_plugin_handing_back_a_dict_has_the_pipelines_inside_it_quietened() -> None:
    """Five of the eleven families answer `{"pipeline": …}` or `{"views": …}`, never the object."""

    class Probe:
        def __init__(self) -> None:
            self.disabled: bool | None = None

        def set_progress_bar_config(self, disable: bool) -> None:
            self.disabled = disable

    inner = Probe()
    handle = {"views": inner, "unet": object()}

    assert quietened(handle) is handle
    assert inner.disabled is True


def test_a_knob_of_another_signature_refuses_to_be_quiet_rather_than_failing_the_load() -> None:
    """Families this repo does not vendor are duck-typed, and a load that worked must not crash."""

    class Stubborn:
        def set_progress_bar_config(self, verbosity: int) -> None:
            raise AssertionError("never reached with this keyword")

    handle = Stubborn()

    assert quietened(handle) is handle


def test_a_mesh_picture_does_not_switch_to_an_image_pipeline() -> None:
    adapter = DiffusersAdapter(MODALITIES["mesh"])
    adapter.loaded = held(model_id="shap-e-img2img")

    assert (
        adapter._wanted_class(adapter.loaded, {"image": "opened:/a.png", "output_type": "mesh"})
        is None
    )


def test_a_video_still_does_not_switch_to_an_image_pipeline() -> None:
    adapter = DiffusersAdapter(MODALITIES["video"])
    adapter.loaded = held(model_id="wan21-i2v-14b-480p")

    assert (
        adapter._wanted_class(adapter.loaded, {"image": "opened:/a.png", "prompt": "walk"}) is None
    )


def test_a_skybox_that_cannot_inpaint_refuses_a_source_image() -> None:
    adapter = DiffusersAdapter(MODALITIES["skybox"])
    adapter.loaded = held(model_id="diffusion360")

    with pytest.raises(LoadRefusedError, match="does not take a source image"):
        adapter._wanted_class(
            adapter.loaded, {"image": "opened:/a.png", "mask_image": "opened:/m.png"}
        )


def test_a_skybox_from_words_does_not_switch_pipeline() -> None:
    adapter = DiffusersAdapter(MODALITIES["skybox"])
    adapter.loaded = held(model_id="panfusion")

    assert (
        adapter._wanted_class(adapter.loaded, {"prompt": "a hall", "circular_padding": True})
        is None
    )


def test_a_skybox_that_already_inpaints_keeps_its_pipeline() -> None:
    class Fill:
        def __call__(self, prompt: str, image: object, mask_image: object) -> None:
            del prompt, image, mask_image

    adapter = DiffusersAdapter(MODALITIES["skybox"])
    adapter.loaded = held(model_id="genex-world-initializer", pipeline=Fill())

    assert (
        adapter._wanted_class(
            adapter.loaded, {"image": "opened:/a.png", "mask_image": "opened:/m.png"}
        )
        is None
    )


def test_skips_a_safety_checker_the_folder_did_not_fetch(tmp_path: Path) -> None:
    (tmp_path / "model_index.json").write_text(
        '{"safety_checker": ["stable_diffusion", "StableDiffusionSafetyChecker"]}'
    )

    assert pretrained_optional_overrides(str(tmp_path)) == {"safety_checker": None}


def test_keeps_a_safety_checker_that_was_fetched(tmp_path: Path) -> None:
    (tmp_path / "model_index.json").write_text(
        '{"safety_checker": ["stable_diffusion", "StableDiffusionSafetyChecker"]}'
    )
    (tmp_path / "safety_checker").mkdir()

    assert pretrained_optional_overrides(str(tmp_path)) == {}


def test_a_null_safety_checker_in_the_index_needs_no_override(tmp_path: Path) -> None:
    (tmp_path / "model_index.json").write_text('{"safety_checker": [null, null]}')

    assert pretrained_optional_overrides(str(tmp_path)) == {}


def test_drops_a_still_the_pipeline_does_not_take() -> None:
    class TextToVideo:
        def __call__(self, prompt: str, num_inference_steps: int = 20) -> None:
            del prompt, num_inference_steps

    kept = accepted_kwargs(TextToVideo(), {"prompt": "walk", "image": "opened:/a.png"})

    assert kept == {"prompt": "walk"}


def test_keeps_a_still_when_the_pipeline_declares_it() -> None:
    class ImageToVideo:
        def __call__(self, prompt: str, image: object) -> None:
            del prompt, image

    kept = accepted_kwargs(ImageToVideo(), {"prompt": "walk", "image": "opened:/a.png"})

    assert kept == {"prompt": "walk", "image": "opened:/a.png"}


def test_stays_narrow_where_the_device_has_half_kernels() -> None:
    assert compute_dtype_name("mps") == "float16"
    assert compute_dtype_name("cuda") == "float16"


def test_widens_on_a_cpu_that_has_no_half_kernels() -> None:
    assert compute_dtype_name("cpu") == "float32"
