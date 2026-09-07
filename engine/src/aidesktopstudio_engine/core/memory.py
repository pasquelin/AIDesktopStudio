"""
What the engine answers about memory — ADR-19 R1: a probe never admits a job, a runtime reading
does. If the engine cannot answer here, every verdict falls to `unknown` and admission stops
admitting.

The core holds no tensor library, so it holds no number of its own: it composes what each DOOR
reported. A door that never answered is absent rather than zero — the difference between "it holds
nothing" and "nobody asked" is what R1 is about.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class DoorMemory:
    """
    What one door holds, as the backend itself counts it.

    `held_bytes` is what the DRIVER took from the pot, never what the tensors weigh. Measured
    2026-08-22: a generation moved the driver by 5.67 GB while the allocator did not move at all,
    so counting tensors would under-report a door mid-generation by two thirds.
    """

    door: str
    held_bytes: int
    device: str
    backend: str

    def as_frame(self) -> dict[str, Any]:
        return {
            "door": self.door,
            "heldBytes": self.held_bytes,
            "device": self.device,
            "backend": self.backend,
        }


class MemoryLedger:
    """What each door last reported. Nothing is inferred, and nothing is added back."""

    def __init__(self) -> None:
        self._doors: dict[str, DoorMemory] = {}

    def record(self, reading: DoorMemory) -> None:
        self._doors[reading.door] = reading

    def forget(self, door: str) -> None:
        """A door that died holds nothing — and that is a MEASUREMENT, its process is gone."""
        self._doors.pop(door, None)

    def as_frame(self) -> dict[str, Any]:
        return {"doors": [reading.as_frame() for reading in self._doors.values()]}
