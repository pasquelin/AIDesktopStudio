"""What the backend answers about the device it runs on. Every number here is READ, none derived."""

from __future__ import annotations

from functools import cache
from typing import Any


@cache
def device() -> str:
    """
    The device REALLY used: a silent CPU fallback is indistinguishable from a slow machine.
    Cached — it cannot change while the process lives, and the reading thread asks mid-denoise.
    """
    import torch

    if torch.backends.mps.is_available():
        return "mps"
    return "cuda" if torch.cuda.is_available() else "cpu"


def tensor_bytes(on: str) -> int | None:
    """What the ALLOCATOR counts: live tensors. `None` where the backend does not answer."""
    import torch

    if on == "mps":
        return int(torch.mps.current_allocated_memory())
    if on == "cuda":
        return int(torch.cuda.memory_allocated())
    return None


def held_bytes(on: str) -> int | None:
    """
    What was taken FROM THE POT, cache included — the number admission needs.

    Measured 2026-08-22: a generation moved the driver by 5.67 GB while the allocator did not move
    at all, so counting tensors alone under-reports a door mid-generation by two thirds.
    """
    import torch

    if on == "mps":
        return int(torch.mps.driver_allocated_memory())
    if on == "cuda":
        # `(free, total)`, in that order — the reverse reads negative, which no admission survives.
        free, total = torch.cuda.mem_get_info()
        return int(total - free)
    return None


def machine_memory(on: str) -> dict[str, int | None]:
    """
    The pot itself. `freeBytes` is `None` on `mps`, and that is the measurement rather than a gap.

    Measured 2026-08-22 with the studio running and a viewport open: `recommended_max_memory()`
    answered 83.49 GB unchanged while `vm_stat` showed **319 MB actually free** at the peak.
    Metal's ceiling is what THIS PROCESS may take, never what the machine has left — deriving
    `total - held` from it would have told admission 68 GB were free while the machine was at its
    knees. On `unified` the viewport draws from the same pot and no backend counter sees it, which
    is exactly what `MemorySnapshot.rendererReservedBytes` exists for.

    `unifiedBytes` MEASURES the domain: greater than zero on a SoC, zero on a dedicated card.
    """
    import torch

    if on == "mps":
        ceiling = int(torch.mps.recommended_max_memory())
        return {"totalBytes": ceiling, "freeBytes": None, "unifiedBytes": ceiling}
    if on == "cuda":
        # A dedicated card has its own pot, and `mem_get_info` answers for the DEVICE rather than
        # for this process — `[?]` never run here, no such machine.
        free, total = torch.cuda.mem_get_info()
        return {"totalBytes": int(total), "freeBytes": int(free), "unifiedBytes": 0}
    return {"totalBytes": None, "freeBytes": None, "unifiedBytes": None}


def release_cache() -> None:
    """Asks the allocator for the cache back. ADR-19: the figure is what we RE-READ afterwards."""
    import gc

    gc.collect()
    try:
        import torch
    except ImportError:
        return
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()
    elif torch.cuda.is_available():
        torch.cuda.empty_cache()


def costs(door: str, on: str, backend: str) -> dict[str, Any]:
    """
    What a door holds, as the ledger reads it. `heldBytes` and `tensorBytes` are the names it
    reads: a third spelling is dropped in silence by a zod object that does not name it.
    """
    return {
        "door": door,
        "device": on,
        "backend": backend,
        "heldBytes": held_bytes(on),
        "tensorBytes": tensor_bytes(on),
    }


def memory_frame(door: str, on: str, backend: str) -> dict[str, Any]:
    """What a door answers for `memory.info`."""
    return {**costs(door, on, backend), "machine": machine_memory(on)}


def result_frame(
    door: str, on: str, backend: str, destination: str, generate_ms: float
) -> dict[str, Any]:
    """What a generation answers, whichever adapter ran it."""
    return {
        **costs(door, on, backend),
        "path": destination,
        "generateMs": round(generate_ms, 1),
    }
