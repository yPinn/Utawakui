import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

describe('music-structure signal owner', () => {
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
});
