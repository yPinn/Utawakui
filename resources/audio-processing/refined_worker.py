"""Strict one-shot worker for the optional Utawakui Refined capability.

The base installer ships this stdlib-only policy boundary, but no Python runtime,
third-party package, catalog, config, or checkpoint. Main resolves every path and
hash. This worker revalidates them before importing ``audio_separator``.
"""

from __future__ import annotations

import hashlib
import importlib
import importlib.abc
import json
import os
from pathlib import Path
import site
import socket
import subprocess
import sys
import urllib.request
from typing import Any


PROTOCOL_VERSION = 1
MAX_REQUEST_BYTES = 64 * 1024
RECIPE_ID = "refined"
MODEL_ID = "bs-roformer-viperx-1297"
CATALOG_FILENAME = "download_checks.json"
CONFIG_FILENAME = "model_bs_roformer_ep_317_sdr_12.9755.yaml"
CHECKPOINT_FILENAME = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
SHA256_LENGTH = 64
FORBIDDEN_IMPORT_PREFIXES = (
    "audio_separator.separator.architectures.demucs_separator",
    "audio_separator.separator.uvr_lib_v5.demucs",
    "demucs",
    "diffq",
    "julius",
    "onnx",
    "onnx2torch",
    "torchvision",
)


class InvalidRequestError(Exception):
    """Raised when main-to-worker input does not match the fixed contract."""


class ArtifactMissingError(Exception):
    """Raised before imports when a required verified file is absent."""


class ArtifactMismatchError(Exception):
    """Raised before imports when a required file hash differs."""


class NetworkDeniedError(Exception):
    """Raised when capability code attempts network access."""


class SubprocessDeniedError(Exception):
    """Raised when capability code attempts an unowned child process."""


class LegacyLoaderRejectedError(Exception):
    """Raised if audio-separator attempts its legacy RoFormer implementation."""


class ForbiddenImportError(ImportError):
    """Raised when Refined touches a dependency outside its reviewed subset."""


