"""
What every worker is: a process that answers the engine over an inherited socket, pays the import
cost of its backend ONCE, and **keeps reading while a job runs**.

That last part is the whole shape of this file. A denoise holds the interpreter for seconds; a
worker that ran it on its reading thread would not see a cancel, a status or an unload until the
job it was asked to stop had finished — which is invariant 6 of `CLAUDE.md` broken in the one place
it matters most.
"""

from __future__ import annotations

import contextlib
import socket
import threading
from collections.abc import Callable, Mapping
from typing import Any

from aidesktopstudio_engine import PROTOCOL_VERSION, __version__
from aidesktopstudio_engine.core.jobqueue import Job, JobQueue
from aidesktopstudio_engine.protocol.envelope import (
    CANCEL_OP,
    EnvelopeError,
    decode_request,
    encode_error,
    encode_event,
    encode_ok,
    frames,
)

Handler = Callable[[dict[str, Any]], Any]


def worker_hello(door: str, backend: str, occupancy: dict[str, Any]) -> str:
    """
    A worker names its DOOR, not its runtime: that is what keys `MemorySnapshot.runtimeBytes`.

    Occupancy is ANNOUNCED and never compiled: it depends on the backend, the adapter, the model
    and the machine, and the main process knows none of the four. It reads, orders and decides.
    """
    return encode_event(
        "worker.hello",
        door=door,
        engine=__version__,
        protocol=PROTOCOL_VERSION,
        backend=backend,
        occupancy=occupancy,
    )


class WorkerLoop:
    """
    One reading thread, one job thread, one queue between them.

    `inline` answers in the reading turn — a status, a memory reading, nothing that touches the
    device. `queued` goes through the queue, which serialises the device (§ A.5, exception 1).
    """

    def __init__(
        self,
        connection: socket.socket,
        greeting: str,
        inline: Mapping[str, Handler],
        # A factory rather than a table: a queued handler needs to push progress and to read the
        # cancel flag, and both belong to the loop it is about to be given to.
        queued: Callable[[WorkerLoop], Mapping[str, Handler]],
    ) -> None:
        self._connection = connection
        self._greeting = greeting
        self._inline = inline
        self.queue = JobQueue()
        self._writing = threading.Lock()
        self._queued = queued(self)

    def send(self, line: str) -> None:
        # The reading thread and the job thread both answer, and a frame written half way through
        # another is not a frame — NDJSON has no way back from an interleave.
        # A door closed while a job was still stepping: raised on the job thread it would read as
        # a crash, where it is an ordinary shutdown.
        with self._writing, contextlib.suppress(OSError):
            self._connection.sendall(line.encode("utf-8"))

    def _work(self) -> None:
        for job in self.queue.drain():
            if job.cancelled:
                self.send(encode_error(job.id, "cancelled", "the job was cancelled before it ran"))
                continue

            handler = self._queued[job.op]
            try:
                self.send(encode_ok(job.id, handler(job.params)))
            except Exception as error:
                self.send(encode_error(job.id, _code_of(error), str(error)))

    def run(self) -> None:
        self.send(self._greeting)
        worker = threading.Thread(target=self._work, daemon=True)
        worker.start()

        try:
            for line in frames(iter(lambda: self._connection.recv(65536), b"")):
                self._read(line)
        finally:
            self.queue.close()
            worker.join(timeout=30)
            self._connection.close()

    def _read(self, line: str) -> None:
        try:
            request = decode_request(line)
        except EnvelopeError as error:
            self.send(encode_event("runtime.error", message=str(error)))
            return

        if request.op == CANCEL_OP:
            # Answered from the READING thread, whatever the job thread is doing: that is the
            # point of the split. A job it does not hold is a fact, not a failure.
            known = self.queue.cancel(int(request.params.get("run", request.id)))
            self.send(encode_ok(request.id, {"cancelled": known}))
            return

        if request.op in self._queued:
            self.queue.submit(Job(id=request.id, op=request.op, params=request.params))
            return

        handler = self._inline.get(request.op)
        if handler is None:
            self.send(encode_error(request.id, "unknown-op", f"no such op: {request.op}"))
            return

        try:
            self.send(encode_ok(request.id, handler(request.params)))
        except Exception as error:
            self.send(encode_error(request.id, _code_of(error), str(error)))


def _code_of(error: Exception) -> str:
    """`cancelled` travels as its own code: a stopped job is not a failed one on any screen."""
    return "cancelled" if type(error).__name__ == "CancelledError" else "failed"
