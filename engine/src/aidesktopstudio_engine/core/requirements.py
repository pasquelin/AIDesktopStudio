"""
What the door's environment HAS against what it was declared to need, without importing any of it.

The core holds no tensor library and must not gain one to answer this: `importlib.metadata` reads
a `.dist-info` on disk, never the package. `pyproject.toml` travels beside the sources so the
declaration has ONE home — a list copied into Python would drift from the one `uv` resolves.
"""

from __future__ import annotations

import tomllib
from importlib.metadata import PackageNotFoundError, version
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


def torch_build() -> str | None:
    """
    Which build torch was compiled as, read off its LOCAL version: `cpu`, `cu126`, `rocm7.14`…

    `None` where torch is absent, and `None` too where the wheel names no build at all — those are
    the same answer for the studio: unknown. macOS and the default PyPI Linux wheel carry no
    suffix, so reading that absence as "no CUDA" would take every CUDA plugin away from a Linux
    machine that has a card. Only an explicit `+cpu` is a certain no.

    Read and not imported, like everything else here: measured 2026-09-08 on the embedded runtime,
    `import torch` costs 1 317 ms and takes the core from 33 MB to 208.
    """
    try:
        return version("torch").partition("+")[2] or None
    except PackageNotFoundError:
        return None


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
        "torchBuild": torch_build(),
    }
