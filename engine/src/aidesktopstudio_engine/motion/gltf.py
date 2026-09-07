"""Standard glTF animation transport, in metres, Y up, local XYZW rotations."""

from __future__ import annotations

import json
import math
import struct

import numpy as np


def _validate_skeleton(names, parents):
    if not 1 <= len(names) <= 512 or len(set(names)) != len(names):
        raise ValueError("motion joints must have unique names")
    if any(not isinstance(name, str) or not name for name in names):
        raise ValueError("invalid joint name")
    if len(parents) != len(names) or parents[0] != -1:
        raise ValueError("motion must have one root at index zero")
    if any(not isinstance(p, int) or not 0 <= p < i for i, p in enumerate(parents) if i):
        raise ValueError("parents must precede their children")


def _validate_samples(joints, rest, rotations, root, fps):
    frames = len(root)
    if not math.isfinite(fps) or not 0 < fps <= 240 or not 2 <= frames <= 14400:
        raise ValueError("invalid motion duration")
    if rest.shape != (joints, 3) or root.shape != (frames, 3):
        raise ValueError("invalid translation dimensions")
    if rotations.shape != (frames, joints, 4):
        raise ValueError("invalid rotation dimensions")
    if not all(np.isfinite(value).all() for value in (rest, root, rotations)):
        raise ValueError("non-finite motion values")
    if not np.allclose(np.linalg.norm(rotations, axis=-1), 1, atol=1e-3):
        raise ValueError("rotations must be unit quaternions")


class _MotionWriter:
    def __init__(self, joints, frames, fps, provenance):
        self.document = {
            "asset": {"version": "2.0", "extras": {"provenance": provenance}},
            "scene": 0,
            "scenes": [{"nodes": [0]}],
            "nodes": [],
            "buffers": [],
            "bufferViews": [],
            "accessors": [],
            "skins": [{"joints": list(range(joints)), "skeleton": 0}],
            "animations": [{"name": "Motion", "samplers": [], "channels": []}],
        }
        self.binary = bytearray()
        self.times = self.accessor(np.arange(frames) / fps, "SCALAR", True)

    def accessor(self, values, kind, bounds=False):
        values = np.asarray(values, dtype="<f4")
        index = len(self.document["accessors"])
        self.document["bufferViews"].append(
            {
                "buffer": 0,
                "byteOffset": len(self.binary),
                "byteLength": values.nbytes,
            }
        )
        entry = {"bufferView": index, "componentType": 5126, "count": len(values), "type": kind}
        if bounds:
            entry.update(min=[float(values.min())], max=[float(values.max())])
        self.document["accessors"].append(entry)
        self.binary.extend(values.tobytes())
        return index

    def channel(self, node, values, path, kind):
        animation = self.document["animations"][0]
        sampler = len(animation["samplers"])
        animation["samplers"].append(
            {
                "input": self.times,
                "output": self.accessor(values, kind),
                "interpolation": "LINEAR",
            }
        )
        animation["channels"].append({"sampler": sampler, "target": {"node": node, "path": path}})

    def encode(self):
        self.document["buffers"] = [{"byteLength": len(self.binary)}]
        encoded = json.dumps(self.document, separators=(",", ":"), allow_nan=False).encode()
        encoded += b" " * (-len(encoded) % 4)
        self.binary.extend(b"\0" * (-len(self.binary) % 4))
        return (
            struct.pack("<4sII", b"glTF", 2, 28 + len(encoded) + len(self.binary))
            + struct.pack("<I4s", len(encoded), b"JSON")
            + encoded
            + struct.pack("<I4s", len(self.binary), b"BIN\0")
            + self.binary
        )


def motion_glb(*, names, parents, rest, rotations, root, fps, provenance) -> bytes:
    rest = np.asarray(rest, dtype=np.float64)
    rotations = np.asarray(rotations, dtype=np.float64)
    root = np.asarray(root, dtype=np.float64)
    _validate_skeleton(names, parents)
    _validate_samples(len(names), rest, rotations, root, fps)
    writer = _MotionWriter(len(names), len(root), fps, provenance)
    for index, name in enumerate(names):
        parent = parents[index]
        offset = rest[index] if parent < 0 else rest[index] - rest[parent]
        node = {"name": name, "translation": offset.tolist()}
        children = [i for i, p in enumerate(parents) if p == index]
        if children:
            node["children"] = children
        writer.document["nodes"].append(node)
        writer.channel(index, rotations[:, index], "rotation", "VEC4")
    writer.channel(0, root, "translation", "VEC3")
    return writer.encode()
