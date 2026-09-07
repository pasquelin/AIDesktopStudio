"""
What a modality asks a pipeline for, and how what comes back is written to a file.

The field names are the studio's, from `localFields.ts`. Which door serves which modality is
spelled in `protocol/doors.py`, and again in `DOORS_BY_LOADER` of `localRuntimes.ts` — the side that
names the door on every request. `localRuntimes.test.ts` is what holds the two in step.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from aidesktopstudio_engine.adapters.params import filled, knob, text

#: What a diffusers pipeline is asked, whatever the modality. The studio's own names on the left.
COMMON_KEYS = {
    "negativePrompt": "negative_prompt",
    "steps": "num_inference_steps",
    "cfgScale": "guidance_scale",
}


def _open_image(path: Any) -> Any:
    from diffusers.utils import load_image

    return load_image(str(path))


def _generator(params: dict[str, Any]) -> Any:
    """The seed on the CPU whatever the device: `torch.Generator("mps")` does not exist."""
    seed = filled(params, "seed")
    if seed is None:
        return None

    import torch

    return torch.Generator("cpu").manual_seed(int(seed))


def _shared_kwargs(params: dict[str, Any]) -> dict[str, Any]:
    kwargs: dict[str, Any] = {}
    prompt = text(params, "prompt")
    if prompt is not None:
        kwargs["prompt"] = prompt
    for ours, theirs in COMMON_KEYS.items():
        value = filled(params, ours)
        if value is not None:
            kwargs[theirs] = value

    generator = _generator(params)
    if generator is not None:
        kwargs["generator"] = generator
    return kwargs


def _sized_kwargs(params: dict[str, Any]) -> dict[str, Any]:
    kwargs = _shared_kwargs(params)
    for side in ("width", "height"):
        value = filled(params, side)
        if value is not None:
            kwargs[side] = int(value)
    return kwargs


def _image_kwargs(params: dict[str, Any]) -> dict[str, Any]:
    """
    Same knobs, plus the picture a generation edits. Size is dropped once a picture is there:
    the pipeline reads the dimensions off it, and passing both resizes unasked.
    """
    kwargs = _sized_kwargs(params)
    source = filled(params, "image")
    if source is None:
        return kwargs

    kwargs.pop("width", None)
    kwargs.pop("height", None)
    kwargs["image"] = _open_image(source)

    mask = filled(params, "mask")
    if mask is not None:
        kwargs["mask_image"] = _open_image(mask)

    strength = filled(params, "strength")
    # Refused by an inpainting pipeline that was handed no mask, and meaningless without a source.
    if strength is not None and mask is None:
        kwargs["strength"] = float(strength)
    return kwargs


def _video_kwargs(params: dict[str, Any]) -> dict[str, Any]:
    """A sequence replaces size and frame count. A still is I2V and keeps the size."""
    kwargs = _sized_kwargs(params)
    frames = filled(params, "frames")
    if frames is not None:
        kwargs["num_frames"] = int(frames)

    sequence = filled(params, "video")
    if sequence is not None:
        from diffusers.utils import load_video

        for read_off_the_source in ("width", "height", "num_frames"):
            kwargs.pop(read_off_the_source, None)
        kwargs["video"] = load_video(str(sequence))
        strength = filled(params, "strength")
        if strength is not None:
            kwargs["strength"] = float(strength)
        return kwargs

    still = filled(params, "image")
    if still is not None:
        kwargs["image"] = _open_image(still)
    return kwargs


def _read_wave(path: str) -> Any:
    """
    A take as the tensor a pipeline takes, `[channels, samples]`, through the standard library.

    🛑 **PCM WAV only, and nothing converts.** `soundfile` and `torchaudio` would each add a
    dependency and a licence for a header read here in ten lines — and what the studio itself
    writes for a sound IS a WAV, so a generation can always be reworked. A take imported from
    elsewhere in another container raises, and says which file it could not read.
    """
    import wave

    import numpy
    import torch

    with wave.open(path, "rb") as file:
        if file.getsampwidth() != 2:
            raise ValueError(f"not 16-bit PCM audio: {path}")
        channels = file.getnchannels()
        frames = numpy.frombuffer(file.readframes(file.getnframes()), dtype="<i2")

    samples = frames.reshape(-1, channels).T.astype("float32") / 32768.0
    return torch.from_numpy(samples)


def _audio_kwargs(params: dict[str, Any]) -> dict[str, Any]:
    """ACE-Step 1.5: `audio_duration` and `lyrics`. A source take is `src_audio`."""
    kwargs = _shared_kwargs(params)
    lyrics = text(params, "lyrics")
    if lyrics is not None:
        kwargs["lyrics"] = lyrics

    seconds = filled(params, "seconds")
    if seconds is not None:
        kwargs["audio_duration"] = float(seconds)

    kwargs.pop("negative_prompt", None)
    source = filled(params, "audio")
    if source is None:
        return kwargs

    kwargs.pop("audio_duration", None)
    kwargs["src_audio"] = _read_wave(str(source))
    kwargs["task_type"] = "cover"
    return kwargs


def _mesh_kwargs(params: dict[str, Any]) -> dict[str, Any]:
    """
    `mesh` and not the default `pil`: ShapE renders preview images unless asked for geometry.
    A picture REPLACES the prompt: ShapEImg2ImgPipeline raises if both are passed.
    """
    kwargs = {**_shared_kwargs(params), "output_type": "mesh"}
    source = filled(params, "image")
    if source is None:
        return kwargs

    kwargs.pop("prompt", None)
    kwargs.pop("negative_prompt", None)
    kwargs["image"] = _open_image(source)
    return kwargs


def _write_image(result: Any, destination: str, _params: dict[str, Any]) -> None:
    result.images[0].save(destination)


def _write_video(result: Any, destination: str, params: dict[str, Any]) -> None:
    from diffusers.utils import export_to_video

    export_to_video(result.frames[0], destination, fps=knob(params, "fps", int, 16))


def _write_audio(result: Any, destination: str, params: dict[str, Any]) -> None:
    """16-bit PCM via the stdlib. ACE-Step keeps `sample_rate` on the pipeline."""
    import wave

    import numpy

    held = result.audios[0]
    audio = held.detach().cpu().float().numpy() if hasattr(held, "detach") else numpy.asarray(held)
    frames = audio if audio.ndim == 1 else audio.T
    rate = getattr(result, "sampling_rate", None)
    if rate is None:
        rate = filled(params, "samplingRate")
    if rate is None:
        raise ValueError("audio has no sampling rate")
    with wave.open(destination, "wb") as file:
        file.setnchannels(1 if frames.ndim == 1 else frames.shape[1])
        file.setsampwidth(2)
        file.setframerate(int(rate))
        file.writeframes((numpy.clip(frames, -1.0, 1.0) * 32767).astype("<i2").tobytes())


def _write_mesh(result: Any, destination: str, _params: dict[str, Any]) -> None:
    from diffusers.utils import export_to_ply

    export_to_ply(result.images[0], destination)


def _skybox_kwargs(params: dict[str, Any]) -> dict[str, Any]:
    """A prompt is MultiDiffusion; a picture is FluxFill on a 2048x1024 canvas."""
    source = filled(params, "image")
    if source is None:
        return {**_sized_kwargs(params), "circular_padding": True}

    from aidesktopstudio_engine.adapters.skybox_fill import view_to_panorama

    kwargs = _shared_kwargs(params)
    wrapped, mask = view_to_panorama(_open_image(source))
    if not kwargs.get("prompt"):
        kwargs["prompt"] = "360 panorama"
    kwargs["image"] = wrapped
    kwargs["mask_image"] = mask
    # Read OFF the canvas: the pipeline is told the size of the picture it was handed.
    kwargs["width"], kwargs["height"] = wrapped.size
    return kwargs


@dataclass(frozen=True)
class Modality:
    """One modality, as a door practises it: what it asks for, and what it writes."""

    kwargs: Callable[[dict[str, Any]], dict[str, Any]]
    write: Callable[[Any, str, dict[str, Any]], None]


MODALITIES: dict[str, Modality] = {
    "image": Modality(_image_kwargs, _write_image),
    "video": Modality(_video_kwargs, _write_video),
    "audio": Modality(_audio_kwargs, _write_audio),
    "mesh": Modality(_mesh_kwargs, _write_mesh),
    "skybox": Modality(_skybox_kwargs, _write_image),
}
