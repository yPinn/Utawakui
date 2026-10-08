import { effectScope, nextTick, reactive, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useCurrentTrackLyricsPreview } from './useCurrentTrackLyricsPreview.js';

function track(id, filename = `${id}.vtt`) {
  return {
    id,
    title: `Track ${id}`,
    lyrics: {
      status: 'available',
      preferredSourceFilename: filename,
      sources: [{ filename, language: 'en', kind: 'youtube-cc' }],
    },
  };
}

function lyricsResult(filename, first, second, offsetMs = 0) {
  return {
    source: {
      filename,
      language: 'en',
      kind: 'youtube-cc',
      offsetMs,
    },
    text: [
      'WEBVTT',
      '',
      '00:00:01.000 --> 00:00:03.000',
      first,
      '',
      '00:00:03.000 --> 00:00:05.000',
      second,
    ].join('\n'),
    timing: {
      status: 'missing',
      sourceFingerprint: null,
      normalizerProfileId: 'lyrics-source-v2',
    },
  };
}

function lyricsResultWithGap(filename, first, second) {
  return {
    source: {
      filename,
      language: 'en',
      kind: 'youtube-cc',
      offsetMs: 0,
    },
    text: [
      'WEBVTT',
      '',
      '00:00:01.000 --> 00:00:02.000',
      first,
      '',
      '00:00:03.000 --> 00:00:05.000',
      second,
    ].join('\n'),
    timing: {
      status: 'missing',
      sourceFingerprint: null,
      normalizerProfileId: 'lyrics-source-v2',
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createHarness({ selectedTrack = track('a'), loadLyrics } = {}) {
  const currentTrack = ref(selectedTrack);
  const playerState = reactive({
    track: selectedTrack,
    currentTime: 0.5,
    duration: 180,
  });
  const scope = effectScope();
  const result = scope.run(() =>
    useCurrentTrackLyricsPreview({
      currentTrack,
      playerState,
      textVariant: ref('original'),
      loadLyrics,
    }),
  );
  return { currentTrack, playerState, result, scope };
}

describe('current-track lyrics preview', () => {
  it('loads the current track directly and follows its playback position', async () => {
    const loadLyrics = vi.fn(async () =>
      lyricsResult('a.vtt', 'First line', 'Second line', 1000),
    );
    const { playerState, result, scope } = createHarness({ loadLyrics });

    await vi.waitFor(() => expect(result.preview.value).not.toBeNull());

    expect(loadLyrics).toHaveBeenCalledWith('a', 'a.vtt');
    expect(result.document.value).toMatchObject({
      granularity: 'T1',
      lines: [{ text: 'First line' }, { text: 'Second line' }],
    });
    expect(result.preview.value).toEqual({
      lines: [
        { id: expect.any(String), text: 'First line', active: true },
        { id: expect.any(String), text: 'Second line', active: false },
      ],
      sourceLabel: 'YouTube CC / EN',
    });

    playerState.currentTime = 2.5;
    await nextTick();
    expect(result.preview.value.lines[0].text).toBe('Second line');
    scope.stop();
  });

  it('shows the first lines for a queue-prepared track before playback starts', async () => {
    const selectedTrack = track('queued');
    const { result, playerState, scope } = createHarness({
      selectedTrack,
      loadLyrics: async () =>
        lyricsResult('queued.vtt', 'Prepared first', 'Prepared second'),
    });
    playerState.track = null;

    await vi.waitFor(() => expect(result.preview.value).not.toBeNull());

    expect(result.preview.value.lines.map((line) => line.text)).toEqual([
      'Prepared first',
      'Prepared second',
    ]);
    scope.stop();
  });

  it('preloads the first timed lines before the first cue starts', async () => {
    const { result, scope } = createHarness({
      loadLyrics: async () =>
        lyricsResult('a.vtt', 'Wrong opening fallback', 'Second line'),
    });

    await vi.waitFor(() => expect(result.loadedTrackId.value).toBe('a'));

    expect(result.document.value?.granularity).toBe('T1');
    expect(result.preview.value).toEqual({
      lines: [
        {
          id: expect.any(String),
          text: 'Wrong opening fallback',
          active: true,
        },
        {
          id: expect.any(String),
          text: 'Second line',
          active: false,
        },
      ],
      sourceLabel: 'YouTube CC / EN',
    });
    scope.stop();
  });

  it('holds the latest started line across a cue gap until the next cue', async () => {
    const { playerState, result, scope } = createHarness({
      loadLyrics: async () =>
        lyricsResultWithGap('a.vtt', 'Held through gap', 'Next cue'),
    });

    playerState.currentTime = 1.5;
    await vi.waitFor(() => expect(result.loadedTrackId.value).toBe('a'));
    expect(result.preview.value?.lines[0]).toMatchObject({
      text: 'Held through gap',
      active: true,
    });

    playerState.currentTime = 2.5;
    await nextTick();
    expect(result.preview.value?.lines[0]).toMatchObject({
      text: 'Held through gap',
      active: true,
    });

    playerState.currentTime = 3.5;
    await nextTick();
    expect(result.preview.value?.lines[0]).toMatchObject({
      text: 'Next cue',
      active: true,
    });
    scope.stop();
  });

  it('ignores a stale document after the current track changes', async () => {
    const slow = deferred();
    const loadLyrics = vi.fn((trackId, filename) =>
      trackId === 'a'
        ? slow.promise
        : Promise.resolve(lyricsResult(filename, 'B first', 'B second')),
    );
    const { currentTrack, result, scope } = createHarness({ loadLyrics });

    currentTrack.value = track('b');
    await vi.waitFor(() =>
      expect(result.preview.value?.lines[0].text).toBe('B first'),
    );
    slow.resolve(lyricsResult('a.vtt', 'Stale A', 'Never shown'));
    await nextTick();
    await Promise.resolve();

    expect(result.preview.value.lines[0].text).toBe('B first');
    expect(result.loadedTrackId.value).toBe('b');
    scope.stop();
  });

  it('stays empty when the current track has no local lyrics source', async () => {
    const loadLyrics = vi.fn();
    const { result, scope } = createHarness({
      selectedTrack: {
        id: 'missing',
        lyrics: { status: 'missing', sources: [] },
      },
      loadLyrics,
    });

    await nextTick();

    expect(loadLyrics).not.toHaveBeenCalled();
    expect(result.preview.value).toBeNull();
    scope.stop();
  });
});
