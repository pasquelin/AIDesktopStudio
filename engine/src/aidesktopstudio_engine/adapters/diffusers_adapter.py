"""
Our code, translating the studio's contract into a Diffusers pipeline. It is not the deserialisation
path — that is `loader`, one level below — and it applies no admission policy: the request it is
given was already admitted by the main process, and it refuses anything else as malformed.

Three refusals are wired here rather than trusted to a default, and each was measured on
2026-08-22 (spec § I.2): `use_safetensors=True` refuses instead of falling back to a pickle ·
`torch.load` has refused pickles by default since PyTorch 2.6 · and `trust_remote_code` does NOT
guard a local folder whose architecture Transformers knows, so passing `False` is necessary and
never sufficient — what protects is the manifest listing every file that reaches the disk.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from aidesktopstudio_engine.adapters.device import (
    device,
    held_bytes,
    release_cache,
    result_frame,
    tensor_bytes,
)
from aidesktopstudio_engine.adapters.loading import (
    LoadedModel,
    LoadRefusedError,
    generation_refusal,
    quietened,
    refuse_reason,
)
from aidesktopstudio_engine.adapters.modalities import MODALITIES, Modality
from aidesktopstudio_engine.core.jobqueue import CancelledError


def call_parameters(pipeline: Any) -> Any:
    """
    What `__call__` declared, and `None` when there is no signature to read.

    The two are different answers: unreadable means every argument goes through, empty means none
    does. One falsy value for both let a filter pass what a pipeline never declared.
    """
    import inspect

    try:
        return inspect.signature(pipeline.__call__).parameters
    except (TypeError, ValueError, AttributeError):
        return None


def _default_steps(pipeline: Any) -> int:
    """
    What the pipeline runs when the form left the field empty — StableAudio runs 100 where a
    literal 20 was assumed, and the reported ratio then climbs to five.
    """
    asked = (call_parameters(pipeline) or {}).get("num_inference_steps")
    return asked.default if asked is not None and isinstance(asked.default, int) else 20


def _takes_step_callback(pipeline: Any) -> bool:
    """
    🛑 A cancel lands on `callback_on_step_end` and nowhere else. Read, since `ShapEPipeline`
    does not take one and passing it raises `TypeError`.
    """
    return "callback_on_step_end" in (call_parameters(pipeline) or {})


#: Which pipeline reworks a sequence, by the one that was loaded — a table because diffusers
#: publishes no `AutoPipelineForVideoToVideo`. A model absent here simply serves no such
#: employment, and `_wanted_class` answers nothing rather than deriving something wrong.
VIDEO_TO_VIDEO = {
    "CogVideoXPipeline": "CogVideoXVideoToVideoPipeline",
    "WanPipeline": "WanVideoToVideoPipeline",
    "WanImageToVideoPipeline": "WanVideoToVideoPipeline",
    "MochiPipeline": "MochiVideoToVideoPipeline",
}


def accepted_kwargs(pipeline: Any, kwargs: dict[str, Any]) -> dict[str, Any]:
    """Drop arguments the resident class did not declare — a T2V still must not become TypeError."""
    import inspect

    parameters = call_parameters(pipeline)
    if parameters is None:
        return kwargs
    if any(item.kind is inspect.Parameter.VAR_KEYWORD for item in parameters.values()):
        return kwargs
    return {key: value for key, value in kwargs.items() if key in parameters}


def tune_pipeline(pipeline: Any) -> None:
    """Slicing and tiling keep the peak in RAM. Slicing: +50 ms / 2 % on Sana 600M."""
    for knob in ("enable_attention_slicing", "enable_vae_slicing", "enable_vae_tiling"):
        enable = getattr(pipeline, knob, None)
        if callable(enable):
            enable()


#: Where fp16 is a real kernel path. Anything else reads as CPU and stays wide, on purpose.
NARROW_DEVICES = frozenset({"mps", "cuda"})


def compute_dtype_name(on: str) -> str:
    """
    The compute dtype FOLLOWS the device, and `variant` does not decide it.

    PyTorch covers fp16 poorly on the CPU: half kernels are missing — `addmm_impl_cpu_ not
    implemented for 'Half'` — or fall back to a path slower than fp32. A name rather than a
    `torch.dtype` so the choice is testable in an environment with no torch, which `engine/tests`
    is. An unknown device reads as CPU: fp32 runs everywhere, fp16 does not.
    """
    return "float16" if on in NARROW_DEVICES else "float32"


def _attached(pipeline: Any, attachment: dict[str, Any], on: str) -> Any:
    """
    Weights grafted onto the pipeline that is already resident, never a second pipeline.

    A ControlNet is a network run BESIDE the pipeline's own, so it changes the class; an
    IP-Adapter is grafted onto the attention of the one already there, so it does not.
    """
    import torch
    from diffusers import AutoPipelineForText2Image, ControlNetModel

    if attachment["as"] == "ip-adapter":
        pipeline.load_ip_adapter(
            attachment["folder"],
            subfolder=attachment.get("subfolder") or "",
            weight_name=attachment.get("weight_name") or "",
        )
        return pipeline

    control = ControlNetModel.from_pretrained(
        attachment["folder"],
        use_safetensors=True,
        local_files_only=True,
        dtype=getattr(torch, compute_dtype_name(on)),
    ).to(on)
    return AutoPipelineForText2Image.from_pipe(pipeline, controlnet=control)


def pretrained_file_kwargs(torch_weights: bool, folder: str | None = None) -> dict[str, bool | str]:
    """Which weight FILES to open. Shap-E's `.bin` renderer has no `fp16` sibling."""
    files: dict[str, bool | str] = {
        "use_safetensors": not torch_weights,
        "trust_remote_code": False,
        "local_files_only": True,
    }
    if torch_weights:
        return files
    # FluxFill ships `model.safetensors` with no `.fp16` twin. Asking for the variant then
    # refuses a complete folder.
    if folder is None or any(Path(folder).rglob("*.fp16.safetensors")):
        files["variant"] = "fp16"
    return files


