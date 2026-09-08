"""
Hands a request to the door that can answer it. The core decides nothing here: the door travels
ON the request, because only the main process knows which model was picked for which employment.
"""

from __future__ import annotations

import json
import threading
from collections.abc import Callable
from typing import Any

from aidesktopstudio_engine import PROTOCOL_VERSION
from aidesktopstudio_engine.core.memory import DoorMemory, MemoryLedger
from aidesktopstudio_engine.core.workers import WorkerProcess
from aidesktopstudio_engine.protocol.doors import DOORS
from aidesktopstudio_engine.protocol.envelope import CANCEL_OP, encode_event

#: The single module every door runs; which door it is travels as its first argument. Named here
#: because the core is the only side that builds an argv.
DOOR_MODULE = "aidesktopstudio_engine.workers.door"

#: How long closing ONE door waits before killing it. Under the studio's `REQUEST_TIMEOUT_MS` of
#: 5 s on purpose: a client that gave up would kill the whole engine to free a single door.
CLOSE_WAIT_S = 3

Send = Callable[[str], None]
Spawn = Callable[[str, Callable[[dict], None], Callable[[], None]], WorkerProcess]


class DoorRouter:
    """Doors, started on first ask. A worker that never had to run is one that costs nothing."""

    def __init__(self, send: Send, spawn: Spawn, ledger: MemoryLedger | None = None) -> None:
        self._send = send
        self._spawn = spawn
        self.ledger = ledger if ledger is not None else MemoryLedger()
        self._workers: dict[str, WorkerProcess] = {}
        self._lock = threading.Lock()
        # Which JOB each run belongs to, keyed by the door that numbers it: two doors number
        # from 1 apiece. Read by a pump thread and written by the loop, hence the lock.
        self._runs: dict[tuple[str, int], str] = {}

    def _worker_said(self, door: str, frame: dict[str, Any]) -> None:
        # An EVENT belongs to no run and is passed straight through: `job.progress` is the only
        # thing a job says while it runs, and a router that only knew about answers dropped it.
        if "evt" in frame:
            self._send(json.dumps({**frame, "v": PROTOCOL_VERSION}, separators=(",", ":")) + "\n")
            return

        run = frame.get("id")
        with self._lock:
            job = self._runs.pop((door, run), None) if isinstance(run, int) else None
        if job is None:
            return

        if "err" in frame:
            failure = frame["err"]
            self._send(
                encode_event(
                    "job.failed", job=job, code=failure["code"], message=failure["message"]
                )
            )
            return

        answer = frame.get("ok") or {}
        # Every door answer carries what it holds NOW, so the ledger follows a load, a generation
        # and an unload without a second round trip asking.
        if isinstance(answer, dict) and "heldBytes" in answer:
            self._remember(door, answer)

        self._send(encode_event("job.completed", job=job, **answer))

    def _remember(self, door: str, answer: dict[str, Any]) -> None:
        held = answer.get("heldBytes")
        # ADR-19 R1: no answer is absence, not zero. Zero after unload is measured absence,
        # so the door is forgotten. `device`/`backend` are required when bytes remain —
        # an unload omitting them would replace a good record with empty strings.
        device = answer.get("device")
        backend = answer.get("backend")
        if not isinstance(held, int):
            return

        # The door is the one this frame CAME FROM, never the one it names: `_worker_said` is
        # closed over it. Reading the payload filed a video door's gigabytes under an image door,
        # and the main reads this ledger to decide what to release.
        if held == 0:
            self.ledger.forget(door)
            return
        if not isinstance(device, str) or not isinstance(backend, str):
            return

        self.ledger.record(DoorMemory(door=door, held_bytes=held, device=device, backend=backend))

    def _abandon(self, door: str, why: str) -> WorkerProcess | None:
        """
        Takes the door out of the router and FAILS every job it was holding, whatever took it out.

        § A.5 exception 2: the worker abandons and reports. It does not unload another door and
        try again. Its process is gone, or is on its way out, so it holds nothing — measured.
        """
        with self._lock:
            worker = self._workers.pop(door, None)
            orphans = [self._runs.pop(key) for key in list(self._runs) if key[0] == door]
        self.ledger.forget(door)

        for job in orphans:
            self._send(encode_event("job.failed", job=job, code="door-gone", message=why))
        return worker

    def _worker_left(self, door: str) -> None:
        self._abandon(door, "the door died")

    def close_door(self, door: str) -> dict[str, Any]:
        """
        Ends ONE door's process, where `models.unload` only hands its tensors back.

        Answered by the CORE and never routed: a door stuck inside its own `import torch` would
        never read the frame asking it to leave. Its next request reopens it through `_live`.

        🛑 `_abandon` is what settles the jobs in flight, and it must run: `begin_close` sets
        `_closing`, so the pump will NOT call `_on_gone` and `_worker_left` never runs for a door
        that was closed on purpose. Without it, every job in flight waits for ever on the studio.
        """
        if door not in DOORS:
            raise ValueError(f"no such door: {door!r}")

        worker = self._abandon(door, "the door was closed")
        if worker is None:
            return {"closed": False}

        worker.begin_close()
        worker.wait_closed(timeout=CLOSE_WAIT_S)
        return {"closed": True}

    def _live(self, door: str) -> WorkerProcess:
        with self._lock:
            worker = self._workers.get(door)
        if worker is not None:
            return worker

        # OUTSIDE the lock: spawning forks and execs an interpreter, and the pump of every door
        # already alive takes this same lock to settle its runs — opening one door would freeze
        # the answers of the other three.
        opened = self._spawn(
            door,
            lambda frame: self._worker_said(door, frame),
            lambda: self._worker_left(door),
        )
        with self._lock:
            self._workers[door] = opened
        # Registered BEFORE it can answer: a door that dies at import would otherwise report
        # itself gone while there was nothing yet to forget, and be recorded dead a moment later.
        opened.start()
        return opened

    def submit(self, op: str, params: dict[str, Any], job: str) -> dict[str, Any]:
        """
        Answers IMMEDIATELY with the job it opened. Waiting for a load or a generation would hold
        the core's loop, and the studio would have no way to cancel what it started.
        """
        # Refused rather than started, and no door is privileged: falling back to the image door
        # routed a malformed request somewhere plausible, and spawning a door that does not exist
        # forks a process that dies at once — read from the journal as a crash, not a misspelling.
        door = params.get("door")
        if not isinstance(door, str) or door not in DOORS:
            raise ValueError(f"no such door: {door!r}")

        worker = self._live(door)
        run = worker.next_run()
        with self._lock:
            self._runs[(door, run)] = job
        worker.send({"v": PROTOCOL_VERSION, "id": run, "op": op, "params": params})
        return {"jobId": job}

    def cancel(self, job: str) -> dict[str, Any]:
        """
        Asks the door to drop a job, BY JOB — the studio never learns a door's own numbering.
        Answered here, not queued: a cancel that waited behind the job it stops would be useless.
        """
        with self._lock:
            key = next((one for one, held in self._runs.items() if held == job), None)
            worker = self._workers.get(key[0]) if key is not None else None

        if key is None or worker is None:
            return {"cancelled": False}

        # A run of its OWN, and never the one it stops: reusing that number makes the door answer
        # the cancel under the job's id, which settles the job as completed and drops the
        # `cancelled` error that follows. Measured — it read as a success on the first try.
        worker.send(
            {
                "v": PROTOCOL_VERSION,
                "id": worker.next_run(),
                "op": CANCEL_OP,
                "params": {"run": key[1]},
            }
        )
        return {"cancelled": True}

    def close(self) -> None:
        with self._lock:
            doors = list(self._workers)

        # Through the same helper as a targeted close, so a job in flight hears `door-gone` on the
        # way out of the studio too rather than being cut off in silence.
        gone = [self._abandon(door, "the engine is leaving") for door in doors]
        leaving = [worker for worker in gone if worker is not None]

        # Asked to leave first, waited on second, and the split is what keeps the waits
        # OVERLAPPING: a worker mid-inference does not read its socket, so `wait` may burn its
        # whole timeout — four in a row is four times that, paid on the way out of the studio.
        for worker in leaving:
            worker.begin_close()

        for worker in leaving:
            worker.wait_closed()


def spawn_door(
    door: str, on_frame: Callable[[dict], None], on_gone: Callable[[], None]
) -> WorkerProcess:
    return WorkerProcess(DOOR_MODULE, door, on_frame, on_gone)
