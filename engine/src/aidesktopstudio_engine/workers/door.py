"""
One process, one adapter, one modality, one model. It never replans — it does not free another
door, does not substitute a model. A refusal travels back, and the main process makes the plan.

Started by the core as `python -m aidesktopstudio_engine.workers.door <door> <fd>`,
never on its own.
"""

from __future__ import annotations

import socket
import sys
from typing import Any

from aidesktopstudio_engine.adapters.device import memory_frame
from aidesktopstudio_engine.adapters.modalities import MODALITIES
from aidesktopstudio_engine.adapters.params import filled
from aidesktopstudio_engine.adapters.routing_adapter import RoutingAdapter
from aidesktopstudio_engine.adapters.selection import EfficientSam
from aidesktopstudio_engine.protocol.doors import DOORS, SPECIAL_DOORS
from aidesktopstudio_engine.protocol.envelope import encode_event
from aidesktopstudio_engine.workers.base import WorkerLoop, worker_hello

#: `[?]` Not measured. The queue serialises, so one job at a time. § L.8 would replace these values.
OCCUPANCY = {"process": "exclusive-process", "device": "exclusive", "maxConcurrent": 1}


def inline_handlers(door: str, adapter: RoutingAdapter) -> dict[str, Any]:
    """
    Answered in the reading turn, whatever the job thread is doing. `memory.info` DOES read the
    driver, which is the point: admission needs the number now, not after the denoise.
    """

    def status(_params: dict[str, Any]) -> dict[str, Any]:
        held = adapter.loaded
        return {
            "door": door,
            "backend": adapter.backend(),
            "device": adapter.device(),
            "loaded": None if held is None else held.model_id,
        }

    return {
        "worker.status": status,
        "memory.info": lambda _params: memory_frame(door, adapter.device(), adapter.backend()),
    }


def _attachment_of(params: dict[str, Any]) -> dict[str, Any] | None:
    """Weights grafted onto the pipeline rather than being one — `attaches`, in `localModel.ts`."""
    folder = filled(params, "attachFolder")
    if folder is None:
        return None

    return {
        "folder": str(folder),
        "as": str(params.get("attachAs", "")),
        "subfolder": params.get("attachSubfolder"),
        "weight_name": params.get("attachWeightName"),
    }


def queued_handlers(door: str, adapter: RoutingAdapter, loop: WorkerLoop) -> dict[str, Any]:
    """Everything that touches the device, serialised by the queue — § A.5, exception 1."""

    def load(params: dict[str, Any]) -> dict[str, Any]:
        held = adapter.load(
            str(params["modelId"]),
            str(params["folder"]),
            torch_weights=bool(params.get("torchWeights", False)),
            attachment=_attachment_of(params),
        )
        # The reading taken AT the load, never re-probed after it: `costs` would read the driver
        # again, and what a pipeline took is what admission has to see.
        return {
            "door": door,
            "heldBytes": held.bytes_resident,
            "tensorBytes": held.tensor_bytes,
            "device": held.device,
            "backend": adapter.backend(),
            "loadMs": round(held.load_ms, 1),
        }

    def unload(_params: dict[str, Any]) -> dict[str, Any]:
        adapter.unload()
        frame = memory_frame(door, adapter.device(), adapter.backend())
        # `None` is what a backend without a counter answers, and admission reads a zero as a
        # measurement. Taken off the frame rather than probed again — that was two device reads.
        return {
            **frame,
            "heldBytes": frame["heldBytes"] or 0,
            "tensorBytes": frame["tensorBytes"] or 0,
        }

    def generate(params: dict[str, Any]) -> dict[str, Any]:
        job = params.get("jobId")

        def report(done: int, total: int) -> None:
            loop.send(encode_event("job.progress", job=job, ratio=round(done / total, 4)))

        return adapter.generate(
            params,
            str(params["destination"]),
            door,
            on_step=report,
            stopping=loop.queue.cancelled,
        )

    def auto_rig(params: dict[str, Any]) -> dict[str, Any]:
        job = params.get("jobId")

        def report(done: int, total: int, phase: str) -> None:
            loop.send(
                encode_event("job.progress", job=job, ratio=round(done / total, 4), phase=phase)
            )

        return adapter.auto_rig(
            params,
            str(params["destination"]),
            door,
            on_phase=report,
            stopping=loop.queue.cancelled,
        )

    return {
        "models.load": load,
        "models.unload": unload,
        "generate": generate,
        "auto-rig": auto_rig,
    }


def serve(door: str, fd: int) -> int:
    if door in SPECIAL_DOORS:
        return serve_selection(door, fd)
    adapter = RoutingAdapter(MODALITIES[DOORS[door]])
    connection = socket.socket(fileno=fd)
    WorkerLoop(
        connection,
        worker_hello(door, adapter.backend(), OCCUPANCY),
        inline_handlers(door, adapter),
        lambda loop: queued_handlers(door, adapter, loop),
    ).run()
    return 0


def serve_selection(door: str, fd: int) -> int:
    model = EfficientSam()
    connection = socket.socket(fileno=fd)

    def load(params: dict[str, Any]) -> dict[str, Any]:
        model.load(str(params["folder"]))
        return {
            "door": door,
            "heldBytes": 1,
            "tensorBytes": 0,
            "device": "cpu",
            "backend": "onnxruntime",
        }

    def encode(params: dict[str, Any]) -> dict[str, Any]:
        return model.encode(str(params["image"]))

    def decode(params: dict[str, Any]) -> dict[str, Any]:
        point = params.get("point")
        box = params.get("box")
        return model.decode(
            point if isinstance(point, list) else None,
            box if isinstance(box, list) else None,
            str(params["destination"]),
        )

    def unload(_params: dict[str, Any]) -> dict[str, Any]:
        model.unload()
        return {
            "door": door,
            "heldBytes": 0,
            "tensorBytes": 0,
            "device": "cpu",
            "backend": "onnxruntime",
        }

    WorkerLoop(
        connection,
        worker_hello(door, "onnxruntime", OCCUPANCY),
        {},
        lambda _loop: {
            "models.load": load,
            "selection.encode": encode,
            "selection.decode": decode,
            "models.unload": unload,
        },
    ).run()
    return 0


def main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if len(arguments) != 2 or arguments[0] not in DOORS:
        raise SystemExit(f"a door is started as `<door> <inherited fd>`, got {arguments}")
    return serve(arguments[0], int(arguments[1]))


if __name__ == "__main__":
    raise SystemExit(main())
