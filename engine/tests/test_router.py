"""
The core's routing, with a stand-in worker.

**Blind spot, written rather than hidden**: nothing here imports torch, and the gate must never
have to — `pnpm engine:check` would then download 682 MB to run. What a real backend does is
proven by the spike of § L.4 and by the end-to-end run, not by this file.
"""

import json
from typing import Any

import pytest

from aidesktopstudio_engine import PROTOCOL_VERSION
from aidesktopstudio_engine.core.router import DoorRouter

IMAGE_DOOR = "engine/diffusion"
#: Every request names its door — the studio does, and `submit` refuses one that does not.
DOOR = {"door": IMAGE_DOOR}


class StandInWorker:
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []
        self._next = 1

    def next_run(self) -> int:
        run = self._next
        self._next += 1
        return run

    def send(self, request: dict[str, Any]) -> None:
        self.sent.append(request)

    def start(self) -> None:
        self.started = True

    def begin_close(self) -> None:
        self.closed = True

    def wait_closed(self, timeout: float = 10) -> None:
        self.waited = timeout


def harness() -> tuple[DoorRouter, list[dict], list[StandInWorker]]:
    written: list[dict] = []
    workers: list[StandInWorker] = []
    answered: dict[str, Any] = {}
    left: dict[str, Any] = {}

    def spawn(door, on_frame, on_gone):
        worker = StandInWorker()
        worker.door = door
        workers.append(worker)
        answered[door] = on_frame
        left[door] = on_gone
        return worker

    router = DoorRouter(lambda line: written.append(json.loads(line)), spawn)
    # The image door unless a case says otherwise — a convenience of this harness, not a default
    # the router has: `submit` refuses a request that names no door.
    router.said = lambda frame, door=IMAGE_DOOR: answered[door](frame)  # type: ignore[attr-defined]
    router.door_died = lambda door=IMAGE_DOOR: left[door]()  # type: ignore[attr-defined]
    return router, written, workers


def test_answers_with_the_job_it_opened_rather_than_waiting_for_the_result() -> None:
    router, written, workers = harness()

    answer = router.submit("models.load", {**DOOR, "folder": "/weights"}, job="local_a1")

    assert answer == {"jobId": "local_a1"}
    assert written == []
    assert workers[0].sent[0]["op"] == "models.load"


def test_the_door_is_started_once_however_many_jobs_arrive() -> None:
    router, _written, workers = harness()

    router.submit("models.load", DOOR, job="local_a1")
    router.submit("generate", DOOR, job="local_a2")

    assert len(workers) == 1


def test_what_the_worker_settles_reaches_the_studio_as_its_job() -> None:
    router, written, workers = harness()
    router.submit("generate", DOOR, job="local_a1")
    run = workers[0].sent[0]["id"]

    router.said({"v": PROTOCOL_VERSION, "id": run, "ok": {"path": "/tmp/out.png", "device": "mps"}})

    assert written == [
        {
            "v": PROTOCOL_VERSION,
            "evt": "job.completed",
            "job": "local_a1",
            "path": "/tmp/out.png",
            "device": "mps",
        }
    ]


def test_a_refusal_reaches_the_studio_with_its_reason() -> None:
    router, written, workers = harness()
    router.submit("models.load", DOOR, job="local_a1")
    run = workers[0].sent[0]["id"]

    router.said({"v": PROTOCOL_VERSION, "id": run, "err": {"code": "memory", "message": "no room"}})

    assert written[0]["evt"] == "job.failed"
    assert (written[0]["code"], written[0]["message"]) == ("memory", "no room")


def test_a_second_answer_for_one_run_is_dropped_rather_than_pushed_twice() -> None:
    router, written, workers = harness()
    router.submit("generate", DOOR, job="local_a1")
    run = workers[0].sent[0]["id"]

    router.said({"v": PROTOCOL_VERSION, "id": run, "ok": {}})
    router.said({"v": PROTOCOL_VERSION, "id": run, "ok": {}})

    assert len(written) == 1


