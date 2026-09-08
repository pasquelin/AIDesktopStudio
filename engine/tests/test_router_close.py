"""
Closing ONE door, beside the routing that opens them — `test_router.py` reached its size.

The stand-in worker lives in `router_harness.py`, which both suites import.
"""

import threading
import time

import pytest
from router_harness import DOOR, IMAGE_DOOR, harness


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


def test_closing_a_door_does_not_hold_the_loop_that_answers_a_cancel() -> None:
    """
    🛑 The core answers `door.close` and `engine.cancel` on ONE loop. Reaping the process here
    costs a Stop up to `CLOSE_WAIT_S` behind ANOTHER door leaving — which is exactly what
    `memory_handlers` says never happens. `_abandon` settled the jobs already, so nothing in this
    answer needs the exit code.
    """
    router, _written, workers = harness()
    router.submit("models.load", DOOR, job="local_a1")
    workers[0].leaving = threading.Event()

    started = time.perf_counter()
    answer = router.close_door(IMAGE_DOOR)
    elapsed = time.perf_counter() - started
    workers[0].leaving.set()

    assert answer == {"closed": True}
    assert elapsed < 1


def test_closing_a_door_nobody_opened_starts_nothing_to_close_it() -> None:
    router, _written, workers = harness()

    assert router.close_door(IMAGE_DOOR) == {"closed": False}
    assert workers == []


def test_refuses_to_close_a_door_that_does_not_exist() -> None:
    router, _written, _workers = harness()

    with pytest.raises(ValueError):
        router.close_door("engine/nowhere")
