# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
# Modified by IA Studio: local safetensors only; no registry, Hydra or pickle fallback.
"""Local checkpoint reader used by the denoiser's optional checkpoint constructor."""

from pathlib import Path
from safetensors.torch import load_file


def load_checkpoint_state_dict(ckpt_path: str | Path) -> dict:
    path = Path(ckpt_path)
    if path.suffix != ".safetensors":
        raise ValueError("the local motion engine requires a safetensors checkpoint")
    return load_file(str(path), device="cpu")
