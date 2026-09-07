"""
What the engine answers about memory, and what it refuses to invent.

Nothing here imports torch: the numbers a backend produces are proven by the end-to-end run of
§ L.1, and the gate must never download 682 Mo to be green.
"""

from aidesktopstudio_engine.core.memory import DoorMemory, MemoryLedger

DIFFUSION = DoorMemory(
    door="engine/diffusion",
    held_bytes=8_890_220_544,
    device="mps",
    backend="pytorch",
)


def test_answers_what_a_door_last_reported() -> None:
    ledger = MemoryLedger()
    ledger.record(DIFFUSION)

    [door] = ledger.as_frame()["doors"]
    assert door["heldBytes"] == 8_890_220_544
    assert (door["device"], door["backend"]) == ("mps", "pytorch")


def test_a_door_that_answered_twice_is_read_once() -> None:
    ledger = MemoryLedger()
    ledger.record(DIFFUSION)
    ledger.record(DoorMemory("engine/diffusion", 100_270_080, "mps", "pytorch"))

    [door] = ledger.as_frame()["doors"]
    assert door["heldBytes"] == 100_270_080


def test_a_door_that_never_answered_is_absent_rather_than_zero() -> None:
    """ADR-19 R1 turns on this: absent reads `unknown`, a zero would be trusted."""
    assert MemoryLedger().as_frame() == {"doors": []}


def test_a_door_that_died_holds_nothing() -> None:
    ledger = MemoryLedger()
    ledger.record(DIFFUSION)

    ledger.forget("engine/diffusion")

    assert ledger.as_frame() == {"doors": []}


def test_forgetting_a_door_it_never_held_is_not_a_failure() -> None:
    MemoryLedger().forget("engine/audio")


def test_each_door_answers_for_itself() -> None:
    ledger = MemoryLedger()
    ledger.record(DIFFUSION)
    ledger.record(DoorMemory("engine/audio", 2, "cpu", "onnx"))

    assert {door["door"] for door in ledger.as_frame()["doors"]} == {
        "engine/diffusion",
        "engine/audio",
    }
