import { computed, effectScope, nextTick, shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { usePerformerLyricsFit } from './usePerformerLyricsFit.js';
describe('performer display capacity', () => {
  it('remeasures a reading-scale change and retains whole-line romaji explicitly', async () => {
    const scope = effectScope(),
      version = shallowRef('near'),
      fits = vi.fn((s) => s.length <= 18);
    const text = 'first phrase. second phrase. third phrase.';
    const source = shallowRef({
      currentLine: { text, startMs: 0, endMs: 15000 },
      currentReading: { text, romaji: 'complete reading', segments: [] },
      lyricPositionMs: 0,
    });
    const owner = scope.run(() =>
      usePerformerLyricsFit(source, shallowRef(null), () => {}, {
        fits,
        version,
      }),
    );
    await nextTick();
    expect(owner.frame.value.currentReading).toMatchObject({
      romaji: 'complete reading',
      romajiScope: 'line',
    });
    fits.mockClear();
    version.value = 'stage';
    await nextTick();
    expect(fits).toHaveBeenCalled();
    scope.stop();
  });
  it('uses frame position for T1 page selection and requests deadlines only while playing', async () => {
    const scope = effectScope(),
      boundary = vi.fn();
    const frame = shallowRef({
      mode: 'live',
      currentLine: {
        text: 'first phrase. second phrase. third phrase.',
        startMs: 1000,
        endMs: 16000,
      },
      lyricPositionMs: 1000,
      playbackRate: 1,
      playbackStatus: 'playing',
    });
    const owner = scope.run(() =>
      usePerformerLyricsFit(
        computed(() => frame.value),
        shallowRef(null),
        boundary,
        { fits: (s) => s.length <= 18 },
      ),
    );
    await nextTick();
    expect(owner.frame.value.currentLine.text).toBe('first phrase. ');
    expect(boundary).toHaveBeenCalledWith(expect.any(Number));
    frame.value = {
      ...frame.value,
      lyricPositionMs: 15000,
      playbackStatus: 'paused',
    };
    await nextTick();
    expect(owner.frame.value.currentLine.text).toBe('third phrase.');
    expect(boundary).toHaveBeenLastCalledWith(null);
    scope.stop();
  });
});
