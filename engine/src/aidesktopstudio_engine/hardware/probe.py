"""What the engine answers about the machine it runs on."""

from __future__ import annotations

import os
import platform
import sys
from typing import Any


def _total_bytes() -> int | None:
    """`None` rather than a default: an unread context is written as unread — never as a value."""
    try:
        return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
    except (AttributeError, ValueError, OSError):
        return None


def hardware_info() -> dict[str, Any]:
    """
    The machine as a core without a tensor library can see it.

    No video memory here, and that is the honest answer rather than a gap: the reading ADR-19 makes
    authoritative comes from an inference runtime, and this process holds none until a worker does.
    """
    return {
        "platform": sys.platform,
        "machine": platform.machine(),
        "pythonVersion": platform.python_version(),
        "cpuCount": os.cpu_count(),
        "totalBytes": _total_bytes(),
    }
