"""Offline helpers for evidence-gated BPM metrical-normalization research.

This module does not participate in the production worker contract. It reduces
Beat This! logits to bounded aggregate evidence and evaluates deterministic
half/double-time candidates without using song identity or reference BPM.
"""

from __future__ import annotations

import contextlib
import hashlib
import importlib.metadata
import json
import math
import os
import socket
import statistics
import subprocess
import sys
import urllib.request
import wave
from array import array
from pathlib import Path
from typing import Any, NoReturn, Sequence


DEFAULT_FPS = 50
PEAK_RADIUS_FRAMES = 2
PARAMETER_KEYS = {
    "minimumIntervals",
    "maximumIntervalMadRatio",
    "halfMaximumBaseBpm",
    "halfMinimumMidpointSupport",
    "halfMinimumMidpointContrast",
    "halfMinimumMidpointBeatRatio",
    "doubleMinimumBaseBpm",
    "doubleMinimumBeatParityContrast",
    "doubleMinimumDownbeatParityContrast",
    "doubleMaximumWeakParitySupport",
}
EXTRACT_REQUEST_KEYS = {
    "operation",
    "environmentPath",
    "inputPath",
    "checkpointPath",
    "checkpointSha256",
}


def _sigmoid(value: float) -> float:
    if not math.isfinite(value):
        raise ValueError("logits must be finite")
    if value >= 0:
        return 1 / (1 + math.exp(-value))
    exp_value = math.exp(value)
    return exp_value / (1 + exp_value)


