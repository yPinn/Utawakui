"""Reproduce a synthetic holdout evaluation without using a private library."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import shutil
import sys
from pathlib import Path

import numpy as np

from fixtures import RATE, lowpass_noise, music, write_wav
from probe import align_signals, map_time, project_lyrics, run_probe


def segment(start: float, end: float, target: float, rate: float = 1) -> dict:
    return {
        "sourceStartMs": start * 1000,
        "sourceEndMs": end * 1000,
        "targetStartMs": target * 1000,
        "rate": rate,
    }


def score(result: dict, truth: list[dict]) -> dict:
    """Measure a 100 ms grid independently of the correlation anchor lattice."""
    matched = wrong = missing = expected_count = 0
    errors = []
    for position in range(0, round(result["sourceDurationMs"]), 100):
        expected = map_time(truth, position)
        actual = map_time(result["segments"], position)
        expected_count += expected is not None
        if actual is None:
            missing += expected is not None
        elif expected is None:
            wrong += 1
        else:
            matched += 1
            errors.append(abs(expected - actual))
            wrong += errors[-1] > 100
    return {
        "expectedSharedPoints": expected_count,
        "matchedPoints": matched,
        "unmappedSharedPoints": missing,
        "wrongOrUnsupportedPoints": wrong,
        "maximumMappedErrorMs": max(errors, default=None),
        "sharedCoverage": matched / expected_count if expected_count else None,
    }


def evaluate(output: Path) -> dict:
    """Write immutable per-case reports, WAVs and a compact summary."""
    output.mkdir(parents=True, exist_ok=False)
    source = music(24, 21)
    slow_drift_source = lowpass_noise()
    cases = [
        (
            "padding-gain",
            source,
            np.concatenate((np.zeros(3000), source * 0.3, np.zeros(4000))),
            [segment(0, 24, 0.75)],
        ),
        ("source-intro-removed", source, source[2 * RATE :], [segment(2, 24, 0)]),
        (
            "insert-delete",
            source,
            np.concatenate(
                (
                    np.zeros(5000),
                    source[: 8 * RATE],
                    music(3, 71),
                    source[8 * RATE : 16 * RATE],
                    source[19 * RATE :],
                )
            ),
            [segment(0, 8, 1.25), segment(8, 16, 12.25), segment(19, 24, 20.25)],
        ),
        (
            "off-grid-edit",
            source,
            np.concatenate(
                (
                    source[: round(8.17 * RATE)],
                    music(2.37, 81),
                    source[round(8.17 * RATE) :],
                )
            ),
            [segment(0, 8.17, 0), segment(8.17, 24, 10.54)],
        ),
        (
            "repeated",
            source[: 6 * RATE],
            np.concatenate((source[: 6 * RATE], np.zeros(RATE), source[: 6 * RATE])),
            [],
        ),
        ("unrelated", source, music(24, 111), []),
        ("silence", source, np.zeros_like(source), []),
        (
            "rate-drift-unsupported",
            source,
            np.interp(np.arange(0, len(source), 1.015), np.arange(len(source)), source),
            [segment(0, 24, 0, rate=1 / 1.015)],
        ),
        (
            "slow-drift-regression",
            slow_drift_source,
            np.interp(
                np.arange(0, len(slow_drift_source), 1.003),
                np.arange(len(slow_drift_source)),
                slow_drift_source,
            ),
            [segment(0, 120, 0, rate=1 / 1.003)],
        ),
    ]
    summary = {
        "syntheticOnly": True,
        "python": sys.version.split()[0],
        "numpy": np.__version__,
        "platform": platform.platform(),
        "scoringStepMs": 100,
        "scoringToleranceMs": 100,
        "fixtureFamily": "harmonic-percussive-non-vocal",
        "holdoutSeeds": [21, 71, 81, 111, 121],
        "regressionSeeds": [918],
        "scriptSha256": {
            name: hashlib.sha256(
                Path(__file__).with_name(name).read_bytes()
            ).hexdigest()
            for name in ("probe.py", "fixtures.py", "evaluate.py")
        },
        "cases": [],
    }
    for name, left, right, truth in cases:
        result = align_signals(left, right, RATE)
        result["sourcePcmSha256"] = hashlib.sha256(left.tobytes()).hexdigest()
        result["targetPcmSha256"] = hashlib.sha256(right.tobytes()).hexdigest()
        result["truth"] = truth
        result["metrics"] = score(result, truth)
        result["lyrics"] = project_lyrics(
            [
                {"lineId": "verse", "text": "テスト", "startMs": 1000, "endMs": 2000},
                {
                    "lineId": "chorus-1",
                    "text": "同じ言葉",
                    "startMs": 10000,
                    "endMs": 11000,
                },
                {
                    "lineId": "chorus-2",
                    "text": "同じ言葉",
                    "startMs": 17000,
                    "endMs": 18000,
                },
            ],
            result["segments"],
        )
        (output / f"{name}.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        summary["cases"].append(
            {
                "name": name,
                "status": result["status"],
                "analysisSeconds": result["analysisSeconds"],
                "segments": len(result["segments"]),
                **result["metrics"],
            }
        )
    # One four-minute file-level run includes real FFmpeg decode and hashing.
    long_source = music(240, 121)
    source_path, target_path = output / "long-source.wav", output / "long-target.wav"
    write_wav(source_path, long_source)
    write_wav(target_path, np.concatenate((np.zeros(5000), long_source * 0.5)))
    result = run_probe(source_path, target_path, shutil.which("ffmpeg"))
    result["metrics"] = score(result, [segment(0, 240, 1.25)])
    (output / "four-minute.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8"
    )
    summary["fourMinute"] = {
        "analysisSeconds": result["analysisSeconds"],
        "totalSeconds": result["totalSeconds"],
        **result["metrics"],
    }
    (output / "summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    if not shutil.which("ffmpeg"):
        parser.error("FFmpeg is required")
    print(json.dumps(evaluate(args.output_dir), indent=2))
