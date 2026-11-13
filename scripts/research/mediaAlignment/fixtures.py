"""Deterministic non-vocal signals; no third-party recordings or lyric text."""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np


RATE = 4000


def lowpass_noise(seconds: int = 120, seed: int = 918) -> np.ndarray:
    """Unique slow features expose accumulated drift hidden by adjacent windows."""
    count = RATE * seconds
    rng = np.random.default_rng(seed)
    spectrum = np.fft.rfft(rng.standard_normal(count))
    spectrum[np.fft.rfftfreq(count, 1 / RATE) > 40] = 0
    signal = np.fft.irfft(spectrum, count)
    return signal / max(abs(signal)) * 0.5


def music(seconds: float = 24, seed: int = 7) -> np.ndarray:
    """Generate harmonic/percussive controlled material."""
    rng = np.random.default_rng(seed)
    result = np.zeros(round(seconds * RATE))
    for start in range(0, len(result), RATE // 4):
        count = min(RATE // 4, len(result) - start)
        time = np.arange(count) / RATE
        frequency = rng.uniform(100, 700)
        envelope = np.sin(np.pi * np.arange(count) / count) ** 2
        chord = sum(
            np.sin(2 * np.pi * frequency * ratio * time) for ratio in (1, 1.25, 1.5)
        )
        result[start : start + count] = (
            0.15 * chord * envelope + 0.05 * rng.standard_normal(count)
        )
    return result


def write_wav(path: Path, signal: np.ndarray) -> None:
    """Write isolated 16-bit mono fixtures."""
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes((np.clip(signal, -1, 1) * 32767).astype("<i2").tobytes())
