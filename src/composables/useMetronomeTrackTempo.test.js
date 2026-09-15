import { nextTick, reactive, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

async function loadMetronomeTrackTempo({ initialTrackId = null } = {}) {
  const playerState = reactive({
    track: initialTrackId ? { id: initialTrackId } : null,
  });
  const current = shallowRef(null);
  const loadForTrack = vi.fn(async () => null);
  const metronomeState = reactive({ isRunning: false });
  // A thin stand-in for useMetronome.js's real running-guard, just enough
  // to prove this composable re-checks on isRunning changes; the guard's
  // own correctness is covered by useMetronome.test.js.
  const applyTrackTempo = vi.fn(() => !metronomeState.isRunning);

  vi.doMock('./usePlayer.js', () => ({
    usePlayer: () => ({ state: playerState }),
  }));
  vi.doMock('./useMusicStructureSignals.js', () => ({
    useMusicStructureSignals: () => ({ current, loadForTrack }),
  }));
  vi.doMock('./useMetronome.js', () => ({
    useMetronome: () => ({ state: metronomeState, applyTrackTempo }),
  }));

  const { useMetronomeTrackTempo } =
    await import('./useMetronomeTrackTempo.js');
  useMetronomeTrackTempo();

  return {
    playerState,
    current,
    loadForTrack,
    metronomeState,
    applyTrackTempo,
  };
}

describe('useMetronomeTrackTempo', () => {
  it('loads music structure for the initial track on setup', async () => {
    const { loadForTrack } = await loadMetronomeTrackTempo({
      initialTrackId: 'track-1',
    });

    expect(loadForTrack).toHaveBeenCalledWith('track-1');
  });

  it('loads music structure again when the track changes', async () => {
    const { playerState, loadForTrack } = await loadMetronomeTrackTempo();

    playerState.track = { id: 'track-2' };
    await nextTick();

    expect(loadForTrack).toHaveBeenCalledWith('track-2');
  });

  it('applies a confident tempo once analysis arrives', async () => {
    const { current, applyTrackTempo } = await loadMetronomeTrackTempo();

    // The real IPC document nests tempo under `signals` (see
    // electron/lib/library/musicStructure.js's publicResult()) — not at the
    // document's top level. This fixture mirrors that real shape so the
    // test would have caught the top-level-`tempo` bug this once shipped.
    current.value = { signals: { tempo: { bpm: 128, confidence: 0.82 } } };
    await nextTick();

    expect(applyTrackTempo).toHaveBeenCalledWith(128, 0.82);
  });

  it('never calls applyTrackTempo when confidence is too low', async () => {
    const { current, applyTrackTempo } = await loadMetronomeTrackTempo();

    current.value = { signals: { tempo: { bpm: 128, confidence: 0.2 } } };
    await nextTick();

    expect(applyTrackTempo).not.toHaveBeenCalled();
  });

  it('never calls applyTrackTempo when there is no tempo data (M0)', async () => {
    const { current, applyTrackTempo } = await loadMetronomeTrackTempo();

    current.value = { signals: { level: 'M0', tempo: null, beats: [] } };
    await nextTick();

    expect(applyTrackTempo).not.toHaveBeenCalled();
  });

  it('retries once the metronome stops, for a confident value blocked while running', async () => {
    const { current, metronomeState, applyTrackTempo } =
      await loadMetronomeTrackTempo();

    metronomeState.isRunning = true;
    await nextTick();
    current.value = { signals: { tempo: { bpm: 128, confidence: 0.82 } } };
    await nextTick();
    expect(applyTrackTempo).toHaveBeenCalledTimes(1);
    expect(applyTrackTempo).toHaveLastReturnedWith(false);

    metronomeState.isRunning = false;
    await nextTick();

    expect(applyTrackTempo).toHaveBeenCalledTimes(2);
    expect(applyTrackTempo).toHaveBeenLastCalledWith(128, 0.82);
    expect(applyTrackTempo).toHaveLastReturnedWith(true);
  });
});
