"""
The cut itself, without a model and without torch.

What a real generation does behind it is proven by running the harness on an installed model —
the gate cannot, since it would have to fetch 682 Mo of tensor library to try.
"""

import re
import socket

import pytest

from aidesktopstudio_engine.tools.check_offline import WentOutError, cut_the_network


@pytest.fixture(autouse=True)
def restore_the_network():
    """The cut is global to the interpreter, so it is put back or every later test is offline."""
    kept = (
        socket.socket.connect,
        socket.socket.connect_ex,
        socket.create_connection,
        socket.getaddrinfo,
    )
    yield
    (
        socket.socket.connect,
        socket.socket.connect_ex,
        socket.create_connection,
        socket.getaddrinfo,
    ) = kept


def test_a_connection_fails_loudly_rather_than_succeeding() -> None:
    cut_the_network()

    with pytest.raises(WentOutError):
        socket.create_connection(("huggingface.co", 443))


def test_a_name_no_longer_resolves() -> None:
    """A resolver that answers lets a library report a network hiccup instead of failing here."""
    cut_the_network()

    with pytest.raises(WentOutError):
        socket.getaddrinfo("huggingface.co", 443)


def test_the_address_that_was_wanted_is_named() -> None:
    cut_the_network()

    with pytest.raises(WentOutError, match=re.escape("huggingface.co")):
        socket.getaddrinfo("huggingface.co", 443)


def test_every_attempt_is_recorded_rather_than_only_the_first() -> None:
    attempted = cut_the_network()

    for host in ["huggingface.co", "cdn-lfs.hf.co"]:
        with pytest.raises(WentOutError):
            socket.getaddrinfo(host, 443)

    assert len(attempted) == 2
