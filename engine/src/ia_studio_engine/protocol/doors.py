"""
Every door there is, and the modality it serves — protocol vocabulary, like `CANCEL_OP`, read by
regex across the frontier. Beside the envelope rather than under `workers/`, the one package the
core must never import.
"""

from __future__ import annotations

DOORS: dict[str, str] = {
    "engine/diffusion": "image",
    "engine/video": "video",
    "engine/audio": "audio",
    "engine/3d": "mesh",
    "engine/skybox": "skybox",
    "engine/selection": "selection",
}

SPECIAL_DOORS = frozenset({"engine/selection"})
