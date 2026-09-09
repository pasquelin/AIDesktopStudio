"""
The stand-in worker both router suites drive, and the router wired to it.

Not a `test_` module and not a fixture: the cases build several harnesses each, and read them as
plain values. Shared because the copy cost was paid once already — `wait_closed` gained its
timeout argument and both copies had to learn it.
"""

import json
import threading
from typing import Any

from aidesktopstudio_engine.core.router import DoorRouter

IMAGE_DOOR = "engine/diffusion"
#: Every request names its door — the studio does, and `submit` refuses one that does not.
DOOR = {"door": IMAGE_DOOR}


class StandInWorker:
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []
        self._next = 1
        #: Set by a case that needs a process still leaving while the caller carries on.
        self.leaving: threading.Event | None = None

    def next_run(self) -> int:
        run = self._next
        self._next += 1
        return run

    def send(self, request: dict[str, Any]) -> None:
        self.sent.append(request)

    def start(self) -> None:
        self.started = True

    def begin_close(self) -> None:
        self.closed = True

    def wait_closed(self, timeout: float = 10) -> None:
        self.waited = timeout
        if self.leaving is not None:
            self.leaving.wait(timeout)


def harness() -> tuple[DoorRouter, list[dict], list[StandInWorker]]:
    written: list[dict] = []
    workers: list[StandInWorker] = []
    answered: dict[str, Any] = {}
    left: dict[str, Any] = {}

    def spawn(door, on_frame, on_gone):
        worker = StandInWorker()
        worker.door = door
        workers.append(worker)
        answered[door] = on_frame
        left[door] = on_gone
        return worker

    router = DoorRouter(lambda line: written.append(json.loads(line)), spawn)
    # The image door unless a case says otherwise — a convenience of this harness, not a default
    # the router has: `submit` refuses a request that names no door.
    router.said = lambda frame, door=IMAGE_DOOR: answered[door](frame)  # type: ignore[attr-defined]
    router.door_died = lambda door=IMAGE_DOOR: left[door]()  # type: ignore[attr-defined]
    return router, written, workers
