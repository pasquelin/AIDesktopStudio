"""
Proves that a model marked "installed" generates without a network — as a PROPERTY, not a label.

🛑 `HF_HUB_OFFLINE=1` is NOT a proof and is deliberately not used as one: it shows that the
library reading it obeys it, never that nothing left the machine. A third-party package, a direct
`urllib`, a telemetry call that does not read it — all three go straight through.

What this does instead is CUT: every socket-creating entry point of the interpreter is replaced
by one that raises, so an attempt fails loudly with the address it wanted rather than succeeding
in silence. Eight families of implicit download are what it is looking for (spec § L.6): the
tokenizer, the pipeline config, the scheduler config, a VAE or a text encoder living in another
repository, secondary weights a pipeline resolves for itself, custom code, a runtime dependency
pulled at first import, and telemetry.

`[?]` The cut is **in-process**. It holds for anything the interpreter opens itself, which is
every case above; it does NOT hold for a subprocess or for a native library that opens its own
socket without going through Python. A container or a firewall would close that gap, and neither
works the same on the three operating systems — which is why this file says what it covers rather
than claiming to cover everything.

    python -m aidesktopstudio_engine.tools.check_offline <model-folder> [--steps 4]
"""

from __future__ import annotations

import argparse
import shutil
import socket
import sys
import tempfile
from pathlib import Path
from typing import Any, NoReturn


class WentOutError(Exception):
    """Something asked for the network. The address it wanted is in the message."""


def cut_the_network() -> list[str]:
    """
    Replaces every way the interpreter opens a socket. Answers the list of attempts, filled as
    they happen — an empty list at the end is the whole verdict.
    """
    attempted: list[str] = []

    def refuse(what: str) -> NoReturn:
        attempted.append(what)
        raise WentOutError(f"the network was asked for: {what}")

    def no_connect(_self: Any, address: Any) -> NoReturn:
        refuse(f"connect {address!r}")

    def no_create(address: Any, *_args: Any, **_kwargs: Any) -> NoReturn:
        refuse(f"create_connection {address!r}")

    def no_resolve(host: Any, *_args: Any, **_kwargs: Any) -> NoReturn:
        refuse(f"resolve {host!r}")

    socket.socket.connect = no_connect  # type: ignore[method-assign]
    socket.socket.connect_ex = no_connect  # type: ignore[method-assign]
    socket.create_connection = no_create  # type: ignore[assignment]
    # DNS too, and separately: a resolver that answers lets a library report "host unreachable",
    # which reads as a network hiccup rather than as the test failing.
    socket.getaddrinfo = no_resolve  # type: ignore[assignment]

    return attempted


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="check_offline")
    parser.add_argument("folder", help="the model folder, as the studio installed it")
    parser.add_argument("--steps", type=int, default=4)
    parser.add_argument("--prompt", default="a red cube on a white table")
    options = parser.parse_args(argv)

    attempted = cut_the_network()

    # Imported AFTER the cut: an import that reaches the network is exactly one of the eight
    # families, and importing first would let it through unseen.
    from aidesktopstudio_engine.adapters.diffusers_adapter import DiffusersAdapter
    from aidesktopstudio_engine.adapters.modalities import MODALITIES

    adapter = DiffusersAdapter(MODALITIES["image"])
    # A real file and not `/dev/null`: the writer picks its encoder off the extension, and a
    # generation that cannot be written is not a generation this proved anything about.
    written = Path(tempfile.mkdtemp()) / "offline-check.png"

    try:
        adapter.load("offline-check", options.folder)
        adapter.generate(
            {"prompt": options.prompt, "steps": options.steps},
            str(written),
            "engine/diffusion",
        )
    except WentOutError as error:
        print(f"NOT OFFLINE-READY — {error}", file=sys.stderr)
        return 1
    except Exception as error:
        # A different failure entirely, and worth telling apart: the model is incomplete or its
        # backend is missing something. Measured — a tokenizer file removed makes transformers
        # fall back to a converter that wants `tiktoken`, which is family 7 of § L.6 (a runtime
        # dependency pulled at first use) surfacing as a plain import error rather than a fetch.
        print(f"BROKEN — {type(error).__name__}: {error}", file=sys.stderr)
        return 2
    finally:
        adapter.unload()
        shutil.rmtree(written.parent, ignore_errors=True)

    if attempted:
        print(f"FAILED — {len(attempted)} attempt(s): {attempted}", file=sys.stderr)
        return 1

    print(f"offline-ready: {options.folder}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
