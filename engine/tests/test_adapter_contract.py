"""
Nothing type-checks Python here — ruff lints, and that is all. So `ModelAdapter` is compared member
by member: a renamed parameter or a dropped default would otherwise surface as a `TypeError` in a
worker's journal, hours later.
"""

import inspect

import pytest

from aidesktopstudio_engine.adapters.diffusers_adapter import DiffusersAdapter
from aidesktopstudio_engine.adapters.modalities import MODALITIES
from aidesktopstudio_engine.adapters.model_adapter import ModelAdapter
from aidesktopstudio_engine.adapters.plugin_adapter import PluginAdapter
from aidesktopstudio_engine.adapters.routing_adapter import RoutingAdapter

ADAPTERS = (DiffusersAdapter, PluginAdapter, RoutingAdapter)

PROMISED = sorted(
    name
    for name, member in vars(ModelAdapter).items()
    if not name.startswith("_") and inspect.isfunction(member)
)


def _signature(holder: object, name: str) -> str:
    return str(inspect.signature(getattr(holder, name)))


@pytest.mark.parametrize("adapter", ADAPTERS, ids=lambda one: one.__name__)
@pytest.mark.parametrize("promise", PROMISED)
def test_every_adapter_answers_the_call_the_contract_declares(adapter: type, promise: str) -> None:
    assert _signature(adapter, promise) == _signature(ModelAdapter, promise)


@pytest.mark.parametrize("adapter", ADAPTERS, ids=lambda one: one.__name__)
def test_an_adapter_publishes_the_five_calls_a_door_makes_and_nothing_else(adapter: type) -> None:
    """A method only one adapter has is a caller that stopped being able to swap them."""
    published = sorted(
        name
        for name in dir(adapter)
        if not name.startswith("_") and callable(getattr(adapter, name))
    )

    assert published == ["auto_rig", "backend", "device", "generate", "load", "unload"]


@pytest.mark.parametrize("adapter", ADAPTERS, ids=lambda one: one.__name__)
def test_every_adapter_carries_what_the_contract_declares_as_state(adapter: type) -> None:
    """`loaded` is the one member `door.py` dereferences, and no signature comparison sees it."""
    held = adapter(MODALITIES["image"]) if adapter is not PluginAdapter else adapter()

    assert all(hasattr(held, name) for name in ModelAdapter.__annotations__)