def pretrained_optional_overrides(folder: str) -> dict[str, None]:
    """Skip a safety checker the index names when the folder did not fetch it."""
    root = Path(folder)
    index_path = root / "model_index.json"
    if not index_path.is_file():
        return {}
    try:
        index = json.loads(index_path.read_text())
    except json.JSONDecodeError:
        return {}
    checker = index.get("safety_checker")
    if not isinstance(checker, list) or not checker or checker[0] is None:
        return {}
    if (root / "safety_checker").is_dir():
        return {}
    return {"safety_checker": None}


class DiffusersAdapter:
    """Holds at most one pipeline. What it holds and what it costs are ANSWERED, never guessed."""

    def __init__(self, modality: Modality) -> None:
        # A door serves ONE modality, and it is handed in rather than read off a request: the
        # process that imports a video backend is not the one a release plan kills for an image.
        self.modality = modality
        self.loaded: LoadedModel | None = None
        # Pipelines derived from the loaded one by `from_pipe`. They SHARE its components, so
        # they cost no weights — dropped with it, or they would hold a model an unload freed.
        self._derived: dict[str, Any] = {}

    def backend(self) -> str:
        return "pytorch"

    def device(self) -> str:
        return device()

    def load(
        self,
        model_id: str,
        folder: str,
        torch_weights: bool = False,
        attachment: dict[str, Any] | None = None,
    ) -> LoadedModel:
        refusal = refuse_reason(folder)
        if refusal is not None:
            raise LoadRefusedError(refusal)

        self.unload()
        on = device()
        started = time.perf_counter_ns()
        pipeline = self._open_pipeline(folder, torch_weights, on)

        if attachment is not None:
            pipeline = _attached(pipeline, attachment, on)

        tune_pipeline(quietened(pipeline))
        load_ms = (time.perf_counter_ns() - started) / 1e6

        self.loaded = LoadedModel(
            model_id=model_id,
            device=on,
            pipeline=pipeline,
            bytes_resident=held_bytes(on),
            tensor_bytes=tensor_bytes(on),
            load_ms=load_ms,
            takes_step_callback=_takes_step_callback(pipeline),
            default_steps=_default_steps(pipeline),
        )
        return self.loaded

    def _open_pipeline(self, folder: str, torch_weights: bool, on: str) -> Any:
        import torch
        from diffusers import DiffusionPipeline
        from diffusers.utils import logging as diffusers_logging

        # Diffusers' OWN logging tqdm — the loading bars. It does NOT reach a denoise: the pipeline
        # draws that one through `pipeline_utils.progress_bar`, which reads `_progress_bar_config`
        # and nothing else. `quietened` is what covers it, on every pipeline a door holds.
        diffusers_logging.disable_progress_bar()

        # `variant` picks which FILES are read; it does NOT set the compute dtype. Measured
        # 2026-08-22 on Sana 600M: with `variant="fp16"` alone the transformer and the VAE came
        # back `float32`, and only the text encoder was narrow. `dtype` is what makes it 3.21 Md
        # parameters at two bytes rather than four — where the device has half kernels at all.
        # The variant stays fp16 on the CPU too: reading the narrow files and widening them at load
        # costs nothing and spares a second download of the same weights.
        pipeline = DiffusionPipeline.from_pretrained(
            folder,
            **pretrained_file_kwargs(torch_weights, folder),
            **pretrained_optional_overrides(folder),
            dtype=getattr(torch, compute_dtype_name(on)),
        ).to(on)

        if (
            self.modality is MODALITIES["skybox"]
            and type(pipeline).__name__ == "StableDiffusionPipeline"
        ):
            from diffusers import StableDiffusionPanoramaPipeline

            pipeline = StableDiffusionPanoramaPipeline.from_pipe(pipeline)

        return pipeline

    def unload(self) -> None:
        """Drops the pipeline object, then asks the cache. ADR-19: the figure is what we re-read."""
        held = self.loaded
        self.loaded = None
        self._derived.clear()
        if held is None:
            return

        held.pipeline = None
        release_cache()

    def _wanted_class(self, held: LoadedModel, kwargs: dict[str, Any]) -> Any:
        """Choose the derived pipeline required by the supplied arguments."""
        if "video" in kwargs:
            import diffusers

            wanted = VIDEO_TO_VIDEO.get(type(held.pipeline).__name__)
            return getattr(diffusers, wanted, None) if wanted else None

        # Image employments only. A mesh picture is Shap-E; a video picture is I2V — neither
        # is `AutoPipelineForImage2Image`. Import stays below: the gate has no diffusers.
        if "image" not in kwargs:
            return None
        if self.modality is MODALITIES["skybox"]:
            if "mask_image" not in kwargs:
                return None
            if "mask_image" in (call_parameters(held.pipeline) or {}):
                return None
            raise LoadRefusedError("this panorama model does not take a source image")
        if self.modality is not MODALITIES["image"]:
            return None

        import diffusers

        return (
            diffusers.AutoPipelineForInpainting
            if "mask_image" in kwargs
            else diffusers.AutoPipelineForImage2Image
        )

    def _for(self, held: LoadedModel, kwargs: dict[str, Any]) -> Any:
        """
        The pipeline the arguments call for, DERIVED from the one that is loaded.

        `from_pipe` reuses the components already resident rather than reading the weights again:
        one download, one residency, several employments.
        """
        wanted = self._wanted_class(held, kwargs)
        if wanted is None:
            return held.pipeline

        derived = self._derived.get(wanted.__name__)
        if derived is None:
            derived = quietened(wanted.from_pipe(held.pipeline))
            self._derived[wanted.__name__] = derived
        return derived

    def generate(
        self,
        params: dict[str, Any],
        destination: str,
        door: str,
        on_step: Callable[[int, int], None] | None = None,
        stopping: Callable[[], bool] | None = None,
    ) -> dict[str, Any]:
        """Writes a file and answers its PATH: a control frame that grows cannot be replayed."""
        held = self.loaded
        if held is None:
            raise LoadRefusedError("no model is loaded")

        kwargs = self.modality.kwargs(params)
        refusal = generation_refusal(kwargs)
        if refusal is not None:
            raise LoadRefusedError(refusal)

        steps = int(kwargs.get("num_inference_steps", held.default_steps))

        def between_steps(_pipeline: Any, step: int, _timestep: Any, state: dict) -> dict:
            """The only place a cancel can land — a device call does not interrupt (Invariant 6)."""
            if stopping is not None and stopping():
                raise CancelledError("the generation was cancelled")
            if on_step is not None:
                on_step(step + 1, steps)
            return state

        pipeline = self._for(held, kwargs)
        if held.takes_step_callback:
            kwargs["callback_on_step_end"] = between_steps
        kwargs = accepted_kwargs(pipeline, kwargs)

        started = time.perf_counter_ns()
        result = pipeline(**kwargs)
        generate_ms = (time.perf_counter_ns() - started) / 1e6

        write_params = dict(params)
        sample_rate = getattr(pipeline, "sample_rate", None)
        if sample_rate is not None:
            write_params["samplingRate"] = int(sample_rate)
        self.modality.write(result, destination, write_params)
        return result_frame(door, held.device, self.backend(), destination, generate_ms)

    def auto_rig(
        self,
        params: dict[str, Any],
        destination: str,
        door: str,
        on_phase: Callable[[int, int, str], None],
        stopping: Callable[[], bool],
    ) -> dict[str, Any]:
        del params, destination, door, on_phase, stopping
        raise LoadRefusedError("the loaded model does not support Auto Rig")
