import json

from aidesktopstudio_engine import PROTOCOL_VERSION
from aidesktopstudio_engine.core import supervisor
from aidesktopstudio_engine.core.supervisor import serve


def run(*lines: str) -> list[dict]:
    written: list[str] = []
    serve([line.encode("utf-8") for line in lines], written.append)
    return [json.loads(frame) for frame in written]


def ask(op: str, request_id: int = 1, params: dict | None = None) -> str:
    return (
        json.dumps({"v": PROTOCOL_VERSION, "id": request_id, "op": op, "params": params or {}})
        + "\n"
    )


def test_greets_before_anything_is_asked() -> None:
    [greeting] = run()

    assert greeting["evt"] == "engine.hello"
    assert greeting["protocol"] == PROTOCOL_VERSION
    assert greeting["engine"] and greeting["python"] and greeting["platform"]


def test_answers_the_machine_it_runs_on() -> None:
    _greeting, answer = run(ask("hardware.info"))

    assert answer["id"] == 1
    assert answer["ok"]["cpuCount"] >= 1


def test_requirements_forwards_the_requested_runtime_profile(monkeypatch) -> None:
    surveyed: list[str] = []

    def survey(profile: str = "diffusion") -> dict:
        surveyed.append(profile)
        return {"extra": profile, "declaration": [], "absent": [], "stale": [], "complete": True}

    monkeypatch.setattr(supervisor, "survey", survey)
    _greeting, answer = run(ask("engine.requirements", params={"profile": "autorig"}))

    assert answer["ok"]["extra"] == "autorig"
    assert surveyed == ["autorig"]


def test_refuses_an_op_it_does_not_know_under_the_run_that_asked() -> None:
    _greeting, answer = run(ask("models.load", request_id=9))

    assert answer["id"] == 9
    assert answer["err"]["code"] == "unknown-op"


def test_reports_an_unreadable_frame_rather_than_dying_on_it() -> None:
    _greeting, complaint, answer = run("{\n", ask("hardware.info"))

    assert complaint["evt"] == "runtime.error"
    assert "ok" in answer


def test_a_cancel_is_an_op_like_another_when_no_door_holds_the_job() -> None:
    """Routed to the door by `memory_handlers`; with no handler wired it is simply unknown."""
    _greeting, answer = run(ask("engine.cancel", request_id=5))

    assert answer["id"] == 5
    assert answer["err"]["code"] == "unknown-op"


def test_a_handler_that_raises_answers_its_run_rather_than_the_stream() -> None:
    def explode(_params: dict) -> None:
        raise RuntimeError("the device is gone")

    written: list[str] = []
    serve([ask("boom").encode("utf-8")], written.append, {"boom": explode})
    error = json.loads(written[1])["err"]

    assert (error["code"], error["message"]) == ("failed", "the device is gone")