def test_closing_the_router_closes_the_door_it_started() -> None:
    router, _written, workers = harness()
    router.submit("generate", DOOR, job="local_a1")

    router.close()

    assert workers[0].closed is True


def test_a_door_never_asked_for_is_a_process_that_never_ran() -> None:
    router, _written, workers = harness()

    router.close()

    assert workers == []


@pytest.mark.parametrize("job", [None, "", 42])
def test_a_routed_op_without_its_job_is_refused(job: object) -> None:
    from aidesktopstudio_engine.core.supervisor import routed_handlers

    router, _written, _workers = harness()
    handler = routed_handlers(router)["generate"]

    with pytest.raises(ValueError):
        handler({} if job is None else {"jobId": job})


def test_a_door_that_dies_fails_every_job_it_was_holding() -> None:
    """Otherwise the studio waits for ever on a process that is not there — § A.5, exception 2."""
    router, written, _workers = harness()
    router.submit("generate", DOOR, job="local_a1")
    router.submit("generate", DOOR, job="local_a2")

    router.door_died()

    assert [frame["job"] for frame in written] == ["local_a1", "local_a2"]
    assert {frame["code"] for frame in written} == {"door-gone"}


def test_a_door_that_left_is_started_again_by_the_next_job() -> None:
    router, _written, workers = harness()
    router.submit("generate", DOOR, job="local_a1")
    router.door_died()

    router.submit("generate", DOOR, job="local_a2")

    assert len(workers) == 2


def test_records_what_a_door_answered_about_its_memory() -> None:
    router, _written, workers = harness()
    router.submit("models.load", DOOR, job="local_a1")
    run = workers[0].sent[0]["id"]

    router.said(
        {
            "v": PROTOCOL_VERSION,
            "id": run,
            "ok": {
                "door": "engine/diffusion",
                "heldBytes": 8_890_220_544,
                "tensorBytes": 8_844_678_144,
                "device": "mps",
                "backend": "pytorch",
            },
        }
    )

    [door] = router.ledger.as_frame()["doors"]
    assert door["heldBytes"] == 8_890_220_544


def test_a_door_that_did_not_name_itself_is_filed_under_the_one_that_answered() -> None:
    """
    The default used to be the diffusion door whatever the frame came from, so a video door's
    gigabytes landed on an image door — and the main reads this ledger to pick what to release.
    """
    router, _written, workers = harness()
    router.submit("models.load", {"door": "engine/video"}, job="local_v1")
    run = workers[0].sent[0]["id"]

    router.said(
        {
            "v": PROTOCOL_VERSION,
            "id": run,
            "ok": {"heldBytes": 4_000_000_000, "device": "cuda", "backend": "pytorch"},
        },
        door="engine/video",
    )

    [entry] = router.ledger.as_frame()["doors"]
    assert entry["door"] == "engine/video"


def test_leaves_a_backend_that_answered_no_number_absent() -> None:
    """A zero would be trusted by admission; absent is what makes it read `unknown`."""
    router, _written, workers = harness()
    router.submit("models.load", DOOR, job="local_a1")
    run = workers[0].sent[0]["id"]

    router.said(
        {"v": PROTOCOL_VERSION, "id": run, "ok": {"door": "engine/diffusion", "heldBytes": None}}
    )

    assert router.ledger.as_frame() == {"doors": []}


def test_an_unload_that_holds_nothing_leaves_the_door_absent() -> None:
    """An unload that omitted device used to no-op, so the load's gigabytes stayed in the ledger."""
    router, _written, workers = harness()
    router.submit("models.load", DOOR, job="local_a1")
    run = workers[0].sent[0]["id"]
    router.said(
        {
            "v": PROTOCOL_VERSION,
            "id": run,
            "ok": {
                "door": "engine/diffusion",
                "heldBytes": 8_890_220_544,
                "device": "mps",
                "backend": "pytorch",
            },
        }
    )

    router.submit("models.unload", DOOR, job="local_a2")
    unload = workers[0].sent[1]["id"]
    router.said(
        {
            "v": PROTOCOL_VERSION,
            "id": unload,
            "ok": {
                "door": "engine/diffusion",
                "heldBytes": 0,
                "device": "mps",
                "backend": "pytorch",
            },
        }
    )

    assert router.ledger.as_frame() == {"doors": []}


