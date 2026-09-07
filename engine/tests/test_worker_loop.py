"""
The half of a worker that has nothing to do with tensors: does it still answer while a job runs?

That question is the whole reason the loop has two threads, and nothing here imports torch — a
`threading.Event` stands in for a denoise, and it holds exactly as well.
"""

import json
import socket
import threading
from typing import Any

from aidesktopstudio_engine import PROTOCOL_VERSION
from aidesktopstudio_engine.workers.base import WorkerLoop


def ask(op: str, request_id: int, **params: Any) -> bytes:
    return (
        json.dumps({"v": PROTOCOL_VERSION, "id": request_id, "op": op, "params": params}) + "\n"
    ).encode("utf-8")


class Harness:
    def __init__(self, queued_from) -> None:
        self.ours, theirs = socket.socketpair()
        self.loop = WorkerLoop(theirs, json.dumps({"evt": "worker.hello"}) + "\n", {}, queued_from)
        self.thread = threading.Thread(target=self.loop.run, daemon=True)
        self.thread.start()

    def send(self, payload: bytes) -> None:
        self.ours.sendall(payload)

    def frames(self, count: int) -> list[dict]:
        read: list[dict] = []
        pending = b""
        while len(read) < count:
            pending += self.ours.recv(65536)
            while b"\n" in pending:
                line, pending = pending.split(b"\n", 1)
                if line.strip():
                    read.append(json.loads(line))
        return read

    def close(self) -> None:
        self.ours.close()
        self.thread.join(timeout=5)


def test_answers_a_status_while_a_job_is_running() -> None:
    """A denoise holds the interpreter for seconds, and a worker blind that long is unsupervised."""
    running = threading.Event()
    release = threading.Event()

    def queued(loop: WorkerLoop) -> dict:
        def slow(_params: dict) -> dict:
            running.set()
            release.wait(timeout=5)
            return {"done": True}

        return {"generate": slow}

    held = Harness(queued)
    held.loop._inline["worker.status"] = lambda _params: {"alive": True}
    held.send(ask("generate", 1))
    assert running.wait(timeout=5)

    held.send(ask("worker.status", 2))
    [_greeting, status] = held.frames(2)

    assert status == {"v": PROTOCOL_VERSION, "id": 2, "ok": {"alive": True}}
    release.set()
    held.close()


def test_a_cancel_reaches_a_job_that_is_already_running() -> None:
    """The cancel that matters lands mid-denoise: the other one never reached a device."""
    running = threading.Event()
    stopped = threading.Event()

    def queued(loop: WorkerLoop) -> dict:
        def slow(_params: dict) -> dict:
            running.set()
            for _step in range(500):
                if loop.queue.cancelled():
                    stopped.set()
                    raise RuntimeError("stopped")
                threading.Event().wait(0.01)
            return {"done": True}

        return {"generate": slow}

    held = Harness(queued)
    held.send(ask("generate", 1))
    # Waited for on purpose: cancelling before the job is picked up drops it from the queue, which
    # is a different behaviour and has its own case in `test_jobqueue`.
    assert running.wait(timeout=5)

    held.send(ask("engine.cancel", 2, run=1))

    assert stopped.wait(timeout=5)
    held.close()


def test_a_cancel_says_whether_the_job_was_known() -> None:
    held = Harness(lambda _loop: {})
    held.send(ask("engine.cancel", 7, run=999))
    [_greeting, answer] = held.frames(2)

    assert answer["ok"] == {"cancelled": False}
    held.close()


def test_a_queued_job_that_raises_answers_its_run_rather_than_the_stream() -> None:
    def queued(_loop: WorkerLoop) -> dict:
        def explode(_params: dict) -> dict:
            raise RuntimeError("the device is gone")

        return {"generate": explode}

    held = Harness(queued)
    held.send(ask("generate", 3))
    [_greeting, answer] = held.frames(2)

    assert answer["id"] == 3
    assert answer["err"]["message"] == "the device is gone"
    held.close()


def test_a_job_cancelled_before_it_ran_is_still_answered() -> None:
    """
    The failure this whole split exists to prevent: a silent drop leaves the studio holding a
    promise for ever. The ordinary case is a `generate` queued behind a cold `import torch`.
    """
    holding = threading.Event()

    def queued(_loop: WorkerLoop) -> dict:
        def slow(_params: dict) -> dict:
            holding.wait(timeout=5)
            return {}

        return {"generate": slow}

    held = Harness(queued)
    # The first holds the job thread, so the second is still waiting when the cancel lands.
    held.send(ask("generate", 1))
    held.send(ask("generate", 2))
    held.send(ask("engine.cancel", 3, run=2))

    frames = held.frames(2)
    holding.set()

    assert frames[1]["ok"] == {"cancelled": True}
    [settled] = [one for one in held.frames(2) if one.get("id") == 2]
    assert settled["err"]["code"] == "cancelled"
    held.close()
