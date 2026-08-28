"""Tests for offline BPM metrical-normalization research helpers."""

from __future__ import annotations

import math
import unittest

from music_analysis_bpm_normalization import (
    collect_onset_grid_diagnostics,
    collect_grid_diagnostics,
    estimate_windowed_bpm,
    normalize_bpm_candidate,
)


FPS = 50


def probability_to_logit(probability: float) -> float:
    return math.log(probability / (1 - probability))


def synthetic_logits(
    beat_times: list[float],
    *,
    beat_probabilities: list[float] | None = None,
    midpoint_probability: float = 0.03,
    flank_probability: float = 0.03,
    downbeat_probabilities: list[float] | None = None,
) -> tuple[list[float], list[float]]:
    frame_count = round((beat_times[-1] + 1) * FPS)
    beat_logits = [probability_to_logit(0.01)] * frame_count
    downbeat_logits = [probability_to_logit(0.01)] * frame_count
    beat_probabilities = beat_probabilities or [0.95] * len(beat_times)
    downbeat_probabilities = downbeat_probabilities or [0.05] * len(beat_times)

    def set_peak(values: list[float], time_seconds: float, probability: float) -> None:
        values[round(time_seconds * FPS)] = probability_to_logit(probability)

    for index, beat_time in enumerate(beat_times):
        set_peak(beat_logits, beat_time, beat_probabilities[index])
        set_peak(downbeat_logits, beat_time, downbeat_probabilities[index])

    for previous, current in zip(beat_times, beat_times[1:]):
        interval = current - previous
        set_peak(beat_logits, previous + interval * 0.5, midpoint_probability)
        set_peak(beat_logits, previous + interval * 0.25, flank_probability)
        set_peak(beat_logits, previous + interval * 0.75, flank_probability)

    return beat_logits, downbeat_logits


def permissive_parameters() -> dict[str, float | int]:
    return {
        "minimumIntervals": 16,
        "maximumIntervalMadRatio": 0.08,
        "halfMaximumBaseBpm": 110,
        "halfMinimumMidpointSupport": 0.55,
        "halfMinimumMidpointContrast": 0.3,
        "halfMinimumMidpointBeatRatio": 0.55,
        "doubleMinimumBaseBpm": 170,
        "doubleMinimumBeatParityContrast": 0.4,
        "doubleMinimumDownbeatParityContrast": 0.4,
        "doubleMaximumWeakParitySupport": 0.5,
    }


