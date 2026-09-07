"""
The one module every door runs. A modality `protocol/doors.py` names and `MODALITIES` does not is
a `KeyError` in a child process, read from the journal as a door that died at import.
"""

import json
import socket
import threading

import pytest

from aidesktopstudio_engine.adapters.modalities import MODALITIES
from aidesktopstudio_engine.adapters.routing_adapter import RoutingAdapter
from aidesktopstudio_engine.protocol.doors import DOORS, SPECIAL_DOORS
from aidesktopstudio_engine.protocol.envelope import frames
from aidesktopstudio_engine.workers.door import main, serve


def test_every_door_names_a_modality_that_exists() -> None:
    assert {value for door, value in DOORS.items() if door not in SPECIAL_DOORS} <= set(MODALITIES)


@pytest.mark.parametrize("argv", [["engine/video"], ["engine/nope", "3"]])
def test_a_door_refuses_to_start_on_anything_but_a_known_door_and_one_fd(argv: list[str]) -> None:
    """Refused BEFORE the socket: `socket(fileno=…)` on a descriptor nobody passed is a crash."""
    with pytest.raises(SystemExit, match="inherited fd"):
        main(argv)


def test_a_door_greets_without_loading_a_tensor_library(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`device()` imports torch, and the studio waits on this greeting before anything else."""

    def refuse(_adapter: RoutingAdapter) -> str:
        raise AssertionError("the greeting read the device")

    monkeypatch.setattr(RoutingAdapter, "device", refuse)
    ours, theirs = socket.socketpair()
    # A door that died before greeting leaves nothing to read: without this the case HANGS where
    # it should fail, and the failure it is written for is exactly that one.
    ours.settimeout(5)
    threading.Thread(target=serve, args=("engine/video", theirs.detach()), daemon=True).start()

    greeting = json.loads(next(frames(iter(lambda: ours.recv(65536), b""))))
    ours.close()

    assert greeting["evt"] == "worker.hello"
    assert greeting["door"] == "engine/video"
    assert "device" not in greeting
    # Blind spot, in clear: `torch not in sys.modules` would say it better, and cannot be asserted
    # here — a sibling module of this suite pulls torch into the shared process when the
    # `diffusion` extra is installed. What the greeting itself never loads is measured end to end.
