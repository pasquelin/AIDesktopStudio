"""Small inference-only replacements for Make-It-Animatable training utilities."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Self


def find_ckpt(path: str, epoch: int = -1, prefix: str = "checkpoint-", suffix: str = ".pth") -> str:
    del epoch, prefix, suffix
    return str(Path(path))


def ortho6d_to_matrix(ortho6d):
    import torch
    import torch.nn.functional as functional

    x = functional.normalize(ortho6d[..., :3], dim=-1)
    z = functional.normalize(torch.cross(x, ortho6d[..., 3:6], dim=-1), dim=-1)
    y = torch.cross(z, x, dim=-1)
    return torch.stack((x, y, z), dim=-1)


def matrix_to_ortho6d(matrix):
    shape = matrix.shape
    return matrix[..., :-1].transpose(-1, -2).reshape(*shape[:-2], 6)


@dataclass
class Joint:
    index: int
    parent: Self | None = None

    @property
    def parent_recursive(self) -> list[Self]:
        parents: list[Self] = []
        current = self.parent
        while current is not None:
            parents.append(current)
            current = current.parent
        return parents
