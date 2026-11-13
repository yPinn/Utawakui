"""Controlled signal tests; these do not measure natural singing accuracy."""

from __future__ import annotations

import copy
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

from probe import align_signals, map_time, project_lyrics, run_probe
from fixtures import RATE, lowpass_noise, music, write_wav
from evaluate import score


class SignalAlignmentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.source = music()

    def test_leading_and_trailing_padding_and_gain(self) -> None:
        target = np.concatenate((np.zeros(5000), self.source * 0.4, np.zeros(8000)))
        result = align_signals(self.source, target, RATE)
        self.assertEqual(len(result["segments"]), 1)
        for position in (0, 4000, 12000, 23000):
            self.assertAlmostEqual(
                map_time(result["segments"], position), position + 1250, delta=1
            )

    def test_insertion_deletion_and_inverse_lookup(self) -> None:
        target = np.concatenate(
            (
                np.zeros(5000),
                self.source[: 8 * RATE],
                music(3, 55),
                self.source[8 * RATE : 16 * RATE],
                self.source[19 * RATE :],
            )
        )
        result = align_signals(self.source, target, RATE)
        self.assertEqual(len(result["segments"]), 3)
        for source_ms, target_ms in ((4000, 5250), (12000, 16250), (22000, 23250)):
            self.assertAlmostEqual(
                map_time(result["segments"], source_ms), target_ms, delta=1
            )
            self.assertAlmostEqual(
                map_time(result["segments"], target_ms, inverse=True),
                source_ms,
                delta=1,
            )
        self.assertIsNone(map_time(result["segments"], 17500))
        self.assertIsNone(map_time(result["segments"], 10500, inverse=True))
        self.assertIn({"startMs": 16000, "endMs": 19000}, result["unmappedSource"])
        self.assertIn({"startMs": 9250, "endMs": 12250}, result["unmappedTarget"])

    def test_repeated_occurrence_is_ambiguous(self) -> None:
        source = self.source[: 6 * RATE]
        target = np.concatenate((source, np.zeros(RATE), source))
        result = align_signals(source, target, RATE)
        self.assertEqual(result["segments"], [])
        self.assertGreater(result["anchorCounts"].get("ambiguous", 0), 0)

    def test_unrelated_and_silent_inputs_do_not_match(self) -> None:
        for target in (music(seed=93), np.zeros_like(self.source)):
            result = align_signals(self.source, target, RATE)
            self.assertEqual(result["segments"], [])

    def test_reordered_blocks_are_not_accepted(self) -> None:
        target = np.concatenate((self.source[12 * RATE :], self.source[: 12 * RATE]))
        result = align_signals(self.source, target, RATE)
        self.assertEqual(result["segments"], [])
        self.assertEqual(result["status"], "order-conflict")

    def test_constant_rate_drift_is_not_claimed_supported(self) -> None:
        target = np.interp(
            np.arange(0, len(self.source), 1.015),
            np.arange(len(self.source)),
            self.source,
        )
        result = align_signals(self.source, target, RATE)
        self.assertLess(result["coverage"], 0.1)
        self.assertFalse(result["supportsRateCorrection"])

    def test_bounds_and_invalid_pcm(self) -> None:
        for source in (np.array([np.nan] * 10000), np.zeros((10000, 2)), np.array([])):
            with self.assertRaises(ValueError):
                align_signals(source, self.source, RATE)

    def test_slow_drift_cannot_accumulate_into_a_fixed_offset(self) -> None:
        source = lowpass_noise()
        target = np.interp(
            np.arange(0, len(source), 1.003), np.arange(len(source)), source
        )
        result = align_signals(source, target, RATE)
        self.assertEqual(result["segments"], [])
        self.assertEqual(result["status"], "unstable-offset")

    def test_small_residual_cannot_produce_out_of_bounds_segments(self) -> None:
        source = lowpass_noise(seconds=24)
        target = np.interp(
            np.arange(0, len(source), 1.0005), np.arange(len(source)), source
        )
        result = align_signals(source, target, RATE)
        self.assertEqual(len(result["segments"]), 1)
        for segment in result["segments"]:
            self.assertGreaterEqual(segment["targetStartMs"], 0)
            target_end = (
                segment["targetStartMs"]
                + segment["sourceEndMs"]
                - segment["sourceStartMs"]
            )
            self.assertLessEqual(target_end, result["targetDurationMs"])
            self.assertIsNotNone(map_time(result["segments"], segment["sourceStartMs"]))
        project_lyrics([{"lineId": "cue", "startMs": 1000}], result["segments"])


