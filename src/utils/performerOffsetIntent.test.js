import { describe, expect, it, vi } from 'vitest';
import {
  applyPerformerLyricsOffsetIntent,
  applyPerformerControlIntent,
} from './performerOffsetIntent.js';

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
  it('rejects invalid, absent, unsupported and stale toolbar contexts without mutating owners', async () => {
    const deps = dependencies({
      play: vi.fn(),
      pause: vi.fn(),
      selectReadingVariant: vi.fn(),
      canSelectReadingVariant: () => false,
    });
    const intent = { action: 'play', revision: 8, trackId: 'track-1' };
    expect(await applyPerformerControlIntent(null, deps)).toBe(false);
    expect(
      await applyPerformerControlIntent(
        { ...intent, action: 'reading-romaji' },
        deps,
      ),
    ).toBe(false);
    expect(
      await applyPerformerControlIntent(intent, {
        ...deps,
        getPublishedContext: () => null,
      }),
    ).toBe(false);
    expect(
      await applyPerformerControlIntent(intent, {
        ...deps,
        getCurrentContext: () => null,
      }),
    ).toBe(false);
    expect(
      await applyPerformerControlIntent(intent, {
        ...deps,
        getCurrentContext: () => ({ playerTrackId: 'other' }),
      }),
    ).toBe(false);
    expect(deps.play).not.toHaveBeenCalled();
    expect(deps.selectReadingVariant).not.toHaveBeenCalled();
  });
  it.each(['play', 'pause'])(
    'routes %s to the player even without lyrics',
    async (action) => {
      const deps = dependencies();
      deps.getPublishedContext = () => ({
        playerTrackId: 'track-1',
        lyricsTrackId: null,
      });
      deps.getCurrentContext = () => ({
        playerTrackId: 'track-1',
        lyricsTrackId: null,
      });
      deps.play = vi.fn();
      deps.pause = vi.fn();
      expect(
        await applyPerformerControlIntent(
          { action, revision: 8, trackId: 'track-1' },
          deps,
        ),
      ).toBe(true);
      expect(deps[action]).toHaveBeenCalledOnce();
    },
  );
  it('rejects stale playback and stale-source reading operations, then accepts a current reading selection', async () => {
    const deps = dependencies();
    deps.play = vi.fn();
    deps.selectReadingVariant = vi.fn();
    deps.canSelectReadingVariant = () => true;
    const intent = { action: 'play', revision: 8, trackId: 'wrong' };
    expect(await applyPerformerControlIntent(intent, deps)).toBe(false);
    expect(deps.play).not.toHaveBeenCalled();
    expect(
      await applyPerformerControlIntent(
        { ...intent, action: 'reading-romaji', trackId: 'track-1' },
        deps,
      ),
    ).toBe(true);
    expect(deps.selectReadingVariant).toHaveBeenCalledWith('romaji');
    deps.getCurrentContext = () => ({
      ...deps.getPublishedContext(8),
      sourceFilename: 'other.lrc',
    });
    expect(
      await applyPerformerControlIntent(
        { ...intent, action: 'reading-off', trackId: 'track-1' },
        deps,
      ),
    ).toBe(false);
  });
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
