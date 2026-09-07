"""Torch-shaped deterministic FPS implemented by the NumPy kernel validated in Phase 3."""

from __future__ import annotations

import numpy as np

from aidesktopstudio_engine.autorig.fps import farthest_point_indices


def farthest_point_sample(points, batch, ratio: float):
    import torch

    selected: list[torch.Tensor] = []
    for batch_index in torch.unique(batch, sorted=True):
        positions = torch.nonzero(batch == batch_index, as_tuple=False).flatten()
        count = max(1, round(len(positions) * ratio))
        local = farthest_point_indices(
            points[positions].detach().cpu().numpy().astype(np.float32), min(count, len(positions))
        )
        selected.append(positions[torch.from_numpy(local).to(positions.device)])
    return torch.cat(selected)
