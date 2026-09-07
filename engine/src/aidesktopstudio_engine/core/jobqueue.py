"""
The engine's TECHNICAL queue: what one worker holds, in which order, and what a cancel drops.

Named `jobqueue` and never `scheduler`, and it is the only MECHANICAL hold on the invariant that
the main process decides while the engine measures and executes — a file named "scheduler" ends up
becoming one, and two schedulers contradict each other on the one resource that matters.

It orders what ONE door holds. It arbitrates between none.
"""

from __future__ import annotations

import queue
import threading
from collections.abc import Iterator
from dataclasses import dataclass, field, replace
from typing import Any


@dataclass(frozen=True)
class Job:
    id: int
    op: str
    params: dict[str, Any] = field(default_factory=dict)
    """Set when the job was dropped before it ran. It is handed out anyway, to be answered."""
    cancelled: bool = False


class CancelledError(Exception):
    """Raised inside a running job when the studio asked for it to stop."""


class JobQueue:
    """
    First in, first out, drained by ONE thread.

    Serialising is the first material exception of § A.5: two jobs entering a door a cycle apart
    race on a device the main process cannot see. The worker serialises and SAYS so; it does not
    reorder, and it never touches another door.
    """

    def __init__(self) -> None:
        self._waiting: queue.SimpleQueue[Job | None] = queue.SimpleQueue()
        self._lock = threading.Lock()
        # What is queued but not yet handed out, so a cancel can drop it before it ever runs.
        self._pending: set[int] = set()
        self._running: int | None = None
        self._stop = threading.Event()

    def submit(self, job: Job) -> None:
        with self._lock:
            self._pending.add(job.id)
        self._waiting.put(job)

    def cancel(self, job_id: int) -> bool:
        """
        `True` when this queue knows the job — waiting or running.

        A waiting job is dropped before it costs anything; a running one is FLAGGED, and it is the
        job's own loop that notices. Nothing is killed from here: a device call does not interrupt.
        """
        with self._lock:
            if job_id in self._pending:
                self._pending.discard(job_id)
                return True
            if self._running == job_id:
                self._stop.set()
                return True
        return False

    def cancelled(self) -> bool:
        """Read by the running job, between two steps. Its own loop is what makes a cancel real."""
        return self._stop.is_set()

    def drain(self) -> Iterator[Job]:
        """
        Hands out what is waiting, blocking until there is something or the queue closes.

        A job cancelled while it waited is handed out MARKED rather than dropped: it costs no
        device time, and it still has to be answered or the studio waits for it for ever.
        """
        while True:
            job = self._waiting.get()
            if job is None:
                return

            with self._lock:
                dropped = job.id not in self._pending

            # A job cancelled while it waited still has to be ANSWERED: the studio holds the
            # promise of that job until a frame settles it, and dropping it in silence leaves a
            # caller waiting for ever. The ordinary case is a `generate` queued behind a cold
            # `import torch`, cancellable long before the job thread reaches it.
            if dropped:
                yield replace(job, cancelled=True)
                continue

            with self._lock:
                self._pending.discard(job.id)
                self._running = job.id

            try:
                yield job
            finally:
                with self._lock:
                    self._running = None
                    self._stop.clear()

    def close(self) -> None:
        self._waiting.put(None)