class LyricsTransferTests(unittest.TestCase):
    def setUp(self) -> None:
        self.segments = [
            {"sourceStartMs": 0, "sourceEndMs": 8000, "targetStartMs": 1250, "rate": 1},
            {
                "sourceStartMs": 8000,
                "sourceEndMs": 16000,
                "targetStartMs": 12250,
                "rate": 1,
            },
            {
                "sourceStartMs": 19000,
                "sourceEndMs": 24000,
                "targetStartMs": 20250,
                "rate": 1,
            },
        ]

    def test_preserves_text_identity_translation_and_original_times(self) -> None:
        rows = [
            {
                "lineId": "verse-1",
                "text": "同じ言葉",
                "startMs": 1000,
                "endMs": 2000,
                "translations": {"zh-TW": "相同的話"},
            },
            {
                "lineId": "chorus-2",
                "text": "同じ言葉",
                "startMs": 10000,
                "endMs": 11000,
            },
        ]
        original = copy.deepcopy(rows)
        result = project_lyrics(rows, self.segments)
        self.assertEqual(rows, original)
        self.assertEqual([row["lineId"] for row in result], ["verse-1", "chorus-2"])
        self.assertEqual(result[0]["original"], rows[0])
        self.assertEqual(result[0]["candidate"], {"startMs": 2250, "endMs": 3250})
        self.assertEqual(result[1]["candidate"], {"startMs": 14250, "endMs": 15250})

    def test_inverse_transfers_mv_lyrics_to_local_audio(self) -> None:
        rows = [{"lineId": "a", "text": "歌", "startMs": 14250, "endMs": 15250}]
        result = project_lyrics(rows, self.segments, inverse=True)
        self.assertEqual(result[0]["candidate"], {"startMs": 10000, "endMs": 11000})

    def test_gaps_edits_and_missing_timing_require_review(self) -> None:
        rows = [
            {"lineId": "gap", "startMs": 17000, "endMs": 18000},
            {"lineId": "crossing", "startMs": 7500, "endMs": 8500},
            {"lineId": "untimed", "text": "歌"},
            {"lineId": "invalid", "startMs": 5000, "endMs": 4000},
        ]
        for row in project_lyrics(rows, self.segments):
            self.assertEqual(row["status"], "needs-review")
            self.assertIsNone(row["candidate"])

    def test_start_only_cue_remains_start_only(self) -> None:
        rows = [
            {"lineId": "point", "startMs": 5000},
            {"lineId": "gap-point", "startMs": 17000},
        ]
        result = project_lyrics(rows, self.segments)
        self.assertEqual(result[0]["candidate"], {"startMs": 6250, "endMs": None})
        self.assertEqual(result[0]["reason"], "mapped-start-only")
        self.assertIsNone(result[1]["candidate"])

    def test_half_open_boundary_and_seek_order(self) -> None:
        self.assertEqual(map_time(self.segments, 8000), 12250)
        self.assertIsNone(map_time(self.segments, 24000))
        for position in (21000, 1000, 17000, 8000, 21000):
            expected = {21000: 22250, 1000: 2250, 17000: None, 8000: 12250}[position]
            self.assertEqual(map_time(self.segments, position), expected)
        result = project_lyrics(
            [{"lineId": "end", "startMs": 7000, "endMs": 8000}], self.segments
        )
        self.assertEqual(result[0]["candidate"]["endMs"], 9250)

    def test_duplicate_line_identity_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            project_lyrics([{"lineId": "same"}, {"lineId": "same"}], self.segments)

    def test_mapping_validation_and_linear_inverse(self) -> None:
        scaled = [
            {
                "sourceStartMs": 0,
                "sourceEndMs": 10000,
                "targetStartMs": 500,
                "rate": 1.002,
            }
        ]
        projected = map_time(scaled, 8000)
        self.assertAlmostEqual(projected, 8516)
        self.assertAlmostEqual(map_time(scaled, projected, inverse=True), 8000)
        for invalid in (
            [*self.segments, self.segments[0]],
            [{**scaled[0], "rate": 0}],
            [{**scaled[0], "rate": float("nan")}],
            [{**scaled[0], "targetStartMs": -1}],
        ):
            with self.assertRaises(ValueError):
                map_time(invalid, 1000)
        with self.assertRaises(ValueError):
            map_time(scaled, float("nan"))
        with self.assertRaises(ValueError):
            project_lyrics([None], scaled)


