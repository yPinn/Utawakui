import { describe, expect, it, vi } from 'vitest';
import { applyPerformerLyricsOffsetIntent } from './performerOffsetIntent.js';

function dependencies(overrides = {}) {
  return {
    getPublishedContext: vi.fn(() => ({
      playerTrackId: 'track-1',
      lyricsTrackId: 'track-1',
      sourceFilename: 'song.lrc',
    })),
    getCurrentContext: vi.fn(() => ({
      playerTrackId: 'track-1',
      lyricsTrackId: 'track-1',
      sourceFilename: 'song.lrc',
    })),
    adjustOffset: vi.fn(),
    resetOffset: vi.fn(),
    retryOffsetSave: vi.fn(),
    ...overrides,
  };
}

describe('applyPerformerLyricsOffsetIntent', () => {
  it.each([
    ['delay', 'adjustOffset', -0.1],
    ['advance', 'adjustOffset', 0.1],
    ['reset', 'resetOffset', undefined],
    ['retry', 'retryOffsetSave', undefined],
  ])('routes %s through the existing lyrics owner', (action, method, value) => {
    const deps = dependencies();
    expect(
      applyPerformerLyricsOffsetIntent(
        { action, revision: 8, trackId: 'track-1' },
        deps,
      ),
    ).toBe(true);
    if (value === undefined) expect(deps[method]).toHaveBeenCalledOnce();
    else expect(deps[method]).toHaveBeenCalledWith(value);
  });

  it.each([
    ['missing revision', () => null, undefined, undefined],
    [
      'spoofed intent track',
      undefined,
      { action: 'advance', revision: 8, trackId: 'track-2' },
      undefined,
    ],
    [
      'changed player track',
      undefined,
      undefined,
      { playerTrackId: 'track-2' },
    ],
    [
      'changed lyrics track',
      undefined,
      undefined,
      { lyricsTrackId: 'track-2' },
    ],
    [
      'changed source',
      undefined,
      undefined,
      { sourceFilename: 'replacement.lrc' },
    ],
  ])(
    'rejects a stale context: %s',
    (_label, publishedGetter, intentOverride, currentOverride) => {
      const deps = dependencies({
        ...(publishedGetter
          ? { getPublishedContext: vi.fn(publishedGetter) }
          : {}),
        ...(currentOverride
          ? {
              getCurrentContext: vi.fn(() => ({
                playerTrackId: 'track-1',
                lyricsTrackId: 'track-1',
                sourceFilename: 'song.lrc',
                ...currentOverride,
              })),
            }
          : {}),
      });
      expect(
        applyPerformerLyricsOffsetIntent(
          intentOverride ?? {
            action: 'advance',
            revision: 8,
            trackId: 'track-1',
          },
          deps,
        ),
      ).toBe(false);
      expect(deps.adjustOffset).not.toHaveBeenCalled();
      expect(deps.resetOffset).not.toHaveBeenCalled();
      expect(deps.retryOffsetSave).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed input without calling the lyrics owner', () => {
    const deps = dependencies();
    expect(
      applyPerformerLyricsOffsetIntent(
        { action: 'seek', revision: 8, trackId: 'track-1' },
        deps,
      ),
    ).toBe(false);
    expect(deps.adjustOffset).not.toHaveBeenCalled();
  });
});