def write_message(message: dict[str, Any]) -> None:
    """Write one compact JSON-lines protocol message."""
    sys.stdout.write(json.dumps(message, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.write("\n")
    sys.stdout.flush()


def write_error(code: str, message: str) -> None:
    """Write one bounded app-owned error without paths or tracebacks."""
    write_message({"type": "error", "code": code, "message": message})


def assert_exact_keys(value: Any, keys: set[str]) -> dict[str, Any]:
    """Require a plain JSON object with no extension fields."""
    if not isinstance(value, dict) or set(value) != keys:
        raise InvalidRequestError
    return value


def read_request() -> dict[str, Any]:
    """Read and validate exactly one bounded request."""
    raw_request = sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1)
    if not raw_request or len(raw_request) > MAX_REQUEST_BYTES:
        raise InvalidRequestError
    if sys.stdin.buffer.read(1):
        raise InvalidRequestError
    try:
        request = json.loads(raw_request)
    except json.JSONDecodeError as error:
        raise InvalidRequestError from error
    assert_exact_keys(
        request,
        {
            "protocolVersion",
            "operation",
            "recipeId",
            "modelId",
            "environmentPath",
            "jobPath",
            "modelPath",
            "files",
        },
    )
    if (
        type(request["protocolVersion"]) is not int
        or request["protocolVersion"] != PROTOCOL_VERSION
        or request["operation"] != "probe-refined"
        or request["recipeId"] != RECIPE_ID
        or request["modelId"] != MODEL_ID
    ):
        raise InvalidRequestError
    return request


def absolute_path(value: Any) -> Path:
    """Parse one absolute path without accepting non-string coercion."""
    if not isinstance(value, str) or not value or "\x00" in value:
        raise InvalidRequestError
    candidate = Path(value)
    if not candidate.is_absolute():
        raise InvalidRequestError
    return Path(os.path.abspath(candidate))


def validate_file_descriptor(
    descriptor: Any,
    model_path: Path,
    filename: str,
) -> tuple[Path, str]:
    """Validate one exact model-root file descriptor."""
    descriptor = assert_exact_keys(descriptor, {"path", "sha256"})
    file_path = absolute_path(descriptor["path"])
    expected_path = model_path / filename
    if file_path != expected_path or file_path.parent != model_path:
        raise InvalidRequestError
    expected_hash = descriptor["sha256"]
    if (
        not isinstance(expected_hash, str)
        or len(expected_hash) != SHA256_LENGTH
        or any(character not in "0123456789abcdef" for character in expected_hash)
    ):
        raise InvalidRequestError
    return file_path, expected_hash


def validate_paths_and_files(
    request: dict[str, Any],
) -> tuple[Path, Path, Path, dict[str, tuple[Path, str]]]:
    """Validate main-derived roots and exact filenames without importing packages."""
    environment_path = absolute_path(request["environmentPath"])
    job_path = absolute_path(request["jobPath"])
    model_path = absolute_path(request["modelPath"])
    if (
        environment_path.name != "site-packages"
        or environment_path.parent.name != "Lib"
        or not environment_path.is_dir()
        or not job_path.is_dir()
        or not model_path.is_dir()
    ):
        raise InvalidRequestError
    files = assert_exact_keys(request["files"], {"catalog", "config", "checkpoint"})
    descriptors = {
        "catalog": validate_file_descriptor(
            files["catalog"], model_path, CATALOG_FILENAME
        ),
        "config": validate_file_descriptor(
            files["config"], model_path, CONFIG_FILENAME
        ),
        "checkpoint": validate_file_descriptor(
            files["checkpoint"], model_path, CHECKPOINT_FILENAME
        ),
    }
    return environment_path, job_path, model_path, descriptors


def sha256_file(file_path: Path) -> str:
    """Hash a file incrementally without loading a future checkpoint into RAM."""
    digest = hashlib.sha256()
    with file_path.open("rb") as input_file:
        for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_artifacts(descriptors: dict[str, tuple[Path, str]]) -> None:
    """Verify every required artifact before the third-party import boundary."""
    for file_path, expected_hash in descriptors.values():
        if not file_path.is_file() or file_path.is_symlink():
            raise ArtifactMissingError
        if sha256_file(file_path) != expected_hash:
            raise ArtifactMismatchError


def configure_isolation(
    environment_path: Path,
    job_path: Path,
    model_path: Path,
) -> None:
    """Bind imports and caches to app-owned roots before capability imports."""
    cache_path = job_path / "cache"
    temp_path = job_path / "tmp"
    cache_path.mkdir(exist_ok=True)
    temp_path.mkdir(exist_ok=True)

    for variable in (
        "PYTHONHOME",
        "PYTHONPATH",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "no_proxy",
        "REQUESTS_CA_BUNDLE",
        "CURL_CA_BUNDLE",
    ):
        os.environ.pop(variable, None)

    os.environ.update(
        {
            "PYTHONNOUSERSITE": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
            "PIP_NO_INDEX": "1",
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
            "AUDIO_SEPARATOR_MODEL_DIR": str(model_path),
            "UTAWAKUI_REFINED_JOB_DIR": str(job_path),
            "HOME": str(cache_path),
            "USERPROFILE": str(cache_path),
            "XDG_CACHE_HOME": str(cache_path / "xdg"),
            "TORCH_HOME": str(cache_path / "torch"),
            "HF_HOME": str(cache_path / "huggingface"),
            "MPLCONFIGDIR": str(cache_path / "matplotlib"),
            "NUMBA_CACHE_DIR": str(cache_path / "numba"),
            "TMP": str(temp_path),
            "TEMP": str(temp_path),
        }
    )

    user_sites = site.getusersitepackages()
    if isinstance(user_sites, str):
        user_sites = [user_sites]
    normalized_user_sites = {
        os.path.normcase(os.path.abspath(user_site)) for user_site in user_sites
    }
    sys.path[:] = [
        entry
        for entry in sys.path
        if not isinstance(entry, str)
        or os.path.normcase(os.path.abspath(entry)) not in normalized_user_sites
    ]
    site.ENABLE_USER_SITE = False
    sys.dont_write_bytecode = True
    environment_entry = str(environment_path)
    if environment_entry in sys.path:
        sys.path.remove(environment_entry)
    sys.path.insert(0, environment_entry)


class _ForbiddenImportFinder(importlib.abc.MetaPathFinder):
    """Reject reviewed-out dependency families before module execution."""

    def find_spec(self, fullname: str, _path: Any, _target: Any = None) -> None:
        for prefix in FORBIDDEN_IMPORT_PREFIXES:
            if fullname == prefix or fullname.startswith(f"{prefix}."):
                raise ForbiddenImportError
        return None


def install_runtime_guards() -> None:
    """Deny network, child processes, and forbidden capability imports."""
    for loaded_name in sys.modules:
        for prefix in FORBIDDEN_IMPORT_PREFIXES:
            if loaded_name == prefix or loaded_name.startswith(f"{prefix}."):
                raise ForbiddenImportError
    sys.meta_path.insert(0, _ForbiddenImportFinder())

    original_socket = socket.socket

    class OfflineSocket(original_socket):
        def connect(self, *_args: Any, **_kwargs: Any) -> None:
            raise NetworkDeniedError

        def connect_ex(self, *_args: Any, **_kwargs: Any) -> int:
            raise NetworkDeniedError

        def sendto(self, *_args: Any, **_kwargs: Any) -> int:
            raise NetworkDeniedError

    def deny_network(*_args: Any, **_kwargs: Any) -> None:
        raise NetworkDeniedError

    def deny_subprocess(*_args: Any, **_kwargs: Any) -> None:
        raise SubprocessDeniedError

    socket.socket = OfflineSocket
    socket.create_connection = deny_network
    socket.getaddrinfo = deny_network
    urllib.request.urlopen = deny_network
    subprocess.Popen = deny_subprocess
    subprocess.run = deny_subprocess
    subprocess.call = deny_subprocess
    subprocess.check_call = deny_subprocess
    subprocess.check_output = deny_subprocess
    os.system = deny_subprocess


def probe_refined(model_path: Path) -> dict[str, Any]:
    """Load only the fixed model and require the new RoFormer implementation."""
    loader_module = importlib.import_module(
        "audio_separator.separator.roformer.roformer_loader"
    )
    loader_class = getattr(loader_module, "RoformerLoader", None)
    if loader_class is None or not hasattr(
        loader_class, "_load_with_legacy_implementation"
    ):
        raise ImportError

    def reject_legacy(*_args: Any, **_kwargs: Any) -> None:
        raise LegacyLoaderRejectedError

    loader_class._load_with_legacy_implementation = reject_legacy
    separator_module = importlib.import_module(
        "audio_separator.separator.separator"
    )
    separator_class = getattr(separator_module, "Separator", None)
    if separator_class is None:
        raise ImportError

    write_message({"type": "progress", "stage": "loading", "percent": 50})
    separator = separator_class(
        model_file_dir=str(model_path),
        output_dir=os.environ["UTAWAKUI_REFINED_JOB_DIR"],
        output_format="WAV",
        use_autocast=False,
    )
    separator.load_model(CHECKPOINT_FILENAME)
    model_instance = getattr(separator, "model_instance", None)
    if (
        model_instance is None
        or getattr(model_instance, "is_roformer_model", False) is not True
    ):
        raise RuntimeError
    stats_getter = getattr(model_instance, "get_roformer_loading_stats", None)
    stats = stats_getter() if callable(stats_getter) else None
    if (
        not isinstance(stats, dict)
        or stats.get("new_implementation_success") != 1
        or stats.get("total_failures") != 0
    ):
        raise RuntimeError
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "probePassed": True,
        "recipeId": RECIPE_ID,
        "modelId": MODEL_ID,
        "implementation": "new-roformer",
        "offlineEnforced": True,
        "noUserCache": True,
    }


