import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-18T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

async function loadMetronome() {
  const { useMetronome } = await import('./useMetronome.js');
  return useMetronome();
}

describe('useMetronome', () => {
  it('starts at 120 BPM and advances beats on the current interval', async () => {
    const { state, currentBeatLabel, start, stop } = await loadMetronome();

    start();

    expect(state.isRunning).toBe(true);
    expect(state.bpm).toBe(120);
    expect(currentBeatLabel.value).toBe('1/4');

    await vi.advanceTimersByTimeAsync(500);
    expect(currentBeatLabel.value).toBe('2/4');

    await vi.advanceTimersByTimeAsync(1500);
    expect(currentBeatLabel.value).toBe('1/4');

    stop();
  });

  it('clamps BPM and beat count to supported ranges', async () => {
    const { state, setBpm, setBeatsPerBar } = await loadMetronome();

    setBpm(12);
    expect(state.bpm).toBe(40);

    setBpm(999);
    expect(state.bpm).toBe(240);

    setBeatsPerBar(1);
    expect(state.beatsPerBar).toBe(2);

    setBeatsPerBar(16);
    expect(state.beatsPerBar).toBe(8);
  });

  it('derives BPM from recent tap tempo intervals', async () => {
    const { state, tapTempo } = await loadMetronome();

    tapTempo(0);
    tapTempo(500);
    tapTempo(1000);
    tapTempo(1500);

    expect(state.bpm).toBe(120);

    tapTempo(2000);
    tapTempo(2400);
    tapTempo(2800);

    expect(state.bpm).toBe(133);
  });

  it('resets tap tempo when taps are too far apart', async () => {
    const { state, tapTempo } = await loadMetronome();

    tapTempo(0);
    tapTempo(500);
    expect(state.bpm).toBe(120);

    tapTempo(3000);
    tapTempo(4000);
    expect(state.bpm).toBe(60);
  });

  it('reset stops playback and restores defaults', async () => {
    const { state, start, setBpm, setBeatsPerBar, reset } =
      await loadMetronome();

    setBpm(90);
    setBeatsPerBar(3);
    start();

    reset();

    expect(state.isRunning).toBe(false);
    expect(state.bpm).toBe(120);
    expect(state.beatsPerBar).toBe(4);
    expect(state.currentBeat).toBe(1);
  });

  it('tracks tap count and caps it at the tap window size', async () => {
    const { state, tapTempo } = await loadMetronome();

    tapTempo(0);
    expect(state.tapCount).toBe(1);

    tapTempo(500);
    tapTempo(1000);
    tapTempo(1500);
    tapTempo(2000);
    expect(state.tapCount).toBe(5);

    tapTempo(2500);
    expect(state.tapCount).toBe(5);
  });

  it('resetTaps clears the tap count without touching bpm or beats', async () => {
    const { state, tapTempo, resetTaps } = await loadMetronome();

    tapTempo(0);
    tapTempo(500);
    expect(state.bpm).toBe(120);
    expect(state.tapCount).toBe(2);

    resetTaps();

    expect(state.tapCount).toBe(0);
    expect(state.bpm).toBe(120);
    expect(state.beatsPerBar).toBe(4);
  });

  it('clears the tap count after the idle timeout even without another tap', async () => {
    const { state, tapTempo } = await loadMetronome();

    tapTempo(Date.now());
    expect(state.tapCount).toBe(1);

    await vi.advanceTimersByTimeAsync(2000);

    expect(state.tapCount).toBe(0);
  });
});
