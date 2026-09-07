"""
How the core holds a worker: a socketpair it forks across, and a thread that pumps what comes back.

The core never imports a backend. It spawns a process that does, hands it one end of a socket, and
routes frames — which is why `import torch` is paid once, in the worker, and never here.
"""

from __future__ import annotations

import contextlib
import json
import socket
import subprocess
import sys
import threading
import traceback
from collections.abc import Callable
from typing import Any

from aidesktopstudio_engine.protocol.envelope import frames

Listener = Callable[[dict[str, Any]], None]


class WorkerProcess:
    """One worker, from its spawn to its death. Not a pool: a door holds one process."""

    def __init__(
        self, module: str, door: str, on_frame: Listener, on_gone: Callable[[], None]
    ) -> None:
        ours, theirs = socket.socketpair()
        # The child needs the fd across `exec`, which `pass_fds` is what clears CLOEXEC for.
        self._process = subprocess.Popen(
            [sys.executable, "-m", module, door, str(theirs.fileno())],
            pass_fds=(theirs.fileno(),),
        )
        theirs.close()

        self._socket = ours
        self._on_frame = on_frame
        self._on_gone = on_gone
        self._closing = False
        self._next_id = 1
        # Two threads write to the studio's socket, so the answer of a run and the frame of a job
        # would interleave mid-line without this.
        self._writing = threading.Lock()
        self._pump = threading.Thread(target=self._read, daemon=True)

    def start(self) -> None:
        """
        Separate from the spawn so a caller can register the worker BEFORE it can answer.

        A door that dies at import would otherwise report itself gone while the router still had
        nothing to forget, and the dead process would be recorded a moment later — alive to
        everyone, answering nobody, and never restarted.
        """
        self._pump.start()

    def _read(self) -> None:
        try:
            for line in frames(iter(lambda: self._socket.recv(65536), b"")):
                try:
                    frame = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(frame, dict):
                    self._on_frame(frame)
        except OSError:
            # `close` pulls the socket out from under this thread on purpose. Without this the
            # engine writes a traceback on every ordinary shutdown, into the studio's own log.
            pass
        except Exception:
            # Anything else kills this thread, and a dead pump means every job in flight pends for
            # ever while the worker looks alive. The door is declared gone instead, which fails
            # them — a visible failure beats a silent wait.
            traceback.print_exc()

        # The stream ended. Asked for, it is the shutdown; unasked, the door died mid-job and
        # whoever was waiting has to hear it rather than wait for ever.
        if not self._closing:
            self._on_gone()

    def send(self, request: dict[str, Any]) -> None:
        line = json.dumps(request, separators=(",", ":")) + "\n"
        with self._writing:
            self._socket.sendall(line.encode("utf-8"))

    def next_run(self) -> int:
        run = self._next_id
        self._next_id += 1
        return run

    def begin_close(self) -> None:
        """Closing the socket IS the shutdown: the worker's loop ends when its stream does."""
        self._closing = True
        # `shutdown` before `close`: it ends the blocking `recv` of the pump thread, where closing
        # alone leaves it reading a descriptor that is already gone.
        # A socket the worker already closed answers ENOTCONN, which is the shutdown succeeding.
        with contextlib.suppress(OSError):
            self._socket.shutdown(socket.SHUT_RDWR)
        self._socket.close()

    def wait_closed(self) -> None:
        """Split from the ask, so several doors leave at once rather than one timeout at a time."""
        try:
            self._process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            # A worker mid-inference does not read its socket, and a device call does not interrupt.
            self._process.kill()
            self._process.wait()

    def close(self) -> None:
        self.begin_close()
        self.wait_closed()