def main() -> int:
    """Run one strict probe and normalize every capability failure."""
    try:
        request = read_request()
        environment_path, job_path, model_path, descriptors = (
            validate_paths_and_files(request)
        )
        write_message({"type": "progress", "stage": "validating", "percent": 0})
        verify_artifacts(descriptors)
        configure_isolation(environment_path, job_path, model_path)
        install_runtime_guards()
        result = probe_refined(model_path)
        write_message({"type": "done", "result": result})
        return 0
    except InvalidRequestError:
        write_error("INVALID_REQUEST", "The Refined worker request is invalid.")
    except ArtifactMissingError:
        write_error("ARTIFACT_MISSING", "A required Refined artifact is missing.")
    except ArtifactMismatchError:
        write_error(
            "ARTIFACT_MISMATCH",
            "A required Refined artifact failed verification.",
        )
    except NetworkDeniedError:
        write_error(
            "NETWORK_DENIED",
            "Refined attempted a forbidden network operation.",
        )
    except SubprocessDeniedError:
        write_error(
            "SUBPROCESS_DENIED",
            "Refined attempted a forbidden child process.",
        )
    except LegacyLoaderRejectedError:
        write_error(
            "LEGACY_LOADER_REJECTED",
            "The legacy Refined loader is forbidden.",
        )
    except ForbiddenImportError:
        write_error(
            "FORBIDDEN_IMPORT",
            "Refined attempted a forbidden dependency import.",
        )
    except SystemExit:
        write_error(
            "WRAPPER_EXITED",
            "The Refined wrapper attempted to exit the worker.",
        )
    except ImportError:
        write_error(
            "WRAPPER_IMPORT_FAILED",
            "The Refined wrapper could not be loaded.",
        )
    except Exception:
        write_error("REFINED_PROBE_FAILED", "The Refined worker probe failed.")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
