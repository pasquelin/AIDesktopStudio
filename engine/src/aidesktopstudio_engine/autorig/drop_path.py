"""Stochastic depth used by the vendored MIA transformer blocks."""

from __future__ import annotations

import torch
from torch import nn


class DropPath(nn.Module):
    """Drop complete residual paths during training and preserve them during inference."""

    def __init__(self, probability: float = 0.0) -> None:
        super().__init__()
        self.probability = probability

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        if self.probability == 0.0 or not self.training:
            return value
        keep = 1.0 - self.probability
        shape = (value.shape[0],) + (1,) * (value.ndim - 1)
        mask = value.new_empty(shape).bernoulli_(keep)
        return value * mask / keep