def test_an_unload_that_still_holds_bytes_replaces_the_record() -> None:
    router, _written, workers = harness()
    router.submit("models.load", DOOR, job="local_a1")
    run = workers[0].sent[0]["id"]
    router.said(
        {
            "v": PROTOCOL_VERSION,
            "id": run,
            "ok": {
                "door": "engine/diffusion",
                "heldBytes": 100,
                "device": "mps",
                "backend": "pytorch",
            },
        }
    )

    router.submit("models.unload", DOOR, job="local_a2")
    unload = workers[0].sent[1]["id"]
    router.said(
        {
            "v": PROTOCOL_VERSION,
            "id": unload,
            "ok": {
                "door": "engine/diffusion",
                "heldBytes": 12,
                "device": "mps",
                "backend": "pytorch",
            },
        }
    )

    [door] = router.ledger.as_frame()["doors"]
    assert door["heldBytes"] == 12


def test_a_door_that_died_holds_nothing_in_the_ledger() -> None:
    router, _written, workers = harness()
    router.submit("models.load", DOOR, job="local_a1")
    run = workers[0].sent[0]["id"]
    router.said(
        {
            "v": PROTOCOL_VERSION,
            "id": run,
            "ok": {"door": "engine/diffusion", "heldBytes": 1, "tensorBytes": 1},
        }
    )

    router.door_died()

    assert router.ledger.as_frame() == {"doors": []}


def test_passes_an_event_from_a_door_straight_through() -> None:
    """`job.progress` is the only thing a job says while it runs, and it belongs to no run."""
    router, written, _workers = harness()
    router.submit("generate", DOOR, job="local_a1")

    router.said({"v": PROTOCOL_VERSION, "evt": "job.progress", "job": "local_a1", "ratio": 0.5})

    assert written[-1] == {
        "v": PROTOCOL_VERSION,
        "evt": "job.progress",
        "job": "local_a1",
        "ratio": 0.5,
    }


def test_asks_the_door_to_drop_a_job_by_its_own_numbering() -> None:
    router, _written, workers = harness()
    router.submit("generate", DOOR, job="local_a1")
    run = workers[0].sent[0]["id"]

    assert router.cancel("local_a1") == {"cancelled": True}
    [cancel] = [sent for sent in workers[0].sent if sent["op"] == "engine.cancel"]
    assert cancel["params"] == {"run": run}


def test_a_cancel_never_borrows_the_run_of_the_job_it_stops() -> None:
    """Reusing it makes the door answer under the job's id, settling it as a success — measured."""
    router, _written, workers = harness()
    router.submit("generate", DOOR, job="local_a1")
    run = workers[0].sent[0]["id"]

    router.cancel("local_a1")

    [cancel] = [sent for sent in workers[0].sent if sent["op"] == "engine.cancel"]
    assert cancel["id"] != run


def test_cancelling_a_job_no_door_holds_is_a_fact_rather_than_a_failure() -> None:
    router, _written, _workers = harness()

    assert router.cancel("local_never") == {"cancelled": False}


def test_a_door_nobody_named_is_refused_rather_than_started() -> None:
    """A `-m` on a module that does not exist forks a process that dies at import, and the job
    then reads `door-gone` — which sends a reader looking for a crash instead of a typo."""
    router, _written, workers = harness()

    with pytest.raises(ValueError):
        router.submit("generate", {"door": "engine/nowhere"}, job="local_a1")

    assert workers == []


def test_a_request_that_names_no_door_is_refused_rather_than_sent_to_the_image_one() -> None:
    """The image door used to be the default, so a malformed request routed somewhere plausible."""
    router, _written, workers = harness()

    with pytest.raises(ValueError):
        router.submit("generate", {}, job="local_a1")

    assert workers == []


