import json

import pytest

from aidesktopstudio_engine import PROTOCOL_VERSION
from aidesktopstudio_engine.protocol.envelope import (
    EnvelopeError,
    decode_request,
    encode_error,
    encode_event,
    encode_ok,
    frames,
)


def line(**frame: object) -> str:
    return json.dumps({"v": PROTOCOL_VERSION, **frame})


def test_reads_a_request() -> None:
    request = decode_request(line(id=42, op="hardware.info", params={"deep": True}))

    assert (request.id, request.op, request.params) == (42, "hardware.info", {"deep": True})


def test_reads_a_request_without_params() -> None:
    assert decode_request(line(id=1, op="hardware.info")).params == {}


def test_refuses_another_protocol() -> None:
    with pytest.raises(EnvelopeError):
        decode_request(json.dumps({"v": PROTOCOL_VERSION + 1, "id": 1, "op": "hardware.info"}))


def test_refuses_what_is_not_a_frame() -> None:
    for bad in ["{", "[]", line(op="hardware.info"), line(id=1), line(id=True, op="x")]:
        with pytest.raises(EnvelopeError):
            decode_request(bad)


def test_answers_carry_the_protocol_and_the_run() -> None:
    assert json.loads(encode_ok(7, {"cpuCount": 12})) == {
        "v": PROTOCOL_VERSION,
        "id": 7,
        "ok": {"cpuCount": 12},
    }
    assert json.loads(encode_error(7, "memory", "not enough")) == {
        "v": PROTOCOL_VERSION,
        "id": 7,
        "err": {"code": "memory", "message": "not enough"},
    }


def test_an_event_carries_no_run() -> None:
    assert "id" not in json.loads(encode_event("engine.hello", engine="0.1.0"))


def test_every_frame_ends_on_its_own_line() -> None:
    for frame in [encode_ok(1, None), encode_error(1, "x", "y"), encode_event("engine.hello")]:
        assert frame.endswith("\n")
        assert "\n" not in frame[:-1]


def test_a_partial_tail_waits_for_its_newline() -> None:
    assert list(frames([b'{"a":1}\n{"b":', b"2}\n"])) == ['{"a":1}', '{"b":2}']


def test_a_stream_that_ends_mid_frame_yields_nothing_half_read() -> None:
    assert list(frames([b'{"a":1}\n{"b":'])) == ['{"a":1}']
