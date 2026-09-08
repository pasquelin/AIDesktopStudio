"""
What the door's environment HAS against what it was declared to need, without importing any of it.

The core holds no tensor library and must not gain one to answer this: `importlib.metadata` reads
a `.dist-info` on disk, never the package. `pyproject.toml` travels beside the sources so the
declaration has ONE home — a list copied into Python would drift from the one `uv` resolves.
"""

from __future__ import annotations

import re
import tomllib
from importlib.metadata import PackageNotFoundError, distribution, version
from pathlib import Path
from typing import Any

#: The extra a door needs to hold tensors at all. The `plugin` families add to it, never replace it.
DOOR_EXTRA = "diffusion"

PROJECT = Path(__file__).resolve().parents[3] / "pyproject.toml"


def _named(requirement: str) -> tuple[str, str]:
    """`torch>=2.6` → `("torch", ">=2.6")`. Markers and extras are not used by this project."""
    for cut, mark in enumerate(requirement):
        if mark in "<>=!~ ;[":
            return requirement[:cut].strip(), requirement[cut:].strip()
    return requirement.strip(), ""


def _release(text: str) -> tuple[int, ...]:
    numbers: list[int] = []
    for part in text.strip().split("."):
        leading = part[: len(part) - len(part.lstrip("0123456789"))]
        if not leading:
            break
        numbers.append(int(leading))
    return tuple(numbers)


def _satisfies(installed: str, specifier: str) -> bool:
    """
    **Blind spot, in clear**: release segments only. A pre-release, an epoch or a `~=` reads as its
    numbers, and `!=` is the one operator this project never writes. What it covers is what
    `pyproject.toml` actually declares — `>=` on every line, `==` on none.
    """
    here = _release(installed)
    for clause in (part.strip() for part in specifier.split(",") if part.strip()):
        if clause.startswith(">=") and here < _release(clause[2:]):
            return False
        if clause.startswith("=="):
            wanted = _release(clause[2:])
            if here[: len(wanted)] != wanted:
                return False
        if clause.startswith("<") and not clause.startswith("<=") and here >= _release(clause[1:]):
            return False
        if clause.startswith("<=") and here > _release(clause[2:]):
            return False
    return True


def declared(extra: str = DOOR_EXTRA) -> list[str]:
    """What `pyproject.toml` asks of that extra, verbatim. An unknown extra asks for nothing."""
    if not PROJECT.is_file():
        return []
    project = tomllib.loads(PROJECT.read_text(encoding="utf-8"))
    optional = project.get("project", {}).get("optional-dependencies", {})
    package = "ai-desktop-studio-engine"
    return [line for line in optional.get(extra, []) if not line.startswith(package)]


#: `torch/version.py` is GENERATED at build time and states what torch was built against:
#: `cuda: Optional[str] = None` on a CPU build, `= '12.6'` on a CUDA one. Verified 2026-09-08 on
#: the embedded 2.14.0 wheel. Read as text, so it imports nothing.
_TORCH_CUDA = re.compile(r"^cuda(?:\s*:[^=]*)?\s*=\s*(None|['\"])", re.MULTILINE)


def torch_cuda() -> bool | None:
    """
    Whether the INSTALLED torch was built with CUDA. `None` where it cannot be established.

    Not `torch.cuda.is_available()`, and not the wheel's local version either. The first costs an
    import — measured 2026-09-08, 1 317 ms and the core's 33 MB become 208 — and the core must
    stay free of it. The second is silent on exactly the machine this exists for: PyPI publishes
    its Windows CPU wheel with NO suffix, so `+cpu` would never appear where the card is an NVIDIA
    and the torch beside it cannot use it.

    **Blind spot, in clear**: `None` means UNKNOWN and never "no CUDA" — an unreadable or
    reshaped `version.py`, or a torch nobody installed, leaves the caller trusting the card.
    """
    try:
        stated = Path(distribution("torch").locate_file("torch/version.py")).read_text("utf-8")
    except (PackageNotFoundError, OSError):
        return None
    found = _TORCH_CUDA.search(stated)
    return None if found is None else found.group(1) != "None"


def survey(extra: str = DOOR_EXTRA) -> dict[str, Any]:
    """
    Three states, and the studio needs all three: absent, present but older than declared, ready.

    `declaration` is answered too — an environment can only be repaired against the list that
    named it, and the studio is the one that runs pip.
    """
    absent: list[dict[str, str]] = []
    stale: list[dict[str, str]] = []
    lines = declared(extra)

    for line in lines:
        name, specifier = _named(line)
        try:
            here = version(name)
        except PackageNotFoundError:
            absent.append({"name": name, "wanted": specifier})
            continue
        if specifier and not _satisfies(here, specifier):
            stale.append({"name": name, "wanted": specifier, "installed": here})

    return {
        "extra": extra,
        "declaration": lines,
        "absent": absent,
        "stale": stale,
        "complete": not absent and not stale,
        "torchCuda": torch_cuda(),
    }
