"""
The frames the main process and the engine exchange: one JSON object per line, over a stream.

Paths, never bytes: a generation writes its result to a file the main process owns and the frame
carries the path — the rule `sttProtocol.ts` already settled for 640 MB of weights.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from typing import Any

from aidesktopstudio_engine import PROTOCOL_VERSION

#: The op both loops answer without queueing it — a cancel that waited behind the job it stops
#: stops nothing. Named here because it is protocol vocabulary, not a detail of either loop.
CANCEL_OP = "engine.cancel"


class EnvelopeError(Exception):
    """A line that is not a frame this protocol can answer."""


@dataclass(frozen=True)
class Request:
    id: int
    op: str
    params: dict[str, Any]


def decode_request(line: str) -> Request:
    """Reads one line. Raises `EnvelopeError` rather than guessing at what a caller meant."""
    try:
        frame = json.loads(line)
    except json.JSONDecodeError as error:
        raise EnvelopeError(f"not JSON: {error}") from error

    if not isinstance(frame, dict):
        raise EnvelopeError("a frame is a JSON object")
    if frame.get("v") != PROTOCOL_VERSION:
        raise EnvelopeError(f"protocol {frame.get('v')!r}, this engine speaks {PROTOCOL_VERSION}")

    request_id = frame.get("id")
    operation = frame.get("op")
    # `bool` is an `int` in Python, and `{"id": true}` would otherwise number a run.
    if not isinstance(request_id, int) or isinstance(request_id, bool):
        raise EnvelopeError("a request carries a numeric id")
    if not isinstance(operation, str):
        raise EnvelopeError("a request names an op")

    params = frame.get("params", {})
    if not isinstance(params, dict):
        raise EnvelopeError("params is a JSON object")

    return Request(id=request_id, op=operation, params=params)


def _line(frame: dict[str, Any]) -> str:
    return json.dumps({"v": PROTOCOL_VERSION, **frame}, separators=(",", ":")) + "\n"


def encode_ok(request_id: int, result: Any) -> str:
    return _line({"id": request_id, "ok": result})


def encode_error(request_id: int, code: str, message: str, detail: Any = None) -> str:
    error: dict[str, Any] = {"code": code, "message": message}
    if detail is not None:
        error["detail"] = detail
    return _line({"id": request_id, "err": error})


def encode_event(name: str, **fields: Any) -> str:
    """An event carries no request id: nothing asked for it."""
    return _line({"evt": name, **fields})


def frames(chunks: Iterable[bytes]) -> Iterator[str]:
    """Splits a byte stream into lines, holding a partial tail until its newline arrives."""
    pending = b""
    for chunk in chunks:
        pending += chunk
        while b"\n" in pending:
            line, pending = pending.split(b"\n", 1)
            if line.strip():
                yield line.decode("utf-8")
