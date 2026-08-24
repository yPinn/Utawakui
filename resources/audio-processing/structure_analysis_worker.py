"""Fail-closed worker for app-managed music structure analysis."""

from __future__ import annotations

import contextlib
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import socket
import statistics
import subprocess
import sys
import urllib.request
import wave
from array import array
from collections import namedtuple
from pathlib import Path
from typing import Any


PROTOCOL_VERSION = 1
MAX_REQUEST_BYTES = 64 * 1024
WRAPPER_VERSION = "3.1.0"
BEAT_THIS_VERSION = "1.1.0"
BEAT_THIS_FPS = 50
WINDOWS_X64_UNAME = namedtuple(
    "uname_result",
    "system node release version machine processor",
)("Windows", "", "", "", "AMD64", "AMD64")
ANALYSIS_PROFILES = {
    "beat-this-small0": {
        "analyzer_id": "beat-this",
        "profile_id": "beat-this-small0-cpu-v2",
        "model_name": "small0",
        "files": {"weights": "small0.ckpt"},
    },
    "beat-this-final0": {
        "analyzer_id": "beat-this",
        "profile_id": "beat-this-final0-cpu-v2",
        "model_name": "final0",
        "files": {"weights": "final0.ckpt"},
    },
    "all-in-one-harmonix-fold0": {
        "analyzer_id": "all-in-one-structure",
        "profile_id": "all-in-one-cpu-v1",
        "model_name": "harmonix-fold0",
        "files": {
            "structure-checkpoint": "harmonix-fold0-0vra4ys2.pth",
            "separation-checkpoint": "955717e8-8726e21a.th",
            "separation-config": "htdemucs.yaml",
        },
    },
}
LABEL_ORDER = (
    "start",
    "end",
    "intro",
    "outro",
    "break",
    "bridge",
    "inst",
    "solo",
    "verse",
    "chorus",
)
ROLE_MAP = {
    "start": "intro",
    "end": "outro",
    "intro": "intro",
    "outro": "outro",
    "break": "instrumental",
    "bridge": "bridge",
    "inst": "instrumental",
    "solo": "instrumental",
    "verse": "verse",
    "chorus": "chorus",
}


class WorkerError(Exception):
    """Bounded app-owned worker failure."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class NetworkDisabledError(RuntimeError):
    """Raised when third-party code attempts network access."""


class DeniedPopen(subprocess.Popen):
    """Keep Popen's class shape for asyncio imports while denying execution."""

    def __init__(self, *_args: Any, **_kwargs: Any):
        deny_child_process()


def invalid_request() -> WorkerError:
    return WorkerError(
        "INVALID_REQUEST",
        "The structure-analysis request is invalid.",
    )


def write_message(message: dict[str, Any]) -> None:
    """Write one compact JSON-lines protocol message."""
    sys.stdout.write(
        json.dumps(
            message,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        )
    )
    sys.stdout.write("\n")
    sys.stdout.flush()


def write_error(code: str, message: str) -> None:
    """Write an error without tracebacks or machine-local paths."""
    write_message({"type": "error", "code": code, "message": message})


def read_request() -> dict[str, Any]:
    """Read exactly one bounded JSON request."""
    raw_request = sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1)
    if not raw_request or len(raw_request) > MAX_REQUEST_BYTES:
        raise invalid_request()
    try:
        request = json.loads(raw_request)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise invalid_request() from error
    if not isinstance(request, dict):
        raise invalid_request()
    return request


def exact_keys(value: dict[str, Any], expected: set[str]) -> bool:
    return isinstance(value, dict) and set(value) == expected


def resolved_path(value: Any, *, directory: bool) -> Path:
    if not isinstance(value, str):
        raise invalid_request()
    candidate = Path(value)
    if not candidate.is_absolute():
        raise invalid_request()
    resolved = candidate.resolve(strict=True)
    if directory != resolved.is_dir():
        raise invalid_request()
    return resolved