def test_two_modalities_are_two_processes() -> None:
    """A door is what a release plan kills, and an 80 GB video has no place in an image's."""
    router, _written, workers = harness()

    router.submit("generate", DOOR, job="local_a1")
    router.submit("generate", {"door": "engine/video"}, job="local_a2")

    assert [worker.door for worker in workers] == [IMAGE_DOOR, "engine/video"]


def test_a_skybox_is_a_door_of_its_own() -> None:
    router, _written, workers = harness()

    router.submit("generate", {"door": "engine/skybox"}, job="local_sky")

    assert [worker.door for worker in workers] == ["engine/skybox"]


def test_two_doors_numbering_from_one_settle_their_own_job() -> None:
    """Both number their runs from 1: the run alone names two jobs and settles the wrong one."""
    router, written, workers = harness()
    router.submit("generate", DOOR, job="local_image")
    router.submit("generate", {"door": "engine/audio"}, job="local_sound")

    router.said({"v": PROTOCOL_VERSION, "id": workers[1].sent[0]["id"], "ok": {}}, "engine/audio")

    assert [frame["job"] for frame in written] == ["local_sound"]


def test_a_door_that_dies_leaves_the_jobs_of_another_alone() -> None:
    router, written, _workers = harness()
    router.submit("generate", DOOR, job="local_image")
    router.submit("generate", {"door": "engine/audio"}, job="local_sound")

    router.door_died("engine/audio")

    assert [frame["job"] for frame in written] == ["local_sound"]


def test_closing_the_router_closes_every_door_it_started() -> None:
    router, _written, workers = harness()
    router.submit("generate", DOOR, job="local_a1")
    router.submit("generate", {"door": "engine/skybox"}, job="local_a2")

    router.close()

    assert [worker.closed for worker in workers] == [True, True]


def test_a_door_answers_only_once_the_router_knows_about_it() -> None:
    """Dying at import, it would report itself gone with nothing yet to forget — and be recorded
    dead a moment later: alive to everyone, answering nobody, never restarted."""
    router, _written, workers = harness()

    router.submit("generate", DOOR, job="local_a1")

    assert workers[0].started is True


def test_closing_one_door_ends_its_process_where_unloading_only_frees_its_tensors() -> None:
    router, _written, workers = harness()
    router.submit("models.load", DOOR, job="local_a1")

    assert router.close_door(IMAGE_DOOR) == {"closed": True}
    assert workers[0].closed is True


def test_closing_one_door_fails_the_jobs_it_was_holding() -> None:
    """
    🛑 `begin_close` sets `_closing`, so the pump never calls `_worker_left` for this door. Nothing
    else settles these runs, and the studio would wait on them for ever.
    """
    router, written, _workers = harness()
    router.submit("generate", DOOR, job="local_a1")

    router.close_door(IMAGE_DOOR)

    assert [(one["evt"], one["job"], one["code"]) for one in written] == [
        ("job.failed", "local_a1", "door-gone")
    ]


def test_a_closed_door_opens_again_at_the_next_request() -> None:
    router, _written, workers = harness()
    router.submit("models.load", DOOR, job="local_a1")
    router.close_door(IMAGE_DOOR)

    router.submit("models.load", DOOR, job="local_a2")

    assert len(workers) == 2


def test_closing_a_door_nobody_opened_starts_nothing_to_close_it() -> None:
    router, _written, workers = harness()

    assert router.close_door(IMAGE_DOOR) == {"closed": False}
    assert workers == []


def test_refuses_to_close_a_door_that_does_not_exist() -> None:
    router, _written, _workers = harness()

    with pytest.raises(ValueError):
        router.close_door("engine/nowhere")


def test_the_engine_leaving_settles_the_jobs_its_doors_were_holding() -> None:
    router, written, _workers = harness()
    router.submit("generate", DOOR, job="local_a1")

    router.close()

    assert [(one["evt"], one["job"]) for one in written] == [("job.failed", "local_a1")]
