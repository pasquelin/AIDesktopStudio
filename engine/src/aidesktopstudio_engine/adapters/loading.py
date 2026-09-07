"""What a load produces, and what it refuses. Neutral: no adapter is named here."""

from __future__ import annotations

import contextlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class LoadRefusedError(Exception):
    """The request is malformed, or names weights no adapter can open. Not a policy."""


@dataclass
class LoadedModel:
    model_id: str
    device: str
    pipeline: Any
    bytes_resident: int | None
    tensor_bytes: int | None
    load_ms: float
    takes_step_callback: bool
    default_steps: int


def refuse_reason(folder: str) -> str | None:
    """
    Read BEFORE any import: a refusal must not cost the 8.7 s `import torch` costs cold, and a
    `.py` beside local weights RUNS — spec § I.2, `trust_remote_code=False` does not stop it.
    """
    path = Path(folder)
    if not path.is_dir():
        return f"not a folder: {folder}"

    stray = sorted(entry.name for entry in path.rglob("*.py"))
    return f"the weights carry python: {', '.join(stray[:3])}" if stray else None


NEEDS_PROMPT = "a generation needs a prompt"
NEEDS_PICTURE = "a generation needs a picture"


def generation_refusal(kwargs: dict[str, Any]) -> str | None:
    """A prompt, or a source the modality already turned into a pipeline argument."""
    if kwargs.get("prompt") or any(key in kwargs for key in ("image", "video", "src_audio")):
        return None
    return NEEDS_PROMPT


def quietened(held: Any) -> Any:
    """
    tqdm writes to stderr, which the studio journals as an ERROR line: a twenty-step denoise files
    twenty for a job that went perfectly, and progress already travels as `job.progress`.

    `DiffusionPipeline.progress_bar` reads `_progress_bar_config` ALONE, so diffusers' logging
    switch never reached it, and every `from_pipe` builds a fresh object inheriting none of it —
    this is asked of the FINAL object a door keeps. A plugin hands back a dict of pipelines as
    often as a pipeline, hence the walk. **Blind spot**: `CraftsManPipeline` draws its own tqdm
    with `disable_prog=False` written into vendored code, and no keyword here reaches it.
    """
    if isinstance(held, dict):
        for inner in held.values():
            quietened(inner)
        return held

    configure = getattr(held, "set_progress_bar_config", None)
    if callable(configure):
        # Duck-typed across families this repo does not vendor: a different signature is a refusal
        # to be quiet, never a reason to fail a load that otherwise worked.
        with contextlib.suppress(TypeError):
            configure(disable=True)
    return held
