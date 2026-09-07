"""Inference-only Make-It-Animatable backend, without Blender or torch-cluster."""

from __future__ import annotations

import json
import resource
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from aidesktopstudio_engine.adapters.loading import LoadRefusedError
from aidesktopstudio_engine.autorig.quality import (
    focus_surface_on_hands as _focus_surface_on_hands,
)
from aidesktopstudio_engine.autorig.quality import (
    focus_surface_on_hands_with_normals,
    sample_surface_points,
)
from aidesktopstudio_engine.autorig.quality import (
    post_process_weights as _post_process_weights,
)
from aidesktopstudio_engine.autorig.quality import (
    simplify_fingers as _simplify_fingers,
)
from aidesktopstudio_engine.autorig.support import Joint

JOINT_NAMES = (
    "Hips",
    "Spine",
    "Spine1",
    "Spine2",
    "Neck",
    "Head",
    "LeftShoulder",
    "LeftArm",
    "LeftForeArm",
    "LeftHand",
    "LeftHandThumb1",
    "LeftHandThumb2",
    "LeftHandThumb3",
    "LeftHandIndex1",
    "LeftHandIndex2",
    "LeftHandIndex3",
    "LeftHandMiddle1",
    "LeftHandMiddle2",
    "LeftHandMiddle3",
    "LeftHandRing1",
    "LeftHandRing2",
    "LeftHandRing3",
    "LeftHandPinky1",
    "LeftHandPinky2",
    "LeftHandPinky3",
    "RightShoulder",
    "RightArm",
    "RightForeArm",
    "RightHand",
    "RightHandThumb1",
    "RightHandThumb2",
    "RightHandThumb3",
    "RightHandIndex1",
    "RightHandIndex2",
    "RightHandIndex3",
    "RightHandMiddle1",
    "RightHandMiddle2",
    "RightHandMiddle3",
    "RightHandRing1",
    "RightHandRing2",
    "RightHandRing3",
    "RightHandPinky1",
    "RightHandPinky2",
    "RightHandPinky3",
    "LeftUpLeg",
    "LeftLeg",
    "LeftFoot",
    "LeftToeBase",
    "RightUpLeg",
    "RightLeg",
    "RightFoot",
    "RightToeBase",
)
PARENTS = (
    -1,
    0,
    1,
    2,
    3,
    4,
    3,
    6,
    7,
    8,
    9,
    10,
    11,
    9,
    13,
    14,
    9,
    16,
    17,
    9,
    19,
    20,
    9,
    22,
    23,
    3,
    25,
    26,
    27,
    28,
    29,
    30,
    28,
    32,
    33,
    28,
    35,
    36,
    28,
    38,
    39,
    28,
    41,
    42,
    0,
    44,
    45,
    46,
    0,
    48,
    49,
    50,
)


class KinematicTree:
    def __init__(self) -> None:
        self.nodes = [Joint(index) for index in range(len(PARENTS))]
        for index, parent in enumerate(PARENTS):
            self.nodes[index].parent = None if parent < 0 else self.nodes[parent]
        remaining = set(range(len(PARENTS)))
        self.tree_levels_mask: list[list[bool]] = []
        while remaining:
            level = [
                index
                for index in remaining
                if PARENTS[index] < 0 or PARENTS[index] not in remaining
            ]
            self.tree_levels_mask.append([index in level for index in range(len(PARENTS))])
            remaining.difference_update(level)

    def __iter__(self):
        return iter(self.nodes)

    def __len__(self) -> int:
        return len(self.nodes)


@dataclass
class Models:
    skin: Any
    skin_normal: Any
    joints: Any
    coarse: Any
    pose: Any
    tree: KinematicTree
    device: str


def load(folder: str, device: str) -> Models:
    import aidesktopstudio_engine.vendor.make_it_animatable.model as upstream_model

    root = Path(folder)
    required = ("bw.pth", "bw_normal.pth", "joints.pth", "joints_coarse.pth", "pose.pth")
    missing = [name for name in required if not (root / name).is_file()]
    if missing:
        raise LoadRefusedError(f"missing model files: {', '.join(missing)}")
    tree = KinematicTree()
    common = {
        "N": 32768,
        "input_normal": False,
        "deterministic": True,
        "hierarchical_ratio": 0.5,
        "output_dim": 52,
    }
    skin, normal, joints, coarse, pose = _load_networks(
        upstream_model.PCAE, root, device, tree, common
    )
    return Models(skin, normal, joints, coarse, pose, tree, device)


def _normal_network(pcae, root: Path, device: str, common: dict):
    """Derived from `common`, and loaded with the four others rather than on first use: a lazy
    429 MB read landed mid-job and left `heldBytes` short of what the door holds."""
    return (
        pcae(**{**common, "input_normal": True, "input_attention": True})
        .load(str(root / "bw_normal.pth"))
        .to(device)
        .eval()
    )


