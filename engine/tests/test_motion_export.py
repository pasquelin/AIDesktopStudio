import json
import struct

import numpy as np
import pytest

from aidesktopstudio_engine.motion.gltf import motion_glb


def sample():
    return dict(
        names=["Hips", "Head"],
        parents=[-1, 0],
        rest=np.array([[0.0, 1.0, 0.0], [0.0, 2.0, 0.0]]),
        rotations=np.tile([0.0, 0.0, 0.0, 1.0], (3, 2, 1)),
        root=np.array([[0.0, 1.0, 0.0], [1.0, 1.0, 0.0], [2.0, 1.0, 0.0]]),
        fps=30,
        provenance={"model": "fixture", "seed": 7},
    )


def test_standard_glb_keeps_hierarchy_rest_and_animation():
    data = motion_glb(**sample())
    assert struct.unpack_from("<4sII", data) == (b"glTF", 2, len(data))
    size, kind = struct.unpack_from("<I4s", data, 12)
    assert kind == b"JSON"
    scene = json.loads(data[20 : 20 + size])
    assert scene["nodes"][0]["children"] == [1]
    assert scene["nodes"][1]["translation"] == [0.0, 1.0, 0.0]
    assert len(scene["animations"][0]["channels"]) == 3
    assert scene["accessors"][0]["max"] == pytest.approx([2 / 30])
    assert scene["asset"]["extras"]["provenance"]["seed"] == 7


@pytest.mark.parametrize(
    "change",
    [
        {"parents": [-1, 1]},
        {"names": ["Hips", "Hips"]},
        {"fps": float("nan")},
        {"rotations": np.zeros((3, 2, 4))},
        {"root": np.zeros((2, 3))},
        {"rest": np.full((2, 3), float("inf"))},
    ],
)
def test_invalid_motion_is_refused_before_serialization(change):
    with pytest.raises(ValueError):
        motion_glb(**(sample() | change))
