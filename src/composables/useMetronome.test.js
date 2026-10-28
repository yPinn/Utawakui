import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-18T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function createFakeEngine() {
  const clicks = [];
  return {
    clicks,
    now: () => Date.now() / 1000,
    resume: vi.fn(() => Promise.resolve()),
    setVolume: vi.fn(),
    scheduleClick: (time, accent) => {
      clicks.push({ time, accent });
    },
    close: vi.fn(() => Promise.resolve()),
  };
}

async function loadMetronome() {
  const { useMetronome } = await import('./useMetronome.js');
  const engine = createFakeEngine();
  return { ...useMetronome({ engine }), engine };
}

describe('useMetronome', () => {
  it('reports default-output failure without private details and can retry from the sound toggle', async () => {
    const metro = await loadMetronome();
    metro.setBpm(90);
    metro.setVolume(0.35);
    metro.engine.resume.mockRejectedValueOnce(Error('private driver detail'));
    metro.setSoundEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(metro.state.soundEnabled).toBe(false);
    expect(metro.state.soundError).toContain('系統預設輸出');
    expect(metro.state.soundError).not.toContain('private');
    expect(metro.engine.close).toHaveBeenCalledOnce();
    metro.setSoundEnabled(true);
    metro.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(metro.state).toMatchObject({
      soundError: '',
      soundEnabled: true,
      isRunning: true,
      bpm: 90,
      volume: 0.35,
    });
    metro.stop();
  });

  it('raises one shell notice for a stopped metronome and restarts it from the action', async () => {
    const metro = await loadMetronome();
    const { useAppNotifications } = await import('./useAppNotifications.js');
    const notifications = useAppNotifications();
    metro.setSoundEnabled(true);
    metro.start();
    await vi.advanceTimersByTimeAsync(0);
    metro.engine.resume.mockRejectedValueOnce(Error('private driver detail'));
    metro.setSoundEnabled(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(metro.state.isRunning).toBe(false);
    const [notice] = notifications.items.value;
    expect(notice).toMatchObject({
      key: 'metronome-sound',
      title: '節拍器已停止',
      tone: 'warning',
      lifecycle: 'persistent',
      actionLabel: '重新啟動',
    });
    expect(notice.message).not.toContain('private');

    await notifications.runAction(notice.id);
    await vi.advanceTimersByTimeAsync(0);
    expect(metro.state).toMatchObject({
      isRunning: true,
      soundEnabled: true,
      soundError: '',
    });
    expect(notifications.items.value).toEqual([]);
    metro.stop();
  });

  it('ignores a failed old resume after a newer start without closing its clock', async () => {
    const metro = await loadMetronome();
    let rejectOld;
    metro.engine.resume.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectOld = reject;
        }),
    );
    metro.setSoundEnabled(true);
    metro.start();
    rejectOld(Error('late failure'));
    await vi.advanceTimersByTimeAsync(0);
    expect(metro.state).toMatchObject({
      isRunning: true,
      soundEnabled: true,
      soundError: '',
    });
    expect(metro.engine.close).not.toHaveBeenCalled();
    metro.stop();
  });

  it('bounds independent click volume without changing sound or tempo', async () => {
    const { state, engine, setVolume, setSoundEnabled, setBpm, reset } =
      await loadMetronome();
    expect(state.volume).toBe(1);
    setBpm(90);
    setVolume(0.35);
    expect(state.volume).toBe(0.35);
    expect(engine.setVolume).toHaveBeenLastCalledWith(0.35);
    expect(state.soundEnabled).toBe(false);
    setSoundEnabled(true);
    setSoundEnabled(false);
    expect(state.volume).toBe(0.35);
    expect(state.bpm).toBe(90);
    setVolume(-2);
    expect(state.volume).toBe(0);
    setVolume(3);
    expect(state.volume).toBe(1);
    setVolume(NaN);
    expect(state.volume).toBe(1);
    setVolume(0.2);
    reset();
    expect(state.volume).toBe(1);
  });
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

  it('does not schedule audio when sound is disabled (default)', async () => {
    const { state, start, engine } = await loadMetronome();

    expect(state.soundEnabled).toBe(false);
    start();
    await vi.advanceTimersByTimeAsync(2000);

    expect(engine.clicks).toEqual([]);
  });

  it('schedules an accented click on beat 1 and plain clicks otherwise', async () => {
    const { setSoundEnabled, start, engine } = await loadMetronome();

    setSoundEnabled(true);
    start();
    await vi.advanceTimersByTimeAsync(1200);

    expect(engine.clicks.length).toBeGreaterThanOrEqual(2);
    expect(engine.clicks[0].accent).toBe(true);
    expect(engine.clicks[1].accent).toBe(false);
  });

  it('resumes the audio engine when sound is toggled on', async () => {
    const { setSoundEnabled, engine } = await loadMetronome();

    expect(engine.resume).not.toHaveBeenCalled();
    setSoundEnabled(true);

    expect(engine.resume).toHaveBeenCalledTimes(1);
  });

  it('toggleSound flips soundEnabled', async () => {
    const { state, toggleSound } = await loadMetronome();

    expect(state.soundEnabled).toBe(false);
    toggleSound();
    expect(state.soundEnabled).toBe(true);
    toggleSound();
    expect(state.soundEnabled).toBe(false);
  });

  it('changing BPM mid-run does not restart or skip the current beat', async () => {
    const { state, setBpm, start, currentBeatLabel } = await loadMetronome();

    start();
    await vi.advanceTimersByTimeAsync(500);
    expect(currentBeatLabel.value).toBe('2/4');

    // Slow down mid-stream: the already-anchored next beat time is not
    // discarded and recomputed from "now" the way the old setTimeout-based
    // scheduler did.
    setBpm(60);
    expect(state.bpm).toBe(60);

    await vi.advanceTimersByTimeAsync(1000);
    expect(currentBeatLabel.value).toBe('3/4');
  });

  describe('applyTrackTempo', () => {
    it('applies the estimate when nothing has been manually set yet', async () => {
      const { state, applyTrackTempo } = await loadMetronome();

      const applied = applyTrackTempo(128, 0.82);

      expect(applied).toBe(true);
      expect(state.bpm).toBe(128);
      expect(state.bpmSource).toBe('track-estimate');
      expect(state.bpmSourceConfidence).toBe(0.82);
    });

    it('clamps an out-of-range analyzed BPM instead of silently rescaling it', async () => {
      const { state, applyTrackTempo } = await loadMetronome();

      applyTrackTempo(320, 0.9);
      expect(state.bpm).toBe(240);

      applyTrackTempo(24, 0.9);
      expect(state.bpm).toBe(40);
    });

    it('is declined once the user has manually set BPM, until reset', async () => {
      const { state, setBpm, adjustBpm, tapTempo, applyTrackTempo, reset } =
        await loadMetronome();

      setBpm(100);
      expect(applyTrackTempo(128, 0.9)).toBe(false);
      expect(state.bpm).toBe(100);

      reset();
      expect(applyTrackTempo(128, 0.9)).toBe(true);
      expect(state.bpm).toBe(128);

      adjustBpm(1);
      expect(applyTrackTempo(96, 0.9)).toBe(false);
      expect(state.bpm).toBe(129);

      reset();
      tapTempo(0);
      tapTempo(500);
      expect(state.bpmSource).toBe('manual');
      expect(applyTrackTempo(96, 0.9)).toBe(false);
    });

    it('is declined while the metronome is running', async () => {
      const { state, start, applyTrackTempo } = await loadMetronome();

      start();
      const applied = applyTrackTempo(128, 0.9);

      expect(applied).toBe(false);
      expect(state.bpm).toBe(120);
      expect(state.bpmSource).toBe('default');
    });

    it('reset clears the source and confidence back to default', async () => {
      const { state, applyTrackTempo, reset } = await loadMetronome();

      applyTrackTempo(128, 0.9);
      reset();

      expect(state.bpmSource).toBe('default');
      expect(state.bpmSourceConfidence).toBeNull();
    });

    it('manual setBpm clears a previously applied track estimate', async () => {
      const { state, applyTrackTempo, setBpm } = await loadMetronome();

      applyTrackTempo(128, 0.9);
      setBpm(140);

      expect(state.bpmSource).toBe('manual');
      expect(state.bpmSourceConfidence).toBeNull();
    });
  });
});
