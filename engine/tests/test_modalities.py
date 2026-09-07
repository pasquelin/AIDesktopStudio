"""
What the studio's fields become on the way to a pipeline.

**Blind spot, written rather than hidden**: only the image writer is exercised here. The other
three import diffusers or soundfile, and `pnpm engine:check` must never download 682 MB to be
green — what they write is proven by the end-to-end run.
"""

from typing import Any

import pytest

from aidesktopstudio_engine.adapters.modalities import MODALITIES


def kwargs_of(modality: str, **params: Any) -> dict[str, Any]:
    return MODALITIES[modality].kwargs({"prompt": "a cat", **params})


def kwargs_with(modality: str, *, load_image: Any, **params: Any) -> dict[str, Any]:
    """Stand-in `diffusers.utils`: `load_image` is imported inside the kwargs function, not here."""
    import sys
    import types

    stand_in = types.ModuleType("diffusers.utils")
    stand_in.load_image = load_image
    sys.modules.setdefault("diffusers", types.ModuleType("diffusers"))
    sys.modules["diffusers.utils"] = stand_in
    try:
        return kwargs_of(modality, **params)
    finally:
        del sys.modules["diffusers.utils"]


def test_an_empty_prompt_is_not_sent() -> None:
    asked = MODALITIES["image"].kwargs({"prompt": "", "width": 512})

    assert "prompt" not in asked


def test_the_studio_field_names_reach_the_pipeline_as_its_own() -> None:
    asked = kwargs_of("image", steps=8, cfgScale=4.5, negativePrompt="blur")

    assert asked == {
        "prompt": "a cat",
        "num_inference_steps": 8,
        "guidance_scale": 4.5,
        "negative_prompt": "blur",
    }


@pytest.mark.parametrize("empty", [None, ""])
def test_a_knob_the_form_left_empty_is_not_sent_at_all(empty: object) -> None:
    """Sent as `None` it OVERWRITES the pipeline's own default with nothing."""
    assert "num_inference_steps" not in kwargs_of("image", steps=empty)


def test_a_size_reaches_the_pipeline_as_whole_pixels() -> None:
    assert kwargs_of("image", width="832", height=480)["width"] == 832


def test_a_video_counts_its_frames() -> None:
    assert kwargs_of("video", frames=81)["num_frames"] == 81


def test_a_video_still_reaches_the_pipeline_as_an_image() -> None:
    asked = kwargs_with(
        "video",
        load_image=lambda path: f"opened:{path}",
        prompt="walk",
        image="/project/a.png",
    )

    assert asked["image"] == "opened:/project/a.png"
    assert "video" not in asked


def test_a_sound_carries_how_long_it_runs() -> None:
    assert kwargs_of("audio", seconds=12)["audio_duration"] == 12.0


def test_a_skybox_from_words_asks_for_a_seamless_wrap() -> None:
    asked = kwargs_of("skybox", width=2048, height=1024)

    assert asked["circular_padding"] is True
    assert asked["width"] == 2048
    assert asked["height"] == 1024


def test_a_skybox_is_a_listed_modality() -> None:
    assert "skybox" in MODALITIES


def test_lyrics_reach_the_pipeline() -> None:
    assert kwargs_of("audio", lyrics="[verse]\nhello")["lyrics"] == "[verse]\nhello"


def test_empty_lyrics_are_not_sent() -> None:
    assert "lyrics" not in kwargs_of("audio", lyrics="")


def test_a_mesh_asks_for_geometry_rather_than_a_preview() -> None:
    """ShapE renders preview images unless asked, and a preview on the mesh shelf opens nowhere."""
    assert kwargs_of("mesh")["output_type"] == "mesh"


class StandInImage:
    def __init__(self) -> None:
        self.written: str | None = None

    def save(self, destination: str) -> None:
        self.written = destination


def test_an_image_is_written_where_the_main_process_said() -> None:
    image = StandInImage()
    result = type("Result", (), {"images": [image]})()

    MODALITIES["image"].write(result, "/tmp/out.png", {})

    assert image.written == "/tmp/out.png"


def test_an_image_generation_asks_for_no_picture_when_none_was_given() -> None:
    asked = MODALITIES["image"].kwargs({"prompt": "a cat", "width": 512, "height": 512})

    assert "image" not in asked and asked["width"] == 512


def test_the_picture_the_main_process_resolved_reaches_the_pipeline() -> None:
    asked = kwargs_with("image", load_image=lambda path: f"opened:{path}", image="/project/a.png")

    assert asked["image"] == "opened:/project/a.png"


def test_a_size_is_dropped_once_a_picture_is_there() -> None:
    """The pipeline reads the dimensions off the picture; passing both resizes it unasked."""
    asked = kwargs_with(
        "image", load_image=lambda path: path, image="/project/a.png", width=512, height=512
    )

    assert "width" not in asked and "height" not in asked


def test_a_mask_is_what_says_the_generation_repaints_inside_it() -> None:
    asked = kwargs_with(
        "image", load_image=lambda path: path, image="/a.png", mask="/m.png", strength=0.5
    )

    # Refused by an inpainting pipeline that was handed a mask, so it never travels with one.
    assert asked["mask_image"] == "/m.png" and "strength" not in asked


def test_how_far_from_its_source_a_generation_may_go() -> None:
    asked = kwargs_with("image", load_image=lambda path: path, image="/a.png", strength=0.5)

    assert asked["strength"] == 0.5


def test_a_mesh_from_a_picture_drops_the_description_it_replaces() -> None:
    """`ShapEImg2ImgPipeline` takes an image and NO prompt: both raise before a step runs."""
    asked = kwargs_with(
        "mesh", load_image=lambda path: path, prompt="a shark", image="/project/a.png"
    )

    assert asked["image"] == "/project/a.png"
    assert "prompt" not in asked
    assert asked["output_type"] == "mesh"


def test_a_source_take_is_what_gives_a_generation_its_length() -> None:
    """
    Passing a duration beside one would crop or stretch what the person handed in.

    `_read_wave` is stood in for: it needs numpy and torch, and the gate installs neither —
    what it reads off a real file is proven by the end-to-end run.
    """
    import aidesktopstudio_engine.adapters.modalities as modalities

    original = modalities._read_wave
    modalities._read_wave = lambda path: f"tensor:{path}"
    try:
        asked = MODALITIES["audio"].kwargs(
            {"prompt": "a beat", "audio": "/project/take.wav", "seconds": 30}
        )
    finally:
        modalities._read_wave = original

    assert asked["src_audio"] == "tensor:/project/take.wav"
    assert asked["task_type"] == "cover"
    assert "audio_duration" not in asked


def test_ace_step_is_not_handed_a_negative_prompt() -> None:
    asked = kwargs_of("audio", negativePrompt="noise")

    assert "negative_prompt" not in asked


def test_a_take_without_one_keeps_the_duration_that_was_asked_for() -> None:
    asked = MODALITIES["audio"].kwargs({"prompt": "a beat", "seconds": 30})

    assert asked["audio_duration"] == 30.0
    assert "src_audio" not in asked
