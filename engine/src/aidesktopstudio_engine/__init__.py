"""The local AI engine of AI Desktop Studio."""

__version__ = "0.1.0"

# The vocabulary the main process and the engine agree on. A stale engine may sit in a user's cache
# long after the studio updated: the handshake refuses it rather than half-understanding it.
PROTOCOL_VERSION = 3
