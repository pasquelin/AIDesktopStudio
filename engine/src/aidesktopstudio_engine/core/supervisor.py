"""
The engine's own loop: connect, greet, then answer one request at a time.

The engine speaks FIRST. Reading a Python stack can fail, and it has to fail at the opening rather
than at the first generation — the same handshake `sttProtocol.ts` waits on.
"""

from __future__ import annotations

import argparse
import platform
import signal
import socket
import sys
import threading
from collections.abc import Callable, Iterable, Mapping, Sequence
from typing import Any

from aidesktopstudio_engine import PROTOCOL_VERSION, __version__
from aidesktopstudio_engine.core.requirements import DOOR_EXTRA, survey
from aidesktopstudio_engine.core.router import DoorRouter, spawn_door
from aidesktopstudio_engine.hardware.probe import hardware_info
from aidesktopstudio_engine.protocol.envelope import (
    CANCEL_OP,
    EnvelopeError,
    Request,
    decode_request,
    encode_error,
    encode_event,
    encode_ok,
    frames,
)

Handler = Callable[[dict[str, Any]], Any]


def _requirements(params: dict[str, Any]) -> dict[str, Any]:
    profile = params.get("profile", DOOR_EXTRA)
    if profile not in {DOOR_EXTRA, "autorig", "motion", "selection"}:
        raise ValueError(f"unknown runtime profile: {profile}")
    return survey(profile)


HANDLERS: Mapping[str, Handler] = {
    "hardware.info": lambda _params: hardware_info(),
    # Read off `.dist-info` folders, so the core stays free of every library it reports on.
    "engine.requirements": _requirements,
}

#: What the core hands to a door rather than answering itself. Each reads gigabytes or runs for
#: seconds, so each answers with the job it opened and pushes its result as an event.
ROUTED_OPS = (
    "models.load",
    "models.unload",
    "generate",
    "selection.encode",
    "selection.decode",
    "auto-rig",
    "worker.status",
    "memory.info",
)


def memory_handlers(router: DoorRouter) -> dict[str, Handler]:
    """
    What the core answers about memory WITHOUT waking a door: the last thing each one reported.

    Asked, never computed — no caller may add back what a release was expected to return, which is
    R2 of ADR-19. A door that never answered is absent here, and absent is what makes the main
    read `unknown` rather than a zero it would trust.
    """
    return {
        "memory.ledger": lambda _params: router.ledger.as_frame(),
        # Routed, but never QUEUED: a cancel that waited behind the job it stops stops nothing.
        CANCEL_OP: lambda params: router.cancel(str(params.get("jobId", ""))),
    }


def routed_handlers(router: DoorRouter) -> dict[str, Handler]:
    def route(op: str) -> Handler:
        def submit(params: dict[str, Any]) -> Any:
            job = params.get("jobId")
            if not isinstance(job, str) or not job:
                raise ValueError("a routed op carries the job it belongs to")
            return router.submit(op, params, job)

        return submit

    return {op: route(op) for op in ROUTED_OPS}


def hello() -> str:
    return encode_event(
        "engine.hello",
        engine=__version__,
        protocol=PROTOCOL_VERSION,
        python=platform.python_version(),
        platform=sys.platform,
    )


def _answer(request: Request, handlers: Mapping[str, Handler]) -> str:
    handler = handlers.get(request.op)
    if handler is None:
        return encode_error(request.id, "unknown-op", f"no such op: {request.op}")

    try:
        return encode_ok(request.id, handler(request.params))
    except Exception as error:
        return encode_error(request.id, "failed", str(error))


def serve(
    chunks: Iterable[bytes],
    send: Callable[[str], None],
    handlers: Mapping[str, Handler] = HANDLERS,
    greeting: str | None = None,
) -> None:
    """
    Greets, then answers until the stream ends. The end of the stream IS the shutdown.

    A worker speaks the same loop over its own socket, and says who it is in its own greeting.
    """
    send(greeting if greeting is not None else hello())

    for line in frames(chunks):
        try:
            request = decode_request(line)
        except EnvelopeError as error:
            # An unreadable frame names no run, so there is no id to answer under.
            send(encode_event("runtime.error", message=str(error)))
            continue

        send(_answer(request, handlers))


Stream = tuple[Iterable[bytes], Callable[[str], None], Callable[[], None]]


def _open_stream(path: str) -> Stream:
    # The loop answers on one thread and a door's pump pushes events on another: a frame written
    # half way through another is not a frame, and NDJSON has no way back from an interleave.
    writing = threading.Lock()

    if sys.platform == "win32":
        # `[?]` Never run: no Windows machine has measured this. Node serves a named pipe as a byte
        # stream and Python opens it as a file — the spec keeps § L.4 open on exactly this line.
        pipe = open(path, "r+b", buffering=0)  # noqa: SIM115 — it lives as long as the process

        def write_pipe(line: str) -> None:
            with writing:
                pipe.write(line.encode("utf-8"))

        return iter(lambda: pipe.read(65536), b""), write_pipe, pipe.close

    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    connection.connect(path)

    def write_socket(line: str) -> None:
        with writing:
            connection.sendall(line.encode("utf-8"))

    return iter(lambda: connection.recv(65536), b""), write_socket, connection.close


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ai-desktop-studio-engine")
    parser.add_argument("--socket", required=True, help="the socket or named pipe the main serves")
    options = parser.parse_args(argv)

    chunks, send, close = _open_stream(options.socket)
    router = DoorRouter(send, spawn_door)

    # A door is a child of THIS process, and the default SIGTERM handler ends Python without
    # running a `finally`. Without this, killing the engine orphans a worker holding gigabytes of
    # device memory that nothing on the machine will ever give back.
    def leave(_signal: int, _frame: object) -> None:
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, leave)
    signal.signal(signal.SIGINT, leave)

    try:
        serve(chunks, send, {**HANDLERS, **memory_handlers(router), **routed_handlers(router)})
    finally:
        router.close()
        close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