def _median(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    return float(statistics.median(values))


def _quantile(values: Sequence[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(ordered[lower])
    weight = position - lower
    return float(ordered[lower] * (1 - weight) + ordered[upper] * weight)


def _peak_probability(
    logits: Sequence[float],
    time_seconds: float,
    fps: int,
) -> float | None:
    center = round(time_seconds * fps)
    if center < 0 or center >= len(logits):
        return None
    start = max(0, center - PEAK_RADIUS_FRAMES)
    end = min(len(logits), center + PEAK_RADIUS_FRAMES + 1)
    return max(_sigmoid(float(logits[index])) for index in range(start, end))


def _sample_probabilities(
    logits: Sequence[float],
    times: Sequence[float],
    fps: int,
) -> list[float]:
    probabilities = [
        _peak_probability(logits, time_seconds, fps) for time_seconds in times
    ]
    return [value for value in probabilities if value is not None]


def _sample_peak_values(
    values: Sequence[float],
    times: Sequence[float],
    fps: float,
    *,
    radius_frames: int = 4,
) -> list[float]:
    samples: list[float] = []
    for time_seconds in times:
        center = round(time_seconds * fps)
        if center < 0 or center >= len(values):
            continue
        start = max(0, center - radius_frames)
        end = min(len(values), center + radius_frames + 1)
        window = [float(value) for value in values[start:end]]
        if any(not math.isfinite(value) or value < 0 for value in window):
            raise ValueError("invalid onset evidence")
        samples.append(max(window))
    return samples


def collect_onset_grid_diagnostics(
    beat_times: Sequence[float],
    onset_values: Sequence[float],
    onset_fps: float,
) -> dict[str, float]:
    """Measure independent audio-onset support at beat subdivisions."""
    times = [float(value) for value in beat_times]
    if (
        not math.isfinite(float(onset_fps))
        or onset_fps < 1
        or onset_fps > 1000
        or not hasattr(onset_values, "__len__")
        or len(onset_values) < 1
        or any(not math.isfinite(value) or value < 0 for value in times)
        or any(current <= previous for previous, current in zip(times, times[1:]))
    ):
        raise ValueError("invalid onset-grid evidence")
    midpoints = [
        previous + (current - previous) * 0.5
        for previous, current in zip(times, times[1:])
    ]
    flanks = [
        point
        for previous, current in zip(times, times[1:])
        for point in (
            previous + (current - previous) * 0.25,
            previous + (current - previous) * 0.75,
        )
    ]
    beat_support = _median(_sample_peak_values(onset_values, times, onset_fps))
    midpoint_support = _median(
        _sample_peak_values(onset_values, midpoints, onset_fps)
    )
    flank_support = _median(_sample_peak_values(onset_values, flanks, onset_fps))
    return {
        "onsetBeatSupportMedian": round(beat_support, 6),
        "onsetMidpointSupportMedian": round(midpoint_support, 6),
        "onsetMidpointContrast": round(midpoint_support - flank_support, 6),
        "onsetMidpointBeatRatio": round(
            midpoint_support / beat_support if beat_support > 0 else 0.0,
            6,
        ),
    }


def collect_grid_diagnostics(
    beat_times: Sequence[float],
    beat_logits: Sequence[float],
    downbeat_logits: Sequence[float],
    *,
    downbeat_times: Sequence[float] | None = None,
    fps: int = DEFAULT_FPS,
) -> dict[str, float | int]:
    """Reduce a beat grid and logits to bounded, path-free aggregate evidence."""
    times = [float(value) for value in beat_times]
    if (
        not isinstance(fps, int)
        or fps < 1
        or fps > 1000
        or len(beat_logits) < 1
        or len(downbeat_logits) < 1
        or any(not math.isfinite(value) or value < 0 for value in times)
        or any(current <= previous for previous, current in zip(times, times[1:]))
    ):
        raise ValueError("invalid beat-grid evidence")

    intervals = [current - previous for previous, current in zip(times, times[1:])]
    median_interval = _median(intervals)
    if median_interval > 0:
        interval_mad_ratio = max(
            _median([abs(value - median_interval) for value in intervals])
            / median_interval,
            (_quantile(intervals, 0.9) - _quantile(intervals, 0.1))
            / median_interval,
        )
    else:
        interval_mad_ratio = 1.0
    midpoints = [
        previous + (current - previous) * 0.5
        for previous, current in zip(times, times[1:])
    ]
    flanks = [
        point
        for previous, current in zip(times, times[1:])
        for point in (
            previous + (current - previous) * 0.25,
            previous + (current - previous) * 0.75,
        )
    ]
    beat_support = _sample_probabilities(beat_logits, times, fps)
    midpoint_support = _sample_probabilities(beat_logits, midpoints, fps)
    flank_support = _sample_probabilities(beat_logits, flanks, fps)
    downbeat_support = _sample_probabilities(downbeat_logits, times, fps)
    even_beat_support = beat_support[::2]
    odd_beat_support = beat_support[1::2]
    even_downbeat_support = downbeat_support[::2]
    odd_downbeat_support = downbeat_support[1::2]
    beat_median = _median(beat_support)
    midpoint_median = _median(midpoint_support)
    flank_median = _median(flank_support)
    even_beat_median = _median(even_beat_support)
    odd_beat_median = _median(odd_beat_support)
    matched_downbeat_indices: list[int] = []
    if downbeat_times is not None and times:
        for raw_downbeat_time in downbeat_times:
            downbeat_time = float(raw_downbeat_time)
            if not math.isfinite(downbeat_time) or downbeat_time < 0:
                raise ValueError("invalid downbeat-grid evidence")
            nearest_index = min(
                range(len(times)),
                key=lambda index: abs(times[index] - downbeat_time),
            )
            tolerance = median_interval * 0.25 if median_interval > 0 else 0.011
            if (
                abs(times[nearest_index] - downbeat_time) <= tolerance
                and (
                    not matched_downbeat_indices
                    or nearest_index > matched_downbeat_indices[-1]
                )
            ):
                matched_downbeat_indices.append(nearest_index)
    downbeat_spacings = [
        current - previous
        for previous, current in zip(
            matched_downbeat_indices,
            matched_downbeat_indices[1:],
        )
    ]
    downbeat_spacing_median = _median(downbeat_spacings)

    return {
        "intervalCount": len(intervals),
        "intervalMadRatio": round(interval_mad_ratio, 6),
        "beatSupportMedian": round(beat_median, 6),
        "midpointSupportMedian": round(midpoint_median, 6),
        "midpointContrast": round(midpoint_median - flank_median, 6),
        "midpointBeatRatio": round(
            midpoint_median / beat_median if beat_median > 0 else 0.0,
            6,
        ),
        "beatParityContrast": round(
            abs(even_beat_median - odd_beat_median),
            6,
        ),
        "downbeatParityContrast": round(
            abs(_median(even_downbeat_support) - _median(odd_downbeat_support)),
            6,
        ),
        "weakParitySupport": round(
            min(even_beat_median, odd_beat_median),
            6,
        ),
        "downbeatCount": len(matched_downbeat_indices),
        "downbeatSpacingMedianBeats": round(downbeat_spacing_median, 6),
        "downbeatSpacingMadBeats": round(
            _median(
                [
                    abs(value - downbeat_spacing_median)
                    for value in downbeat_spacings
                ]
            ),
            6,
        ),
    }


def _validate_parameters(parameters: dict[str, Any]) -> None:
    if not isinstance(parameters, dict) or set(parameters) != PARAMETER_KEYS:
        raise ValueError("invalid normalization parameters")
    if any(
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(float(value))
        for value in parameters.values()
    ):
        raise ValueError("invalid normalization parameters")


def normalize_bpm_candidate(
    base_bpm: float,
    diagnostics: dict[str, Any],
    parameters: dict[str, Any],
) -> dict[str, float | int | str]:
    """Choose an octave candidate only when independent evidence is decisive."""
    bpm = float(base_bpm)
    if not math.isfinite(bpm) or bpm < 20 or bpm > 400:
        raise ValueError("invalid base BPM")
    _validate_parameters(parameters)
    required_diagnostics = {
        "intervalCount",
        "intervalMadRatio",
        "midpointSupportMedian",
        "midpointContrast",
        "midpointBeatRatio",
        "beatParityContrast",
        "downbeatParityContrast",
        "weakParitySupport",
    }
    if not isinstance(diagnostics, dict) or not required_diagnostics.issubset(
        diagnostics
    ):
        return {"bpm": bpm, "factor": 1, "reason": "insufficient-evidence"}
    values = [float(diagnostics[key]) for key in required_diagnostics]
    if any(not math.isfinite(value) for value in values):
        return {"bpm": bpm, "factor": 1, "reason": "insufficient-evidence"}
    if (
        diagnostics["intervalCount"] < parameters["minimumIntervals"]
        or diagnostics["intervalMadRatio"]
        > parameters["maximumIntervalMadRatio"]
    ):
        return {"bpm": bpm, "factor": 1, "reason": "insufficient-evidence"}

    half_time_supported = (
        bpm <= parameters["halfMaximumBaseBpm"]
        and diagnostics["midpointSupportMedian"]
        >= parameters["halfMinimumMidpointSupport"]
        and diagnostics["midpointContrast"]
        >= parameters["halfMinimumMidpointContrast"]
        and diagnostics["midpointBeatRatio"]
        >= parameters["halfMinimumMidpointBeatRatio"]
    )
    if half_time_supported and bpm * 2 <= 400:
        return {
            "bpm": bpm * 2,
            "factor": 2,
            "reason": "half-time-midpoint-evidence",
        }

    double_time_supported = (
        bpm >= parameters["doubleMinimumBaseBpm"]
        and diagnostics["beatParityContrast"]
        >= parameters["doubleMinimumBeatParityContrast"]
        and diagnostics["downbeatParityContrast"]
        >= parameters["doubleMinimumDownbeatParityContrast"]
        and diagnostics["weakParitySupport"]
        <= parameters["doubleMaximumWeakParitySupport"]
    )
    if double_time_supported and bpm / 2 >= 20:
        return {
            "bpm": bpm / 2,
            "factor": 0.5,
            "reason": "double-time-parity-evidence",
        }

    return {"bpm": bpm, "factor": 1, "reason": "ambiguous"}


def estimate_windowed_bpm(
    beat_times: Sequence[float],
    *,
    window_beats: int,
) -> float | None:
    """Estimate modal tempo from the median of fixed beat-window intervals."""
    if isinstance(window_beats, bool) or not isinstance(window_beats, int):
        raise ValueError("invalid tempo window")
    if window_beats < 1 or window_beats > 512:
        raise ValueError("invalid tempo window")
    times = [float(value) for value in beat_times]
    if (
        any(not math.isfinite(value) or value < 0 for value in times)
        or any(current <= previous for previous, current in zip(times, times[1:]))
    ):
        raise ValueError("invalid beat times")
    if len(times) < 2:
        return None
    effective_window = min(window_beats, len(times) - 1)
    intervals = [
        (current - previous) / effective_window
        for previous, current in zip(
            times,
            times[effective_window:],
        )
        if math.isfinite(current - previous) and current > previous
    ]
    if not intervals:
        return None
    bpm = 60 / statistics.median(intervals)
    return bpm if math.isfinite(bpm) and 20 <= bpm <= 400 else None


def _estimate_global_bpm(beat_times: Sequence[float]) -> float | None:
    return estimate_windowed_bpm(beat_times, window_beats=32)


def _file_sha256(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _resolved_file(value: Any) -> Path:
    if not isinstance(value, str):
        raise ValueError("invalid extraction request")
    candidate = Path(value)
    if not candidate.is_absolute():
        raise ValueError("invalid extraction request")
    resolved = candidate.resolve(strict=True)
    if not resolved.is_file():
        raise ValueError("invalid extraction request")
    return resolved


def _resolved_directory(value: Any) -> Path:
    if not isinstance(value, str):
        raise ValueError("invalid extraction request")
    candidate = Path(value)
    if not candidate.is_absolute():
        raise ValueError("invalid extraction request")
    resolved = candidate.resolve(strict=True)
    if not resolved.is_dir():
        raise ValueError("invalid extraction request")
    return resolved


def _load_pcm16_wav(input_path: Path) -> tuple[Any, int]:
    with wave.open(str(input_path), "rb") as source:
        channels = source.getnchannels()
        sample_width = source.getsampwidth()
        sample_rate = source.getframerate()
        frame_count = source.getnframes()
        compression = source.getcomptype()
        frames = source.readframes(frame_count)
    if (
        channels not in (1, 2)
        or sample_width != 2
        or sample_rate != 44_100
        or compression != "NONE"
        or frame_count < 1
    ):
        raise ValueError("invalid decoded input")
    samples = array("h")
    samples.frombytes(frames)
    if sys.byteorder != "little":
        samples.byteswap()
    import numpy as np

    signal = np.asarray(samples, dtype=np.float32).reshape(-1, channels) / 32768.0
    return signal, sample_rate


def _amplitude_onset_envelope(signal: Any, sample_rate: int) -> tuple[Any, float]:
    """Build a cheap normalized amplitude-onset envelope at about 100 Hz."""
    import numpy as np

    hop_samples = max(1, round(sample_rate / 100))
    mono = np.mean(signal, axis=1)
    usable_samples = len(mono) - (len(mono) % hop_samples)
    if usable_samples < hop_samples * 3:
        raise ValueError("audio onset evidence is too short")
    frames = mono[:usable_samples].reshape(-1, hop_samples)
    amplitude = np.mean(np.abs(frames), axis=1)
    log_amplitude = np.log1p(amplitude * 100)
    onset = np.maximum(np.diff(log_amplitude, prepend=log_amplitude[0]), 0)
    scale = float(np.quantile(onset, 0.95))
    if not math.isfinite(scale) or scale <= 0:
        return np.zeros_like(onset), sample_rate / hop_samples
    return np.clip(onset / scale, 0, 1), sample_rate / hop_samples


def _deny_external_access(*_args: Any, **_kwargs: Any) -> NoReturn:
    raise RuntimeError("external access is disabled")


class _DeniedPopen(subprocess.Popen):
    def __init__(self, *_args: Any, **_kwargs: Any):
        _deny_external_access()


def _install_offline_policy(environment_path: Path) -> None:
    environment_text = str(environment_path)
    safe_import_paths = [
        entry
        for entry in sys.path
        if entry
        and "site-packages" not in entry.lower()
        and "dist-packages" not in entry.lower()
    ]
    sys.path[:] = [environment_text, *safe_import_paths]
    os.environ.update(
        {
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
            "PYTHONNOUSERSITE": "1",
        }
    )
    socket.create_connection = _deny_external_access
    socket.socket.connect = _deny_external_access
    socket.socket.connect_ex = _deny_external_access
    socket.getaddrinfo = _deny_external_access
    urllib.request.urlopen = _deny_external_access
    subprocess.Popen = _DeniedPopen
    os.system = _deny_external_access


def extract_grid_diagnostics(request: dict[str, Any]) -> dict[str, Any]:
    """Run one local research inference and return aggregates only."""
    if not isinstance(request, dict) or set(request) != EXTRACT_REQUEST_KEYS:
        raise ValueError("invalid extraction request")
    if request.get("operation") != "extract-bpm-grid-diagnostics":
        raise ValueError("invalid extraction request")
    environment_path = _resolved_directory(request["environmentPath"])
    input_path = _resolved_file(request["inputPath"])
    checkpoint_path = _resolved_file(request["checkpointPath"])
    checkpoint_sha256 = request["checkpointSha256"]
    if (
        input_path.suffix.lower() != ".wav"
        or checkpoint_path.name != "small0.ckpt"
        or not isinstance(checkpoint_sha256, str)
        or len(checkpoint_sha256) != 64
        or any(character not in "0123456789abcdef" for character in checkpoint_sha256)
        or _file_sha256(checkpoint_path) != checkpoint_sha256
    ):
        raise ValueError("invalid extraction request")
    _install_offline_policy(environment_path)
    from beat_this.inference import Audio2Frames
    from beat_this.model.postprocessor import Postprocessor

    if importlib.metadata.version("beat-this") != "1.1.0":
        raise ValueError("incompatible analysis environment")
    signal, sample_rate = _load_pcm16_wav(input_path)
    onset_envelope, onset_fps = _amplitude_onset_envelope(signal, sample_rate)
    analyzer = Audio2Frames(
        checkpoint_path=str(checkpoint_path),
        device="cpu",
        float16=False,
    )
    with contextlib.redirect_stdout(sys.stderr):
        beat_logits, downbeat_logits = analyzer(signal, sample_rate)
        raw_beats, raw_downbeats = Postprocessor(type="minimal", fps=DEFAULT_FPS)(
            beat_logits, downbeat_logits
        )
    beat_times = [float(value) for value in raw_beats]
    base_bpm = _estimate_global_bpm(beat_times)
    if base_bpm is None:
        raise ValueError("tempo evidence is missing")
    diagnostics = collect_grid_diagnostics(
        beat_times,
        beat_logits,
        downbeat_logits,
        downbeat_times=[float(value) for value in raw_downbeats],
        fps=DEFAULT_FPS,
    )
    diagnostics.update(
        collect_onset_grid_diagnostics(
            beat_times,
            onset_envelope,
            onset_fps,
        )
    )
    return {
        "baseBpm": round(base_bpm, 6),
        "diagnostics": diagnostics,
    }


def main() -> int:
    try:
        raw_request = sys.stdin.read(64 * 1024 + 1)
        if len(raw_request) > 64 * 1024:
            raise ValueError("extraction request is too large")
        request = json.loads(raw_request)
        result = extract_grid_diagnostics(request)
        sys.stdout.write(json.dumps(result, separators=(",", ":"), allow_nan=False))
        sys.stdout.write("\n")
        return 0
    except Exception:
        sys.stderr.write("BPM diagnostic extraction failed.\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