def _load_networks(pcae, root: Path, device: str, tree: KinematicTree, common: dict):
    skin = pcae(**common).load(str(root / "bw.pth")).to(device).eval()
    normal = _normal_network(pcae, root, device, common)
    joints = (
        pcae(
            **common,
            kinematic_tree=tree,
            predict_bw=False,
            predict_joints=True,
            predict_joints_tail=True,
            joints_attn_causal=True,
        )
        .load(str(root / "joints.pth"))
        .to(device)
        .eval()
    )
    coarse = (
        pcae(
            N=32768,
            input_normal=False,
            deterministic=True,
            output_dim=52,
            predict_bw=False,
            predict_joints=True,
            predict_joints_tail=True,
        )
        .load(str(root / "joints_coarse.pth"))
        .to(device)
        .eval()
    )
    pose = (
        pcae(
            **common,
            kinematic_tree=tree,
            predict_bw=False,
            predict_pose_trans=True,
            pose_mode="ortho6d",
            pose_input_joints=True,
            pose_attn_causal=True,
        )
        .load(str(root / "pose.pth"))
        .to(device)
        .eval()
    )
    return skin, normal, joints, coarse, pose


def _transform(points, matrix):
    import torch

    ones = torch.ones((*points.shape[:-1], 1), dtype=points.dtype)
    return torch.einsum("bij,bnj->bni", matrix, torch.cat((points, ones), dim=-1))[..., :3]


def _normalise(points):
    minimum = points.amin(dim=1, keepdim=True)
    maximum = points.amax(dim=1, keepdim=True)
    center = (minimum + maximum) / 2
    scale = 2 / (maximum - minimum).amax(dim=-1, keepdim=True)
    return (points - center) * scale, center, scale


def _hips_transform(joints):
    import torch
    import torch.nn.functional as functional

    hips, right, left = joints[:, 0, :3], joints[:, 48, :3], joints[:, 44, :3]
    normal = functional.normalize(torch.cross(right - hips, left - hips, dim=-1), dim=-1)
    target = torch.tensor([[0.0, 0.0, 1.0]])
    cross = torch.cross(normal, target, dim=-1)
    dot = torch.sum(normal * target, dim=-1, keepdim=True)
    skew = torch.zeros((1, 3, 3))
    skew[:, 0, 1], skew[:, 0, 2] = -cross[:, 2], cross[:, 1]
    skew[:, 1, 0], skew[:, 1, 2] = cross[:, 2], -cross[:, 0]
    skew[:, 2, 0], skew[:, 2, 1] = -cross[:, 1], cross[:, 0]
    denominator = torch.sum(cross * cross, dim=-1, keepdim=True).clamp_min(1e-8)
    rotation = (
        torch.eye(3).unsqueeze(0) + skew + skew @ skew * ((1 - dot) / denominator).unsqueeze(-1)
    )
    matrix = torch.eye(4).unsqueeze(0)
    matrix[:, :3, :3] = rotation
    matrix[:, :3, 3] = torch.einsum("bij,bj->bi", rotation, -hips)
    tangent = _transform(torch.stack((right, left), dim=1), matrix)
    direction = tangent[:, 1] - tangent[:, 0]
    angle = -torch.atan2(direction[:, 1], direction[:, 0])
    around = torch.eye(4).unsqueeze(0)
    around[:, 0, 0], around[:, 0, 1] = torch.cos(angle), -torch.sin(angle)
    around[:, 1, 0], around[:, 1, 1] = torch.sin(angle), torch.cos(angle)
    return around @ matrix


def _surface(vertices: np.ndarray, triangles: np.ndarray, count: int):
    import torch

    return torch.from_numpy(sample_surface_points(vertices, triangles, count)).unsqueeze(0)


def run(
    models: Models,
    params: dict[str, Any],
    destination: str,
    report: Callable[[int, int, str], None],
    stopping: Callable[[], bool],
) -> dict[str, Any]:
    source = Path(str(params["source"]))
    manifest = json.loads(source.read_text())
    vertices = np.fromfile(source.parent / manifest["positions"], dtype="<f4").reshape(-1, 3)
    triangles = np.fromfile(source.parent / manifest["triangles"], dtype="<u4").reshape(-1, 3)
    if len(vertices) < 3 or len(triangles) < 1 or triangles.max(initial=0) >= len(vertices):
        raise ValueError("INVALID_MESH: invalid geometry")
    options = manifest.get("options", {})
    arrays = _infer(models, vertices, triangles, report, stopping, options)
    if stopping():
        raise InterruptedError("CANCELLED")
    _write_result(Path(destination), arrays, len(vertices))
    report(6, 6, "write")
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return {"peakRssBytes": peak if sys.platform == "darwin" else peak * 1024}


