"""
A real child, a real socketpair, a real pump thread — no torch, the stand-in door is written to a
temporary folder. What it covers is the half of `workers.py` no other test reaches: telling an
ASKED shutdown from a death, which decides whether the jobs in flight fail or are forgotten.
"""

import threading
from pathlib import Path

import pytest

from aidesktopstudio_engine import PROTOCOL_VERSION
from aidesktopstudio_engine.core.workers import WorkerProcess

GREETS_THEN_ECHOES = """
import json, socket, sys

door, fd = sys.argv[1], int(sys.argv[2])
connection = socket.socket(fileno=fd)
connection.sendall((json.dumps({"evt": "worker.hello", "door": door}) + "\\n").encode())
pending = b""
while True:
    chunk = connection.recv(65536)
    if not chunk:
        break
    pending += chunk
    while b"\\n" in pending:
        line, pending = pending.split(b"\\n", 1)
        connection.sendall((json.dumps({"id": json.loads(line)["id"], "ok": {}}) + "\\n").encode())
"""

GREETS_THEN_LEAVES = """
import json, socket, sys

connection = socket.socket(fileno=int(sys.argv[2]))
connection.sendall((json.dumps({"evt": "worker.hello", "door": sys.argv[1]}) + "\\n").encode())
connection.sendall(b"this line is not a frame\\n")
connection.sendall((json.dumps({"evt": "worker.left", "door": sys.argv[1]}) + "\\n").encode())
"""


@pytest.fixture
def door_module(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    def write(source: str) -> str:
        (tmp_path / "stand_in_door.py").write_text(source)
        monkeypatch.setenv("PYTHONPATH", str(tmp_path))
        return "stand_in_door"

    return write


def test_a_request_is_answered_under_the_run_it_was_sent_with(door_module) -> None:
    answered = threading.Event()
    frames: list = []

    def heard(frame: dict) -> None:
        if "ok" in frame:
            frames.append(frame)
            answered.set()

    worker = WorkerProcess(door_module(GREETS_THEN_ECHOES), "engine/3d", heard, lambda: None)
    worker.start()
    try:
        run = worker.next_run()
        worker.send({"v": PROTOCOL_VERSION, "id": run, "op": "worker.status", "params": {}})

        assert answered.wait(10)
        assert frames[0]["id"] == run
    finally:
        worker.close()


def test_a_door_that_dies_on_its_own_is_reported_gone(door_module) -> None:
    """A pump that ended unasked means the jobs in flight have to be FAILED, not waited on."""
    gone = threading.Event()
    worker = WorkerProcess(
        door_module(GREETS_THEN_LEAVES), "engine/audio", lambda _frame: None, gone.set
    )
    worker.start()
    try:
        assert gone.wait(10)
    finally:
        worker.close()


def test_a_line_that_is_not_a_frame_does_not_kill_the_pump(door_module) -> None:
    """The frame AFTER the bad line is the whole point: a dead pump reads the same as a live one
    until something has to cross it."""
    frames: list = []
    both = threading.Event()

    def heard(frame: dict) -> None:
        frames.append(frame)
        if len(frames) == 2:
            both.set()

    worker = WorkerProcess(door_module(GREETS_THEN_LEAVES), "engine/audio", heard, lambda: None)
    worker.start()
    try:
        assert both.wait(10)
        assert frames == [
            {"evt": "worker.hello", "door": "engine/audio"},
            {"evt": "worker.left", "door": "engine/audio"},
        ]
    finally:
        worker.close()


def test_an_asked_shutdown_is_not_a_death(door_module) -> None:
    """The distinction this class exists for: closing the socket IS how a worker is asked to go."""
    gone = threading.Event()
    worker = WorkerProcess(
        door_module(GREETS_THEN_ECHOES), "engine/skybox", lambda _frame: None, gone.set
    )
    worker.start()
    worker.close()

    assert not gone.is_set()


def test_runs_are_numbered_from_one_and_never_repeat(door_module) -> None:
    worker = WorkerProcess(
        door_module(GREETS_THEN_ECHOES), "engine/diffusion", lambda _frame: None, lambda: None
    )
    try:
        assert [worker.next_run() for _ in range(3)] == [1, 2, 3]
    finally:
        worker.close()


def test_what_it_sends_is_one_json_object_per_line(door_module) -> None:
    """NDJSON has no way back from an interleave, and two threads write to this socket."""
    heard: list = []
    answered = threading.Event()

    def hear(frame: dict) -> None:
        heard.append(frame)
        if len(heard) > 3:
            answered.set()

    worker = WorkerProcess(door_module(GREETS_THEN_ECHOES), "engine/video", hear, lambda: None)
    worker.start()
    try:
        senders = [
            threading.Thread(
                target=worker.send, args=({"v": PROTOCOL_VERSION, "id": number, "op": "x"},)
            )
            for number in range(1, 4)
        ]
        for sender in senders:
            sender.start()
        for sender in senders:
            sender.join()

        assert answered.wait(10)
        assert sorted(frame["id"] for frame in heard if "ok" in frame) == [1, 2, 3]
    finally:
        worker.close()
