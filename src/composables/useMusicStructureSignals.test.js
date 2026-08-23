import { beforeEach, describe, expect, it, vi } from 'vitest';

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('music-structure signal owner', () => {
  it('can create an isolated owner without mutating the playback singleton', async () => {
    const { createMusicStructureSignals, useMusicStructureSignals } =
      await import('./useMusicStructureSignals.js');
    const shared = useMusicStructureSignals();
    const isolated = createMusicStructureSignals();

    isolated.replaceCurrent({
      trackId: 'workbench-track',
      signals: { level: 'M1', reason: 'current', beats: [], sections: [] },
    });

    expect(isolated.current.value?.trackId).toBe('workbench-track');
    expect(shared.current.value).toBeNull();
  });

  it('replaces main-validated signals immutably and clears them explicitly', async () => {
    const { useMusicStructureSignals } =
      await import('./useMusicStructureSignals.js');
    const owner = useMusicStructureSignals();
    const result = {
      trackId: 'track-1',
      sourceRevision: 'a'.repeat(64),
      sourceDurationMs: 180000,
      signals: {
        level: 'M1',
        reason: 'current',
        tempo: { bpm: 120 },
        beats: [{ timeMs: 500 }],
        sections: [],
      },
    };

    owner.replaceCurrent(result);
    result.signals.beats[0].timeMs = 900;

    expect(owner.current.value).toMatchObject({
      trackId: 'track-1',
      signals: { beats: [{ timeMs: 500 }] },
    });
    expect(Object.isFrozen(owner.current.value)).toBe(true);
    expect(Object.isFrozen(owner.current.value.signals.beats)).toBe(true);

    owner.clear();
    expect(owner.current.value).toBeNull();

    owner.replaceCurrent(undefined);
    expect(owner.current.value).toBeNull();
  });

  it('clears immediately and ignores a late response after the track changes', async () => {
    const first = deferred();
    const second = deferred();
    const getTrackMusicStructure = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    vi.stubGlobal('window', { Utawakui: { getTrackMusicStructure } });
    const { useMusicStructureSignals } =
      await import('./useMusicStructureSignals.js');
    const owner = useMusicStructureSignals();
    owner.replaceCurrent({ trackId: 'old' });

    const firstLoad = owner.loadForTrack('track-1');
    expect(owner.current.value).toBeNull();
    const secondLoad = owner.loadForTrack('track-2');

    first.resolve({
      trackId: 'track-1',
      sourceRevision: 'a'.repeat(64),
      sourceDurationMs: 180000,
      signals: { level: 'M1', reason: 'current', beats: [], sections: [] },
    });
    await firstLoad;
    expect(owner.current.value).toBeNull();

    second.resolve({
      trackId: 'track-2',
      sourceRevision: 'b'.repeat(64),
      sourceDurationMs: 200000,
      signals: { level: 'M0', reason: 'missing', beats: [], sections: [] },
    });
    await secondLoad;
    expect(owner.current.value).toMatchObject({
      trackId: 'track-2',
      signals: { level: 'M0', reason: 'missing' },
    });
  });

  it('fails closed for bridge errors, missing tracks, and mismatched responses', async () => {
    const getTrackMusicStructure = vi
      .fn()
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValueOnce({ trackId: 'other-track' });
    vi.stubGlobal('window', { Utawakui: { getTrackMusicStructure } });
    const { useMusicStructureSignals } =
      await import('./useMusicStructureSignals.js');
    const owner = useMusicStructureSignals();

    await expect(owner.loadForTrack('track-1')).resolves.toBeNull();
    await expect(owner.loadForTrack('track-1')).resolves.toBeNull();
    await expect(owner.loadForTrack(null)).resolves.toBeNull();
    expect(owner.current.value).toBeNull();
  });

  it('does not let an older request overwrite an explicit replacement', async () => {
    const pending = deferred();
    vi.stubGlobal('window', {
      Utawakui: { getTrackMusicStructure: vi.fn(() => pending.promise) },
    });
    const { useMusicStructureSignals } =
      await import('./useMusicStructureSignals.js');
    const owner = useMusicStructureSignals();
    const load = owner.loadForTrack('track-1');
    owner.replaceCurrent({
      trackId: 'track-2',
      signals: { level: 'M0', reason: 'missing' },
    });
    pending.resolve({
      trackId: 'track-1',
      signals: { level: 'M1', reason: 'current' },
    });

    await load;
    expect(owner.current.value).toMatchObject({ trackId: 'track-2' });
  });
});