def _infer(models, vertices, triangles, report, stopping, options):
    import torch

    report(1, 6, "prepare")
    sampled = _surface(vertices, triangles, 32768)
    points, center, scale = _normalise(sampled)
    if stopping():
        raise InterruptedError("CANCELLED")
    report(2, 6, "analyse")
    with torch.inference_mode():
        coarse = models.coarse(points.to(models.device)).joints.cpu()
        orientation = _hips_transform(coarse)
        all_vertices = torch.from_numpy(vertices.astype(np.float32)).unsqueeze(0)
        transformed = _transform((all_vertices - center) * scale, orientation)
        report(3, 6, "skeleton")
        coarse_in_model = _transform(coarse[..., 3:], orientation)
        hand_centers = coarse_in_model[0, [9, 28]].numpy()
        detailed_points, normals = _detailed_surface(
            transformed, triangles, hand_centers, options, torch
        )
        second_scale = 1 / detailed_points.abs().amax(dim=1, keepdim=True).amax(
            dim=-1, keepdim=True
        )
        detailed_points *= second_scale
        transformed *= second_scale
        device_points = detailed_points.to(models.device)
        joints = models.joints(device_points).joints.cpu()
        report(4, 6, "pose")
        pose = models.pose(device_points, joints=joints.to(models.device).clone()).pose_trans.cpu()
        if stopping():
            raise InterruptedError("CANCELLED")
        weights = _skin_weights(models, device_points, transformed, stopping, torch, normals)
    report(5, 6, "skinning")
    return _result_arrays(
        orientation, center, scale, second_scale, joints, weights, pose, options, torch
    )


def _detailed_surface(transformed, triangles, hand_centers, options, torch):
    """The cloud, and the pair of normal fields beside it — `None` when nothing asked for them."""
    vertices = transformed[0].numpy()
    if not options.get("useSurfaceNormals", False):
        points = _focus_surface_on_hands(vertices, triangles, 32768, hand_centers)
        return torch.from_numpy(points), None
    points, point_normals, vertex_normals = focus_surface_on_hands_with_normals(
        vertices, triangles, 32768, hand_centers
    )
    return torch.from_numpy(points), (
        torch.from_numpy(point_normals),
        torch.from_numpy(vertex_normals),
    )


def _result_arrays(orientation, center, scale, second_scale, joints, weights, pose, options, torch):
    inverse = torch.linalg.inv(orientation)
    heads = _transform(joints[..., :3] / second_scale, inverse) / scale + center
    tails = _transform(joints[..., 3:] / second_scale, inverse) / scale + center
    names = JOINT_NAMES
    parents = PARENTS
    heads_array = heads[0].numpy().astype("<f4")
    tails_array = tails[0].numpy().astype("<f4")
    weights_array = weights[0].numpy().astype("<f4")
    if options.get("weightPostProcessing", True):
        weights_array = _post_process_weights(weights_array, names)
    if options.get("fingers") == "simplified":
        names, parents, heads_array, tails_array, weights_array = _simplify_fingers(
            names, parents, heads_array, tails_array, weights_array
        )
    return {
        "jointNames": names,
        "parents": parents,
        "heads": heads_array,
        "tails": tails_array,
        "weights": weights_array,
        "pose": pose[0].numpy().astype("<f4"),
    }


def _skin_weights(models, device_points, transformed, stopping, torch, normals=None):
    """`normals` is the pair or nothing: asking for the normal net without it was representable,
    and it died on an `AttributeError` several minutes into a job."""
    weight_chunks = []
    point_normals, vertex_normals = normals if normals is not None else (None, None)
    vertex_normal_chunks = (
        torch.split(vertex_normals, 100000, dim=1) if vertex_normals is not None else []
    )
    for index, chunk in enumerate(torch.split(transformed, 100000, dim=1)):
        if stopping():
            raise InterruptedError("CANCELLED")
        base = models.skin(device_points, chunk.to(models.device)).bw
        if normals is not None:
            normal = models.skin_normal(
                torch.cat((device_points, point_normals.to(models.device)), dim=-1),
                torch.cat(
                    (chunk.to(models.device), vertex_normal_chunks[index].to(models.device)),
                    dim=-1,
                ),
            ).bw
            protected = [
                bone_index
                for bone_index, name in enumerate(JOINT_NAMES)
                if any(part in name for part in ("Spine", "Shoulder", "Arm"))
            ]
            normal[..., protected] = base[..., protected]
            base = normal
        weight_chunks.append(base.cpu())
        if stopping():
            raise InterruptedError("CANCELLED")
    return torch.cat(weight_chunks, dim=1)


def _write_result(output: Path, arrays: dict[str, Any], vertices: int) -> None:
    output.mkdir(parents=True, exist_ok=True)
    for name in ("heads", "tails", "weights", "pose"):
        arrays[name].tofile(output / f"{name}.bin")
    (output / "result.json").write_text(
        json.dumps(
            {
                "backendId": "make-it-animatable",
                "jointNames": arrays["jointNames"],
                "parents": arrays["parents"],
                "vertices": vertices,
                "files": {name: f"{name}.bin" for name in ("heads", "tails", "weights", "pose")},
            }
        )
    )
