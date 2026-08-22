"""Utawakui Audio Python Runtime Host subprocess bootstrap.

This file is app code, not a Python runtime or model. Electron Builder copies it
to ``resources/audio-processing`` so an app-managed CPython artifact can execute
it from a real filesystem path. It probes only the shared host; capability
packages, models, readiness, and operations remain isolated and unavailable.
"""

from __future__ import annotations

import json
import sys
from typing import Any


PROTOCOL_VERSION = 1
MAX_REQUEST_BYTES = 64 * 1024


def write_message(message: dict[str, Any]) -> None:
    """Write one compact JSON-lines protocol message."""
    sys.stdout.write(json.dumps(message, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.write("\n")
    sys.stdout.flush()


def write_error(code: str, message: str) -> None:
    """Write an app-owned error without forwarding tracebacks or local paths."""
    write_message({"type": "error", "code": code, "message": message})


def read_request() -> dict[str, Any]:
    """Read and validate exactly one bounded request from stdin."""
    raw_request = sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1)
    if not raw_request or len(raw_request) > MAX_REQUEST_BYTES:
        raise ValueError("invalid request size")
    try:
        request = json.loads(raw_request)
    except json.JSONDecodeError as error:
        raise ValueError("invalid request JSON") from error
    if not isinstance(request, dict):
        raise ValueError("request must be an object")
    return request


def probe_host() -> None:
    """Report process and isolated-path facts without probing a capability."""
    write_message({"type": "progress", "stage": "starting", "percent": 0})
    write_message(
        {
            "type": "done",
            "result": {
                "protocolVersion": PROTOCOL_VERSION,
                "hostReady": True,
                "pythonVersion": sys.version_info[:3],
                "isolated": bool(sys.flags.isolated),
                "noUserSite": bool(sys.flags.no_user_site),
            },
        }
    )


def main() -> int:
    """Run one request and exit; every processing job gets a fresh process."""
    try:
        request = read_request()
    except ValueError:
        write_error("INVALID_REQUEST", "The audio Python request is invalid.")
        return 2

    if request.get("protocolVersion") != PROTOCOL_VERSION:
        write_error("PROTOCOL_MISMATCH", "The audio Python runtime is incompatible.")
        return 2
    if set(request) != {"protocolVersion", "operation"}:
        write_error("INVALID_REQUEST", "The audio Python request is invalid.")
        return 2
    if request.get("operation") == "probe-host":
        probe_host()
        return 0

    write_error(
        "OPERATION_NOT_AVAILABLE",
        "Audio Python capability operations are not available in this build.",
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