class EvaluationScoringTests(unittest.TestCase):
    def test_unknown_content_does_not_inflate_shared_coverage(self) -> None:
        truth = [
            {"sourceStartMs": 0, "sourceEndMs": 1000, "targetStartMs": 500, "rate": 1}
        ]
        result = score({"sourceDurationMs": 1000, "segments": []}, truth)
        self.assertEqual(result["expectedSharedPoints"], 10)
        self.assertEqual(result["unmappedSharedPoints"], 10)
        self.assertEqual(result["sharedCoverage"], 0)

    def test_unsupported_or_wrong_output_is_counted(self) -> None:
        segment = {
            "sourceStartMs": 0,
            "sourceEndMs": 1000,
            "targetStartMs": 500,
            "rate": 1,
        }
        result = score({"sourceDurationMs": 1000, "segments": [segment]}, [])
        self.assertEqual(result["wrongOrUnsupportedPoints"], 10)
        shifted = [{**segment, "targetStartMs": 1000}]
        result = score({"sourceDurationMs": 1000, "segments": shifted}, [segment])
        self.assertEqual(result["wrongOrUnsupportedPoints"], 10)


@unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg required for local file smoke")
class FileProbeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.scratch = Path(__file__).resolve().parents[3] / "tasks"
        self.scratch.mkdir(parents=True, exist_ok=True)

    def test_compressed_media_fingerprints_and_json_candidate(self) -> None:
        with tempfile.TemporaryDirectory(
            prefix="utawakui-media-align-", dir=self.scratch
        ) as temp:
            root = Path(temp)
            source, target = root / "source.wav", root / "target.wav"
            signal = music(12)
            write_wav(source, signal)
            write_wav(target, np.concatenate((np.zeros(5000), signal * 0.6)))
            compressed = root / "target.mp3"
            subprocess.run(
                [
                    shutil.which("ffmpeg"),
                    "-v",
                    "error",
                    "-i",
                    str(target),
                    "-c:a",
                    "libmp3lame",
                    "-b:a",
                    "64k",
                    str(compressed),
                ],
                check=True,
                capture_output=True,
                timeout=30,
            )
            result = run_probe(source, compressed, shutil.which("ffmpeg"))
            self.assertEqual(len(result["sourceSha256"]), 64)
            self.assertNotEqual(result["sourceSha256"], result["targetSha256"])
            self.assertAlmostEqual(map_time(result["segments"], 5000), 6250, delta=10)
            json.dumps(result, allow_nan=False)
            lyrics = root / "lyrics.json"
            lyrics.write_text(
                json.dumps([{"lineId": "a", "startMs": 1000, "endMs": 2000}]),
                encoding="utf-8",
            )
            output = root / "report.json"
            cli = subprocess.run(
                [
                    sys.executable,
                    "-B",
                    str(Path(__file__).with_name("probe.py")),
                    "--source",
                    str(source),
                    "--target",
                    str(compressed),
                    "--output",
                    str(output),
                    "--lyrics",
                    str(lyrics),
                ],
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(cli.returncode, 0, cli.stderr)
            self.assertIsNotNone(
                json.loads(output.read_text(encoding="utf-8"))["lyrics"][0]["candidate"]
            )

    def test_output_cannot_replace_an_input(self) -> None:
        with tempfile.TemporaryDirectory(
            prefix="utawakui-media-align-", dir=self.scratch
        ) as temp:
            source = Path(temp) / "input.wav"
            write_wav(source, music(3))
            before = source.read_bytes()
            result = subprocess.run(
                [
                    sys.executable,
                    "-B",
                    str(Path(__file__).with_name("probe.py")),
                    "--source",
                    str(source),
                    "--target",
                    str(source),
                    "--output",
                    str(source),
                ],
                capture_output=True,
                timeout=30,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(source.read_bytes(), before)

    def test_invalid_json_numbers_leave_no_partial_report(self) -> None:
        with tempfile.TemporaryDirectory(
            prefix="utawakui-media-align-", dir=self.scratch
        ) as temp:
            root = Path(temp)
            source = root / "input.wav"
            write_wav(source, music(3))
            lyrics, output = root / "lyrics.json", root / "report.json"
            lyrics.write_text('[{"lineId":"a","startMs":NaN}]', encoding="utf-8")
            result = subprocess.run(
                [
                    sys.executable,
                    "-B",
                    str(Path(__file__).with_name("probe.py")),
                    "--source",
                    str(source),
                    "--target",
                    str(source),
                    "--lyrics",
                    str(lyrics),
                    "--output",
                    str(output),
                ],
                capture_output=True,
                timeout=30,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
