"""Offline, same-recording alignment baseline. Never writes library sidecars.

This conservative PCM correlation probe estimates unit-rate candidate segments.
It does not implement DTW, speech recognition or pitch/rate correction.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import shutil
import subprocess
import time
from pathlib import Path

import numpy as np


VERSION = "pcm-window-ncc-v1"
SAMPLE_RATE = 4000
MAX_SECONDS = 300
WINDOW_SECONDS = 2
STEP_SECONDS = 0.5
MIN_SCORE = 0.8
MIN_MARGIN = 0.08
MIN_RMS = 0.0001
MAX_OFFSET_SPREAD_MS = 30


def _unmapped(intervals: list[tuple[float, float]], duration: float) -> list[dict]:
    cursor = 0
    gaps = []
    for start, end in intervals:
        if start > cursor:
            gaps.append({"startMs": cursor, "endMs": start})
        cursor = end
    if cursor < duration:
        gaps.append({"startMs": cursor, "endMs": duration})
    return gaps


def _pcm(signal: np.ndarray, sample_rate: int) -> np.ndarray:
    signal = np.asarray(signal, dtype=np.float64)
    if (
        signal.ndim != 1
        or not np.isfinite(signal).all()
        or len(signal) < sample_rate * WINDOW_SECONDS
        or len(signal) > sample_rate * MAX_SECONDS
    ):
        raise ValueError("Expected finite mono PCM between 2 and 300 seconds")
    return signal


def _correlation(left: np.ndarray, right: np.ndarray) -> float:
    left = left - left.mean()
    right = right - right.mean()
    energy = np.linalg.norm(left) * np.linalg.norm(right)
    return float(abs(np.dot(left, right)) / energy) if energy > 1e-12 else 0


def align_signals(source: np.ndarray, target: np.ndarray, sample_rate: int) -> dict:
    """Return review-only shared-content segments and ambiguous/unmatched anchors."""
    if not isinstance(sample_rate, int) or not 1000 <= sample_rate <= 16000:
        raise ValueError("Unsupported analysis sample rate")
    started = time.perf_counter()
    source, target = _pcm(source, sample_rate), _pcm(target, sample_rate)
    window = round(WINDOW_SECONDS * sample_rate)
    step = round(STEP_SECONDS * sample_rate)
    fft_size = 1 << (len(target) + window - 2).bit_length()
    target_fft = np.fft.rfft(target, n=fft_size)
    sums = np.concatenate(([0.0], np.cumsum(target)))
    squares = np.concatenate(([0.0], np.cumsum(target * target)))
    variance = np.maximum(
        squares[window:]
        - squares[:-window]
        - (sums[window:] - sums[:-window]) ** 2 / window,
        0,
    )
    target_active = variance > window * MIN_RMS**2
    anchors = []
    for start in range(0, len(source) - window + 1, step):
        clip = source[start : start + window]
        centered = clip - clip.mean()
        energy = float(np.dot(centered, centered))
        anchor = {"sourceMs": start * 1000 / sample_rate}
        if energy <= window * MIN_RMS**2:
            anchors.append({**anchor, "status": "silent"})
            continue
        convolution = np.fft.irfft(
            target_fft * np.fft.rfft(centered[::-1], n=fft_size), n=fft_size
        )[window - 1 : len(target)]
        denominator = np.sqrt(energy * variance)
        scores = np.divide(
            abs(convolution),
            denominator,
            out=np.zeros_like(variance),
            where=target_active,
        )
        np.clip(scores, 0, 1, out=scores)
        best = int(np.argmax(scores))
        score = float(scores[best])
        radius = round(sample_rate * 0.15)
        scores[max(0, best - radius) : best + radius + 1] = 0
        second = float(scores.max())
        status = "matched"
        if score < MIN_SCORE:
            status = "unmatched"
        elif score - second < MIN_MARGIN:
            status = "ambiguous"
        else:
            # A strong whole window must also agree in each quarter. This avoids
            # accepting a partly matching window over a large edit boundary.
            quarter = window // 4
            if any(
                _correlation(
                    clip[part : part + quarter],
                    target[best + part : best + part + quarter],
                )
                < MIN_SCORE
                for part in range(0, window, quarter)
            ):
                status = "boundary-review"
        anchors.append(
            {
                **anchor,
                "targetMs": best * 1000 / sample_rate,
                "score": round(score, 6),
                "secondScore": round(second, 6),
                "status": status,
            }
        )

    segments = []
    unstable_runs = []
    run = []

    def finish() -> None:
        if len(run) >= 2:
            offsets = [point["targetMs"] - point["sourceMs"] for point in run]
            spread = max(offsets) - min(offsets)
            if spread > MAX_OFFSET_SPREAD_MS:
                unstable_runs.append(
                    {
                        "sourceStartMs": run[0]["sourceMs"],
                        "sourceEndMs": run[-1]["sourceMs"] + WINDOW_SECONDS * 1000,
                        "offsetSpreadMs": spread,
                    }
                )
                run.clear()
                return
            offset = float(np.median(offsets))
            start = max(run[0]["sourceMs"], -offset)
            end = min(
                run[-1]["sourceMs"] + WINDOW_SECONDS * 1000,
                len(source) * 1000 / sample_rate,
                len(target) * 1000 / sample_rate - offset,
            )
            if end <= start:
                run.clear()
                return
            segments.append(
                {
                    "sourceStartMs": start,
                    "sourceEndMs": end,
                    "targetStartMs": start + offset,
                    "rate": 1,
                    "anchorCount": len(run),
                    "minimumScore": min(point["score"] for point in run),
                }
            )
        run.clear()

    for anchor in anchors:
        if anchor["status"] != "matched":
            finish()
            continue
        if (
            run
            and abs(
                (anchor["targetMs"] - anchor["sourceMs"])
                - (run[-1]["targetMs"] - run[-1]["sourceMs"])
            )
            > MAX_OFFSET_SPREAD_MS
        ):
            finish()
        run.append(anchor)
    finish()
    # Overlapping source/target segments or backwards matches are unsuitable for
    # automatic transfer. Reject the candidate rather than inventing a path.
    status = "candidate" if segments else "no-match"
    if not segments and unstable_runs:
        status = "unstable-offset"
    for left, right in zip(segments, segments[1:]):
        left_target_end = (
            left["targetStartMs"] + left["sourceEndMs"] - left["sourceStartMs"]
        )
        if (
            right["sourceStartMs"] < left["sourceEndMs"]
            or right["targetStartMs"] < left_target_end
        ):
            segments = []
            status = "order-conflict"
            break
    counts = {}
    for anchor in anchors:
        counts[anchor["status"]] = counts.get(anchor["status"], 0) + 1
    covered = sum(
        segment["sourceEndMs"] - segment["sourceStartMs"] for segment in segments
    )
    return {
        "algorithm": VERSION,
        "status": status,
        "reviewRequired": True,
        "supportsRateCorrection": False,
        "sampleRate": sample_rate,
        "sourceDurationMs": len(source) * 1000 / sample_rate,
        "targetDurationMs": len(target) * 1000 / sample_rate,
        "parameters": {
            "windowSeconds": WINDOW_SECONDS,
            "stepSeconds": STEP_SECONDS,
            "minimumScore": MIN_SCORE,
            "minimumMargin": MIN_MARGIN,
            "maximumOffsetSpreadMs": MAX_OFFSET_SPREAD_MS,
        },
        "coverage": covered / (len(source) * 1000 / sample_rate),
        "unmappedSource": _unmapped(
            [(item["sourceStartMs"], item["sourceEndMs"]) for item in segments],
            len(source) * 1000 / sample_rate,
        ),
        "unmappedTarget": _unmapped(
            [
                (
                    item["targetStartMs"],
                    item["targetStartMs"] + item["sourceEndMs"] - item["sourceStartMs"],
                )
                for item in segments
            ],
            len(target) * 1000 / sample_rate,
        ),
        "segments": segments,
        "unstableRuns": unstable_runs,
        "anchors": anchors,
        "anchorCounts": counts,
        "analysisSeconds": round(time.perf_counter() - started, 6),
    }


def _segments(segments: list[dict], inverse: bool) -> list[dict]:
    if not isinstance(segments, list):
        raise ValueError("Expected a segment list")
    result = []
    for segment in segments:
        if not isinstance(segment, dict):
            raise ValueError("Invalid mapping segment")
        start, end, target, rate = (
            segment.get(key)
            for key in ("sourceStartMs", "sourceEndMs", "targetStartMs", "rate")
        )
        if (
            not all(
                isinstance(value, (float, int))
                and not isinstance(value, bool)
                and math.isfinite(value)
                for value in (start, end, target, rate)
            )
            or start < 0
            or end <= start
            or target < 0
            or rate <= 0
        ):
            raise ValueError("Invalid mapping segment")
        target_end = target + (end - start) * rate
        if not math.isfinite(target_end):
            raise ValueError("Mapping endpoint overflow")
        item = {
            "start": target if inverse else start,
            "end": target_end if inverse else end,
            "target": start if inverse else target,
            "rate": 1 / rate if inverse else rate,
        }
        if result and (
            item["start"] < result[-1]["end"]
            or item["target"]
            < result[-1]["target"]
            + (result[-1]["end"] - result[-1]["start"]) * result[-1]["rate"]
        ):
            raise ValueError("Mapping must be disjoint and monotonic")
        result.append(item)
    return result


def map_time(
    segments: list[dict], position_ms: float, *, inverse: bool = False
) -> float | None:
    """Stateless, half-open lookup; unknown regions remain unmapped."""
    if not isinstance(position_ms, (int, float)) or not math.isfinite(position_ms):
        raise ValueError("Expected a finite time")
    for segment in _segments(segments, inverse):
        if segment["start"] <= position_ms < segment["end"]:
            return (
                segment["target"] + (position_ms - segment["start"]) * segment["rate"]
            )
    return None


def project_lyrics(
    rows: list[dict], segments: list[dict], *, inverse: bool = False
) -> list[dict]:
    """Transfer known source timing only; preserve original data as review evidence.

    No text-to-speech alignment, endpoint guessing, row splitting or canonical save.
    Start-only cues remain start-only; interval cues must fit a single segment.
    """
    mapping = _segments(segments, inverse)
    if not isinstance(rows, list):
        raise ValueError("Expected lyric rows")
    result, seen = [], set()
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Expected a lyric row")
        line_id = row.get("lineId")
        if not isinstance(line_id, str) or not line_id or line_id in seen:
            raise ValueError("Lyrics require unique nonempty line IDs")
        seen.add(line_id)
        candidate = None
        reason = "missing-or-invalid-timing"
        start, end = row.get("startMs"), row.get("endMs")
        if (
            end is None
            and isinstance(start, (int, float))
            and not isinstance(start, bool)
            and math.isfinite(start)
            and start >= 0
        ):
            projected = map_time(segments, start, inverse=inverse)
            if projected is not None:
                candidate = {"startMs": projected, "endMs": None}
                reason = "mapped-start-only"
            else:
                reason = "unmapped-start"
        valid = (
            all(
                isinstance(value, (int, float))
                and not isinstance(value, bool)
                and math.isfinite(value)
                for value in (start, end)
            )
            and 0 <= start < end
        )
        if valid:
            reason = "unmapped-or-crosses-edit"
            for segment in mapping:
                if segment["start"] <= start < end <= segment["end"]:
                    candidate = {
                        "startMs": segment["target"]
                        + (start - segment["start"]) * segment["rate"],
                        "endMs": segment["target"]
                        + (end - segment["start"]) * segment["rate"],
                    }
                    reason = "mapped-existing-timing"
                    break
        result.append(
            {
                "lineId": line_id,
                "original": copy.deepcopy(row),
                "candidate": candidate,
                "status": "candidate" if candidate else "needs-review",
                "reason": reason,
            }
        )
    return result


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _decode(path: Path, ffmpeg: str) -> np.ndarray:
    result = subprocess.run(
        [
            ffmpeg,
            "-nostdin",
            "-v",
            "error",
            "-i",
            str(path),
            "-map",
            "0:a:0",
            "-vn",
            "-ac",
            "1",
            "-ar",
            str(SAMPLE_RATE),
            "-t",
            str(MAX_SECONDS + 1),
            "-f",
            "f32le",
            "pipe:1",
        ],
        check=False,
        capture_output=True,
        timeout=120,
    )
    if result.returncode:
        raise ValueError("Unable to decode an audio stream")
    return np.frombuffer(result.stdout, dtype="<f4").astype(np.float64)


def run_probe(source: Path, target: Path, ffmpeg: str) -> dict:
    """Decode local files and bind the candidate to immutable input evidence."""
    started = time.perf_counter()
    before = (_sha256(source), _sha256(target))
    result = align_signals(
        _decode(source, ffmpeg), _decode(target, ffmpeg), SAMPLE_RATE
    )
    if before != (_sha256(source), _sha256(target)):
        raise ValueError("Inputs changed during analysis")
    result.update(
        {
            "sourceSha256": before[0],
            "targetSha256": before[1],
            "totalSeconds": round(time.perf_counter() - started, 6),
        }
    )
    return result


def _reject_json_number(value: str) -> None:
    raise ValueError(f"Non-finite JSON number: {value}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--target", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg"))
    parser.add_argument(
        "--lyrics", type=Path, help="JSON rows with lineId/startMs/endMs"
    )
    parser.add_argument(
        "--lyrics-direction",
        choices=("source-to-target", "target-to-source"),
        default="source-to-target",
    )
    args = parser.parse_args()
    inputs = [args.source, args.target] + ([args.lyrics] if args.lyrics else [])
    if not args.ffmpeg or args.output.resolve() in [path.resolve() for path in inputs]:
        parser.error("FFmpeg is required and output must differ from all inputs")
    if args.output.exists():
        parser.error("Output already exists; use a new report filename")
    rows = None
    if args.lyrics:
        with args.lyrics.open("rb") as lyrics_input:
            raw = lyrics_input.read(4 * 1024 * 1024 + 1)
        if len(raw) > 4 * 1024 * 1024:
            parser.error("Lyrics input exceeds 4 MiB")
        rows = json.loads(raw.decode("utf-8-sig"), parse_constant=_reject_json_number)
        if not isinstance(rows, list) or len(rows) > 10000:
            parser.error("Expected at most 10000 lyric rows")
    result = run_probe(args.source, args.target, args.ffmpeg)
    if rows is not None:
        result["lyrics"] = project_lyrics(
            rows,
            result["segments"],
            inverse=args.lyrics_direction == "target-to-source",
        )
        result["lyricsSha256"] = hashlib.sha256(raw).hexdigest()
        result["lyricsDirection"] = args.lyrics_direction
    payload = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as output:
        output.write(payload)


if __name__ == "__main__":
    main()