class BpmNormalizationTests(unittest.TestCase):
    def test_four_beat_windows_limit_frame_quantization_error(self) -> None:
        beat_times = [round(index * 50 * 60 / 122) / 50 for index in range(100)]

        estimate = estimate_windowed_bpm(beat_times, window_beats=4)

        self.assertAlmostEqual(estimate, 122, delta=0.5)

    def test_short_windows_preserve_modal_tempo_across_sparse_grid_drift(self) -> None:
        regular = [index * 0.4 for index in range(80)]
        drifted = [value + max(0, index - 55) * 0.04 for index, value in enumerate(regular)]

        short_window = estimate_windowed_bpm(drifted, window_beats=4)
        long_window = estimate_windowed_bpm(drifted, window_beats=32)

        self.assertAlmostEqual(short_window, 150, places=6)
        self.assertLess(long_window, short_window)

    def test_windowed_estimator_rejects_invalid_or_insufficient_input(self) -> None:
        self.assertIsNone(estimate_windowed_bpm([0.0], window_beats=4))
        with self.assertRaises(ValueError):
            estimate_windowed_bpm([0.0, 0.5], window_beats=0)
        with self.assertRaises(ValueError):
            estimate_windowed_bpm([0.0, 0.5, 0.4], window_beats=1)

    def test_distinguishes_audio_onsets_at_subdivision_midpoints(self) -> None:
        beat_times = [index * 0.8 for index in range(24)]
        onset_fps = 100
        onset_count = round((beat_times[-1] + 1) * onset_fps)
        without_subdivisions = [0.0] * onset_count
        with_subdivisions = [0.0] * onset_count
        for previous, current in zip(beat_times, beat_times[1:]):
            beat_index = round(previous * onset_fps)
            midpoint_index = round((previous + current) * 0.5 * onset_fps)
            without_subdivisions[beat_index] = 1.0
            with_subdivisions[beat_index] = 1.0
            with_subdivisions[midpoint_index] = 0.8

        slow = collect_onset_grid_diagnostics(
            beat_times, without_subdivisions, onset_fps
        )
        subdivided = collect_onset_grid_diagnostics(
            beat_times, with_subdivisions, onset_fps
        )

        self.assertEqual(slow["onsetMidpointSupportMedian"], 0)
        self.assertGreater(subdivided["onsetMidpointBeatRatio"], 0.7)
        self.assertGreater(subdivided["onsetMidpointContrast"], 0.7)

    def test_doubles_half_time_only_with_stable_midpoint_evidence(self) -> None:
        beat_times = [index * 0.8 for index in range(40)]
        beat_logits, downbeat_logits = synthetic_logits(
            beat_times,
            midpoint_probability=0.7,
            flank_probability=0.08,
        )
        diagnostics = collect_grid_diagnostics(
            beat_times, beat_logits, downbeat_logits, fps=FPS
        )

        decision = normalize_bpm_candidate(75, diagnostics, permissive_parameters())

        self.assertEqual(decision["factor"], 2)
        self.assertEqual(decision["bpm"], 150)
        self.assertEqual(decision["reason"], "half-time-midpoint-evidence")

    def test_reports_downbeat_spacing_in_detected_beat_units(self) -> None:
        beat_times = [index * 0.5 for index in range(40)]
        beat_logits, downbeat_logits = synthetic_logits(beat_times)

        diagnostics = collect_grid_diagnostics(
            beat_times,
            beat_logits,
            downbeat_logits,
            downbeat_times=beat_times[::4],
            fps=FPS,
        )

        self.assertEqual(diagnostics["downbeatCount"], 10)
        self.assertEqual(diagnostics["downbeatSpacingMedianBeats"], 4)
        self.assertEqual(diagnostics["downbeatSpacingMadBeats"], 0)

    def test_keeps_true_slow_tempo_when_midpoints_are_weak(self) -> None:
        beat_times = [index * 0.75 for index in range(40)]
        beat_logits, downbeat_logits = synthetic_logits(beat_times)
        diagnostics = collect_grid_diagnostics(
            beat_times, beat_logits, downbeat_logits, fps=FPS
        )

        decision = normalize_bpm_candidate(80, diagnostics, permissive_parameters())

        self.assertEqual(decision, {"bpm": 80, "factor": 1, "reason": "ambiguous"})

    def test_keeps_ambiguous_midpoint_evidence(self) -> None:
        beat_times = [index * 0.75 for index in range(40)]
        beat_logits, downbeat_logits = synthetic_logits(
            beat_times,
            midpoint_probability=0.58,
            flank_probability=0.42,
        )
        diagnostics = collect_grid_diagnostics(
            beat_times, beat_logits, downbeat_logits, fps=FPS
        )

        decision = normalize_bpm_candidate(80, diagnostics, permissive_parameters())

        self.assertEqual(decision["factor"], 1)

    def test_halves_double_time_with_two_independent_parity_signals(self) -> None:
        beat_times = [index * 0.3 for index in range(48)]
        beat_probabilities = [0.96 if index % 2 == 0 else 0.25 for index in range(48)]
        downbeat_probabilities = [
            0.9 if index % 2 == 0 else 0.05 for index in range(48)
        ]
        beat_logits, downbeat_logits = synthetic_logits(
            beat_times,
            beat_probabilities=beat_probabilities,
            downbeat_probabilities=downbeat_probabilities,
        )
        diagnostics = collect_grid_diagnostics(
            beat_times, beat_logits, downbeat_logits, fps=FPS
        )

        decision = normalize_bpm_candidate(200, diagnostics, permissive_parameters())

        self.assertEqual(decision["factor"], 0.5)
        self.assertEqual(decision["bpm"], 100)
        self.assertEqual(decision["reason"], "double-time-parity-evidence")

    def test_keeps_fast_tempo_without_downbeat_parity_confirmation(self) -> None:
        beat_times = [index * 0.3 for index in range(48)]
        beat_probabilities = [0.96 if index % 2 == 0 else 0.25 for index in range(48)]
        beat_logits, downbeat_logits = synthetic_logits(
            beat_times,
            beat_probabilities=beat_probabilities,
            downbeat_probabilities=[0.5] * 48,
        )
        diagnostics = collect_grid_diagnostics(
            beat_times, beat_logits, downbeat_logits, fps=FPS
        )

        decision = normalize_bpm_candidate(200, diagnostics, permissive_parameters())

        self.assertEqual(decision["factor"], 1)

    def test_keeps_short_or_unstable_evidence(self) -> None:
        short_times = [index * 0.8 for index in range(8)]
        short_logits, short_downbeats = synthetic_logits(
            short_times, midpoint_probability=0.8
        )
        short_diagnostics = collect_grid_diagnostics(
            short_times, short_logits, short_downbeats, fps=FPS
        )
        unstable_times = [0.0]
        for index in range(1, 40):
            unstable_times.append(unstable_times[-1] + (0.4 if index % 2 else 1.2))
        unstable_logits, unstable_downbeats = synthetic_logits(
            unstable_times, midpoint_probability=0.8
        )
        unstable_diagnostics = collect_grid_diagnostics(
            unstable_times, unstable_logits, unstable_downbeats, fps=FPS
        )

        self.assertEqual(
            normalize_bpm_candidate(75, short_diagnostics, permissive_parameters())[
                "factor"
            ],
            1,
        )
        self.assertEqual(
            normalize_bpm_candidate(
                75, unstable_diagnostics, permissive_parameters()
            )["factor"],
            1,
        )

    def test_rejects_invalid_grid_inputs_without_guessing(self) -> None:
        with self.assertRaises(ValueError):
            collect_grid_diagnostics([0.0, 0.5, 0.4], [0.0] * 100, [0.0] * 100)
        with self.assertRaises(ValueError):
            normalize_bpm_candidate(float("nan"), {}, permissive_parameters())


if __name__ == "__main__":
    unittest.main()
