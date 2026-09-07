import threading

from aidesktopstudio_engine.core.jobqueue import Job, JobQueue


def job(job_id: int) -> Job:
    return Job(id=job_id, op="generate")


def drained(queue: JobQueue) -> list[Job]:
    handed: list[Job] = []
    thread = threading.Thread(target=lambda: [handed.append(one) for one in queue.drain()])
    thread.start()
    queue.close()
    thread.join(timeout=5)
    return handed


def ids(queue: JobQueue) -> list[int]:
    return [one.id for one in drained(queue)]


def test_hands_jobs_out_in_the_order_they_arrived() -> None:
    queue = JobQueue()
    for job_id in [1, 2, 3]:
        queue.submit(job(job_id))

    assert ids(queue) == [1, 2, 3]


def test_a_job_cancelled_before_it_ran_is_handed_out_marked_rather_than_dropped() -> None:
    """
    It costs no device time, and it still has to be ANSWERED.

    Dropped in silence — which is what this did — the studio holds the promise of that job for
    ever. The ordinary case is not exotic: a `generate` queued behind a cold `import torch` is
    cancellable long before the job thread reaches it.
    """
    queue = JobQueue()
    for job_id in [1, 2]:
        queue.submit(job(job_id))

    assert queue.cancel(1) is True
    handed = drained(queue)

    assert [one.id for one in handed] == [1, 2]
    assert [one.cancelled for one in handed] == [True, False]


def test_cancelling_what_it_never_held_is_a_fact_rather_than_a_failure() -> None:
    assert JobQueue().cancel(404) is False


def test_a_running_job_is_flagged_rather_than_killed() -> None:
    """A device call does not interrupt: the job's own loop is what makes a cancel real."""
    queue = JobQueue()
    queue.submit(job(1))
    seen: list[bool] = []

    def work() -> None:
        for _one in queue.drain():
            seen.append(queue.cancelled())
            queue.cancel(1)
            seen.append(queue.cancelled())
            return

    thread = threading.Thread(target=work)
    thread.start()
    thread.join(timeout=5)

    assert seen == [False, True]


def test_the_flag_does_not_survive_the_job_it_stopped() -> None:
    """Otherwise the next job on that door is cancelled before it ever starts."""
    queue = JobQueue()
    queue.submit(job(1))
    queue.submit(job(2))
    flags: list[bool] = []

    def work() -> None:
        for one in queue.drain():
            flags.append(queue.cancelled())
            if one.id == 1:
                queue.cancel(1)

    thread = threading.Thread(target=work)
    thread.start()
    queue.close()
    thread.join(timeout=5)

    assert flags == [False, False]