def is_within(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
    except ValueError:
        return False
    return True


def file_sha256(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_request(request: dict[str, Any]) -> dict[str, Any]:
    expected = {
        "protocolVersion",
        "operation",
        "analyzerId",
        "profileId",
        "modelId",
        "modelName",
        "environmentPath",
        "inputPath",
        "jobPath",
        "modelPath",
        "modelFiles",
    }
    profile = ANALYSIS_PROFILES.get(request.get("modelId"))
    if (
        not exact_keys(request, expected)
        or request.get("protocolVersion") != PROTOCOL_VERSION
        or request.get("operation") != "analyze-structure"
        or profile is None
        or request.get("analyzerId") != profile["analyzer_id"]
        or request.get("profileId") != profile["profile_id"]
        or request.get("modelName") != profile["model_name"]
    ):
        raise invalid_request()
    environment_path = resolved_path(request["environmentPath"], directory=True)
    input_path = resolved_path(request["inputPath"], directory=False)
    job_path = resolved_path(request["jobPath"], directory=True)
    model_path = resolved_path(request["modelPath"], directory=True)
    if input_path.suffix.lower() != ".wav":
        raise invalid_request()
    model_files = request["modelFiles"]
    expected_model_files = profile["files"]
    if not isinstance(model_files, list) or len(model_files) != len(
        expected_model_files
    ):
        raise invalid_request()
    validated_files: list[dict[str, Any]] = []
    seen_paths: set[Path] = set()
    seen_roles: set[str] = set()
    for model_file in model_files:
        if not exact_keys(model_file, {"role", "path", "sha256"}):
            raise invalid_request()
        role = model_file.get("role")
        expected_hash = model_file.get("sha256")
        file_path = resolved_path(model_file.get("path"), directory=False)
        if (
            role not in expected_model_files
            or not isinstance(expected_hash, str)
            or len(expected_hash) != 64
            or any(character not in "0123456789abcdef" for character in expected_hash)
            or not is_within(file_path, model_path)
            or file_path in seen_paths
            or file_path.name != expected_model_files.get(role)
        ):
            raise invalid_request()
        seen_paths.add(file_path)
        seen_roles.add(role)
        validated_files.append(
            {"role": role, "path": file_path, "sha256": expected_hash}
        )
    if seen_roles != set(expected_model_files):
        raise invalid_request()
    expected_model_paths = {item["path"] for item in validated_files}
    discovered_model_paths = {
        item.resolve()
        for pattern in ("*.ckpt", "*.pth", "*.th", "*.yaml")
        for item in model_path.glob(pattern)
        if item.is_file()
    }
    if discovered_model_paths != expected_model_paths:
        raise invalid_request()
    for model_file in validated_files:
        if file_sha256(model_file["path"]) != model_file["sha256"]:
            raise WorkerError(
                "MODEL_INTEGRITY_FAILED",
                "The structure-analysis model failed integrity verification.",
            )
    return {
        "environment_path": environment_path,
        "input_path": input_path,
        "job_path": job_path,
        "model_path": model_path,
        "model_files": validated_files,
        "model_id": request["modelId"],
        "profile": profile,
    }


def deny_network(*_args: Any, **_kwargs: Any) -> Any:
    raise NetworkDisabledError("network access is disabled")


def deny_child_process(*_args: Any, **_kwargs: Any) -> Any:
    raise WorkerError(
        "CHILD_PROCESS_DISABLED",
        "The structure-analysis package attempted to start another process.",
    )


def install_runtime_policy(environment_path: Path, job_path: Path) -> None:
    environment_text = str(environment_path)
    safe_import_paths = [
        entry
        for entry in sys.path
        if entry
        and "site-packages" not in entry.lower()
        and "dist-packages" not in entry.lower()
    ]
    sys.path[:] = [environment_text, *safe_import_paths]
    cache_path = job_path / "cache"
    cache_path.mkdir(exist_ok=True)
    os.environ.update({
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "HF_HOME": str(cache_path / "huggingface"),
        "TORCH_HOME": str(cache_path / "torch"),
        "XDG_CACHE_HOME": str(cache_path),
        "MPLCONFIGDIR": str(cache_path / "matplotlib"),
        "PYTHONNOUSERSITE": "1",
    })
    # Avoid CPython's Windows `ver` shell probe entirely. This capability is
    # packaged only for Windows x64, so third-party platform checks receive the
    # fixed target identity without consulting COMSPEC or PATH.
    platform.uname = lambda: WINDOWS_X64_UNAME
    socket.create_connection = deny_network
    socket.socket.connect = deny_network
    socket.socket.connect_ex = deny_network
    socket.getaddrinfo = deny_network
    socket.gethostbyaddr = deny_network
    socket.gethostbyname = deny_network
    socket.gethostbyname_ex = deny_network
    urllib.request.urlopen = deny_network
    subprocess.Popen = DeniedPopen
    os.system = deny_child_process


def wav_duration_ms(input_path: Path) -> int:
    try:
        with wave.open(str(input_path), "rb") as source:
            frame_rate = source.getframerate()
            frame_count = source.getnframes()
    except (wave.Error, OSError) as error:
        raise WorkerError(
            "INVALID_DECODED_INPUT",
            "The decoded analysis input is invalid.",
        ) from error
    if frame_rate <= 0 or frame_count <= 0:
        raise WorkerError(
            "INVALID_DECODED_INPUT",
            "The decoded analysis input is invalid.",
        )
    return round(frame_count * 1000 / frame_rate)


def scalar_confidence(values: Any, time_seconds: float, fps: float) -> float:
    if values is None or not hasattr(values, "__len__") or len(values) == 0:
        raise WorkerError(
            "ANALYSIS_CONFIDENCE_MISSING",
            "The analyzer did not return confidence evidence.",
        )
    index = min(max(round(time_seconds * fps), 0), len(values) - 1)
    value = float(values[index])
    if not math.isfinite(value) or not 0 <= value <= 1:
        raise WorkerError(
            "ANALYSIS_CONFIDENCE_INVALID",
            "The analyzer returned invalid confidence evidence.",
        )
    return round(value, 6)


def section_confidence(
    labels: Any, label: str, start: float, end: float, fps: float
) -> float:
    if label not in LABEL_ORDER or labels is None or not hasattr(labels, "__len__"):
        raise WorkerError(
            "ANALYSIS_CONFIDENCE_MISSING",
            "The analyzer did not return confidence evidence.",
        )
    start_frame = max(0, round(start * fps))
    label_index = LABEL_ORDER.index(label)
    if len(labels) == len(LABEL_ORDER):
        frame_values = labels[label_index]
        end_frame = min(
            len(frame_values), max(start_frame + 1, round(end * fps))
        )
        values = [float(frame_values[index]) for index in range(start_frame, end_frame)]
    elif len(labels) > 0 and len(labels[0]) == len(LABEL_ORDER):
        end_frame = min(len(labels), max(start_frame + 1, round(end * fps)))
        values = [
            float(labels[index][label_index])
            for index in range(start_frame, end_frame)
        ]
    else:
        raise WorkerError(
            "ANALYSIS_CONFIDENCE_MISSING",
            "The analyzer did not return confidence evidence.",
        )
    if not values or any(
        not math.isfinite(value) or value < 0 or value > 1 for value in values
    ):
        raise WorkerError(
            "ANALYSIS_CONFIDENCE_INVALID",
            "The analyzer returned invalid confidence evidence.",
        )
    return round(sum(values) / len(values), 6)


def local_structure_checkpoint(model_files: list[dict[str, Any]]) -> Path:
    matches = [
        item["path"]
        for item in model_files
        if item["role"] == "structure-checkpoint"
    ]
    if len(matches) != 1:
        raise WorkerError("INVALID_REQUEST", "The structure-analysis model is invalid.")
    return matches[0]


def analyze_all_in_one(validated: dict[str, Any]) -> dict[str, Any]:
    try:
        import allin1_infer
        from allin1_infer import CustomSeparatorProvider
        from allin1_infer.models import loaders
        from demucs_infer.api import Separator
        from demucs_infer.audio import save_audio
    except (ImportError, SystemExit) as error:
        raise WorkerError(
            "ENVIRONMENT_INVALID",
            "The structure-analysis environment is incomplete.",
        ) from error
    if getattr(allin1_infer, "__version__", None) != WRAPPER_VERSION:
        raise WorkerError(
            "ENVIRONMENT_INVALID",
            "The structure-analysis environment is incompatible.",
        )
    structure_checkpoint = local_structure_checkpoint(validated["model_files"])
    loaders._download_checkpoint = lambda *_args, **_kwargs: str(structure_checkpoint)

    class AppManagedSeparator:
        def __init__(self) -> None:
            self.separator = Separator(
                model="htdemucs",
                repo=validated["model_path"],
                device="cpu",
                shifts=0,
                overlap=0.25,
                split=True,
                jobs=0,
                progress=False,
            )

        def separate(self, audio_path: str, output_dir: str, device: str) -> Path:
            if device != "cpu":
                raise WorkerError(
                    "DEVICE_POLICY_FAILED",
                    "Structure analysis is CPU-only.",
                )
            try:
                import soundfile
                import torch
            except ImportError as error:
                raise WorkerError(
                    "ENVIRONMENT_INVALID",
                    "The structure-analysis environment is incomplete.",
                ) from error
            samples, sample_rate = soundfile.read(
                str(audio_path), dtype="float32", always_2d=True
            )
            mixture = torch.from_numpy(samples.T).contiguous()
            _mixture, stems = self.separator.separate_tensor(mixture, sample_rate)
            target = Path(output_dir) / "htdemucs" / Path(audio_path).stem
            target.mkdir(parents=True, exist_ok=True)
            for stem_name in ("bass", "drums", "other", "vocals"):
                save_audio(
                    stems[stem_name],
                    target / f"{stem_name}.wav",
                    self.separator.samplerate,
                    clip="rescale",
                    bits_per_sample=16,
                    as_float=False,
                )
            return target

    provider = CustomSeparatorProvider(AppManagedSeparator())
    write_message({"type": "progress", "stage": "analyzing", "percent": 10})
    try:
        with contextlib.redirect_stdout(sys.stderr):
            result = allin1_infer.analyze(
                str(validated["input_path"]),
                model=validated["profile"]["model_name"],
                device="cpu",
                include_activations=True,
                include_embeddings=False,
                demix_dir=validated["job_path"] / "demix",
                spec_dir=validated["job_path"] / "spec",
                keep_byproducts=False,
                multiprocess=False,
                stem_provider=provider,
            )
    except NetworkDisabledError:
        raise
    except WorkerError:
        raise
    except (Exception, SystemExit, KeyboardInterrupt) as error:
        raise WorkerError(
            "ANALYSIS_FAILED",
            "Music structure analysis failed.",
        ) from error
    activations = getattr(result, "activations", None)
    if not isinstance(activations, dict):
        raise WorkerError(
            "ANALYSIS_CONFIDENCE_MISSING",
            "The analyzer did not return confidence evidence.",
        )
    beat_activation = activations.get("beat")
    downbeat_activation = activations.get("downbeat")
    label_activation = activations.get("label")
    activation_fps = float(getattr(result, "activation_fps", 0))
    if not math.isfinite(activation_fps) or not 1 <= activation_fps <= 1000:
        raise WorkerError(
            "ANALYSIS_CONFIDENCE_INVALID",
            "The analyzer returned invalid confidence evidence.",
        )
    beats: list[dict[str, Any]] = []
    raw_beats = list(getattr(result, "beats", []))
    positions = list(getattr(result, "beat_positions", []))
    downbeats = [float(value) for value in getattr(result, "downbeats", [])]
    if any(not math.isfinite(value) for value in downbeats):
        raise WorkerError(
            "ANALYSIS_CONFIDENCE_INVALID",
            "The analyzer returned invalid confidence evidence.",
        )
    for index, beat_time in enumerate(raw_beats):
        time_seconds = float(beat_time)
        if not math.isfinite(time_seconds) or time_seconds < 0:
            raise WorkerError(
                "ANALYSIS_CONFIDENCE_INVALID",
                "The analyzer returned invalid confidence evidence.",
            )
        is_downbeat = any(abs(time_seconds - value) <= 0.01 for value in downbeats)
        confidence = scalar_confidence(
            beat_activation, time_seconds, activation_fps
        )
        if is_downbeat:
            confidence = min(
                confidence,
                scalar_confidence(
                    downbeat_activation, time_seconds, activation_fps
                ),
            )
        beat: dict[str, Any] = {
            "timeMs": round(time_seconds * 1000),
            "downbeat": is_downbeat,
            "confidence": confidence,
        }
        if index < len(positions):
            beat["positionInBar"] = int(positions[index])
        beats.append(beat)
    beat_confidences = [beat["confidence"] for beat in beats]
    bpm = float(getattr(result, "bpm", 0))
    tempo = (
        {
            "bpm": bpm,
            "confidence": round(
                sum(beat_confidences) / len(beat_confidences), 6
            ),
        }
        if beat_confidences and math.isfinite(bpm) and 20 <= bpm <= 400
        else None
    )
    sections = []
    for index, segment in enumerate(getattr(result, "segments", []), start=1):
        raw_label = str(segment.label)
        start = float(segment.start)
        end = float(segment.end)
        if (
            not math.isfinite(start)
            or not math.isfinite(end)
            or start < 0
            or end <= start
        ):
            raise WorkerError(
                "ANALYSIS_CONFIDENCE_INVALID",
                "The analyzer returned invalid confidence evidence.",
            )
        sections.append({
            "sectionId": f"section_{index:02d}",
            "startMs": round(start * 1000),
            "endMs": round(end * 1000),
            "role": ROLE_MAP.get(raw_label, "unknown"),
            "rawLabel": raw_label[:64] or "unknown",
            "confidence": section_confidence(
                label_activation, raw_label, start, end, activation_fps
            ),
        })
    write_message({"type": "progress", "stage": "validating", "percent": 95})
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "analyzerId": validated["profile"]["analyzer_id"],
        "profileId": validated["profile"]["profile_id"],
        "modelId": validated["model_id"],
        "offlineEnforced": True,
        "noUserCache": True,
        "durationMs": wav_duration_ms(validated["input_path"]),
        "tempo": tempo,
        "beats": beats,
        "sections": sections,
    }


def local_weights_checkpoint(model_files: list[dict[str, Any]]) -> Path:
    matches = [item["path"] for item in model_files if item["role"] == "weights"]
    if len(matches) != 1:
        raise WorkerError("INVALID_REQUEST", "The structure-analysis model is invalid.")
    return matches[0]


def load_pcm16_wav(input_path: Path) -> tuple[Any, int]:
    """Read the fixed FFmpeg PCM profile without TorchAudio file I/O."""
    try:
        with wave.open(str(input_path), "rb") as source:
            channels = source.getnchannels()
            sample_width = source.getsampwidth()
            sample_rate = source.getframerate()
            compression = source.getcomptype()
            frame_count = source.getnframes()
            frames = source.readframes(frame_count)
    except (OSError, wave.Error) as error:
        raise WorkerError(
            "INVALID_DECODED_INPUT",
            "The decoded analysis input is invalid.",
        ) from error
    if (
        channels not in (1, 2)
        or sample_width != 2
        or sample_rate != 44_100
        or compression != "NONE"
        or frame_count < 1
    ):
        raise WorkerError(
            "INVALID_DECODED_INPUT",
            "The decoded analysis input is invalid.",
        )
    samples = array("h")
    samples.frombytes(frames)
    if sys.byteorder != "little":
        samples.byteswap()
    try:
        import numpy as np
    except ImportError as error:
        raise WorkerError(
            "ENVIRONMENT_INVALID",
            "The structure-analysis environment is incomplete.",
        ) from error
    signal = np.asarray(samples, dtype=np.float32).reshape(-1, channels) / 32768.0
    return signal, sample_rate


def logit_confidence(logits: Any, time_seconds: float) -> float:
    index = min(max(round(time_seconds * BEAT_THIS_FPS), 0), len(logits) - 1)
    value = float(logits[index])
    if not math.isfinite(value):
        raise WorkerError(
            "ANALYSIS_CONFIDENCE_INVALID",
            "The analyzer returned invalid confidence evidence.",
        )
    if value >= 0:
        probability = 1 / (1 + math.exp(-value))
    else:
        exp_value = math.exp(value)
        probability = exp_value / (1 + exp_value)
    return round(probability, 6)


def estimate_global_bpm(beat_times: list[float]) -> float | None:
    """Estimate tempo across long beat windows to reduce frame-grid bias."""
    if len(beat_times) < 2:
        return None
    window_beats = min(32, len(beat_times) - 1)
    intervals = [
        (current - previous) / window_beats
        for previous, current in zip(
            beat_times,
            beat_times[window_beats:],
        )
        if math.isfinite(current - previous) and current > previous
    ]
    if not intervals:
        return None
    bpm = 60 / statistics.median(intervals)
    return bpm if math.isfinite(bpm) and 20 <= bpm <= 400 else None


def analyze_beat_this(validated: dict[str, Any]) -> dict[str, Any]:
    try:
        from beat_this.inference import Audio2Frames
        from beat_this.model.postprocessor import Postprocessor
    except (ImportError, SystemExit) as error:
        raise WorkerError(
            "ENVIRONMENT_INVALID",
            "The structure-analysis environment is incomplete.",
        ) from error
    try:
        installed_version = importlib.metadata.version("beat-this")
    except importlib.metadata.PackageNotFoundError as error:
        raise WorkerError(
            "ENVIRONMENT_INVALID",
            "The structure-analysis environment is incomplete.",
        ) from error
    if installed_version != BEAT_THIS_VERSION:
        raise WorkerError(
            "ENVIRONMENT_INVALID",
            "The structure-analysis environment is incompatible.",
        )
    checkpoint_path = local_weights_checkpoint(validated["model_files"])
    signal, sample_rate = load_pcm16_wav(validated["input_path"])
    write_message({"type": "progress", "stage": "analyzing", "percent": 10})
    try:
        analyzer = Audio2Frames(
            checkpoint_path=str(checkpoint_path),
            device="cpu",
            float16=False,
        )
        with contextlib.redirect_stdout(sys.stderr):
            beat_logits, downbeat_logits = analyzer(signal, sample_rate)
            raw_beats, raw_downbeats = Postprocessor(
                type="minimal", fps=BEAT_THIS_FPS
            )(beat_logits, downbeat_logits)
    except NetworkDisabledError:
        raise
    except WorkerError:
        raise
    except (Exception, SystemExit, KeyboardInterrupt) as error:
        raise WorkerError(
            "ANALYSIS_FAILED",
            "Music structure analysis failed.",
        ) from error

    beat_times = [float(value) for value in raw_beats]
    downbeat_times = [float(value) for value in raw_downbeats]
    if any(
        not math.isfinite(value) or value < 0
        for value in [*beat_times, *downbeat_times]
    ) or any(current <= previous for previous, current in zip(beat_times, beat_times[1:])):
        raise WorkerError(
            "ANALYSIS_CONFIDENCE_INVALID",
            "The analyzer returned invalid confidence evidence.",
        )

    beats: list[dict[str, Any]] = []
    position_in_bar: int | None = None
    for time_seconds in beat_times:
        is_downbeat = any(
            abs(time_seconds - downbeat_time) <= 0.011
            for downbeat_time in downbeat_times
        )
        confidence = logit_confidence(beat_logits, time_seconds)
        if is_downbeat:
            confidence = min(
                confidence,
                logit_confidence(downbeat_logits, time_seconds),
            )
            position_in_bar = 1
        elif position_in_bar is not None:
            position_in_bar += 1
        beat: dict[str, Any] = {
            "timeMs": round(time_seconds * 1000),
            "downbeat": is_downbeat,
            "confidence": confidence,
        }
        if position_in_bar is not None and position_in_bar <= 32:
            beat["positionInBar"] = position_in_bar
        beats.append(beat)

    bpm = estimate_global_bpm(beat_times)
    beat_confidences = [beat["confidence"] for beat in beats]
    tempo = (
        {
            "bpm": round(bpm, 6),
            "confidence": round(
                sum(beat_confidences) / len(beat_confidences), 6
            ),
        }
        if bpm is not None and beat_confidences
        else None
    )
    write_message({"type": "progress", "stage": "validating", "percent": 95})
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "analyzerId": validated["profile"]["analyzer_id"],
        "profileId": validated["profile"]["profile_id"],
        "modelId": validated["model_id"],
        "offlineEnforced": True,
        "noUserCache": True,
        "durationMs": wav_duration_ms(validated["input_path"]),
        "tempo": tempo,
        "beats": beats,
        "sections": [],
    }


def analyze(validated: dict[str, Any]) -> dict[str, Any]:
    install_runtime_policy(validated["environment_path"], validated["job_path"])
    if validated["profile"]["analyzer_id"] == "beat-this":
        return analyze_beat_this(validated)
    return analyze_all_in_one(validated)


def main() -> int:
    try:
        request = read_request()
        validated = validate_request(request)
        write_message({"type": "progress", "stage": "starting", "percent": 0})
        write_message({"type": "done", "result": analyze(validated)})
        return 0
    except NetworkDisabledError:
        write_error("NETWORK_DISABLED", "Structure analysis cannot access the network.")
        return 2
    except WorkerError as error:
        write_error(error.code, str(error))
        return 2
    except (SystemExit, KeyboardInterrupt):
        write_error("ANALYSIS_FAILED", "Music structure analysis failed.")
        return 2
    except Exception:
        write_error("ANALYSIS_FAILED", "Music structure analysis failed.")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
