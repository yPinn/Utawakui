"""Check the isolated optional alignment environment without installing packages."""

import importlib
import importlib.metadata
import json
from pathlib import Path
import sys


def validate_request(value: dict) -> tuple[Path, Path]:
    """Reject arbitrary packages and nonlocal environment locations."""
    if value.get("pythonVersion") != "3.14.7" or value.get("packages") != {
        "numpy": "2.5.2", "pypinyin": "0.55.0"
    }:
        raise ValueError("unsupported alignment environment")
    environment, workspace = Path(value["environment"]), Path(value["workspace"])
    if not environment.is_absolute() or not workspace.is_absolute():
        raise ValueError("alignment paths must be absolute")
    return environment.resolve(strict=True), workspace.resolve(strict=True)


def probe(value: dict) -> dict:
    """Import only the pinned packages from the supplied managed environment."""
    environment, workspace = validate_request(value)
    if sys.version_info[:3] != (3, 14, 7):
        raise ValueError("alignment Python version")
    sys.pycache_prefix = str(workspace / "cache")
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(environment))
    distributions = {
        item.metadata["Name"].lower(): item.version
        for item in importlib.metadata.distributions(path=[str(environment)])
    }
    if distributions != value["packages"]:
        raise ValueError("alignment package versions")
    for name in value["packages"]:
        module = importlib.import_module(name)
        if not Path(module.__file__).resolve().is_relative_to(environment):
            raise ValueError("alignment import escaped environment")
    return {"ready": True}


if __name__ == "__main__":
    try:
        data = sys.stdin.buffer.read(32769)
        if len(data) > 32768:
            raise ValueError("alignment request budget")
        print(json.dumps(probe(json.loads(data))))
    except Exception:
        sys.exit(1)
