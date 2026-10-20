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

function createHarness({
  selectedTrack = track('a'),
  liveOffset,
  loadLyrics,
  textVariantLoader,
} = {}) {
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
      liveOffset,
      textVariant: ref('original'),
      loadLyrics,
      textVariantLoader,
    }),
  );
  return { currentTrack, playerState, result, scope };
}

describe('current-track lyrics preview', () => {
  it('does not follow the live context until the loaded track is actually playing', async () => {
    const { playerState, result, scope } = createHarness({
      liveOffset: ref({ trackId: 'a', sourceFilename: 'a.vtt', offsetMs: 100 }),
      loadLyrics: async () =>
        lyricsResult('a.vtt', 'First line', 'Second line'),
    });
    await vi.waitFor(() => expect(result.loadedTrackId.value).toBe('a'));
    playerState.currentTime = 2.95;
    playerState.track = { id: 'b' };
    expect(result.preview.value.lines[0].text).toBe('First line');
    playerState.track = { id: 'a' };
    expect(result.preview.value.lines[0].text).toBe('Second line');
    scope.stop();
  });

  it('contains a failed read and recovers when the current source changes', async () => {
    const reason = new Error('read failed');
    const loadLyrics = vi
      .fn()
      .mockRejectedValueOnce(reason)
      .mockResolvedValueOnce(
        lyricsResult('replacement.vtt', 'Recovered', 'Second line'),
      );
    const { currentTrack, result, scope } = createHarness({ loadLyrics });
    await vi.waitFor(() => expect(result.error.value).toBe(reason));
    expect(result.preview.value).toBeNull();
    expect(result.isLoading.value).toBe(false);
    currentTrack.value = track('a', 'replacement.vtt');
    await vi.waitFor(() =>
      expect(result.preview.value?.lines[0].text).toBe('Recovered'),
    );
    expect(result.error.value).toBeNull();
    scope.stop();
  });

  it('reads through the preload bridge and tolerates its absence', async () => {
    const read = vi.fn(async () =>
      lyricsResult('a.vtt', 'Bridge line', 'Second line'),
    );
    vi.stubGlobal('window', { Utawakui: { getTrackLyrics: read } });
    const first = createHarness();
    try {
      await vi.waitFor(() =>
        expect(first.result.preview.value?.lines[0].text).toBe('Bridge line'),
      );
      expect(read).toHaveBeenCalledWith('a', 'a.vtt');
    } finally {
      first.scope.stop();
      vi.unstubAllGlobals();
    }
    vi.stubGlobal('window', undefined);
    const second = createHarness();
    try {
      await vi.waitFor(() =>
        expect(second.result.loadedTrackId.value).toBe('a'),
      );
      expect(second.result.preview.value).toBeNull();
      expect(second.result.isLoading.value).toBe(false);
    } finally {
      second.scope.stop();
      vi.unstubAllGlobals();
    }
  });

  it('follows live advance, delay and reset without reloading or waiting for saved metadata', async () => {
    const liveOffset = ref({
      trackId: 'a',
      sourceFilename: 'a.vtt',
      offsetMs: 0,
    });
    const loadLyrics = vi.fn(async () =>
      lyricsResult('a.vtt', 'First line', 'Second line'),
    );
    const { playerState, result, scope } = createHarness({
      liveOffset,
      loadLyrics,
    });
    await vi.waitFor(() => expect(result.loadedTrackId.value).toBe('a'));
    const document = result.document.value;
    playerState.currentTime = 2.95;
    expect(result.preview.value.lines[0].text).toBe('First line');

    liveOffset.value.offsetMs = 100;
    expect(result.preview.value.lines[0].text).toBe('Second line');
    playerState.currentTime = 3.05;
    liveOffset.value.offsetMs = -100;
    expect(result.preview.value.lines[0].text).toBe('First line');
    liveOffset.value.offsetMs = 0;
    expect(result.preview.value.lines[0].text).toBe('Second line');
    expect(result.document.value).toBe(document);
    expect(loadLyrics).toHaveBeenCalledOnce();
    scope.stop();
  });

  it.each([
    { trackId: 'other', sourceFilename: 'a.vtt', offsetMs: -1000 },
    { trackId: 'a', sourceFilename: 'other.vtt', offsetMs: -1000 },
    { trackId: 'a', sourceFilename: 'a.vtt', offsetMs: Number.NaN },
    null,
  ])(
    'keeps the saved source offset when live context does not match: %j',
    async (value) => {
      const { playerState, result, scope } = createHarness({
        liveOffset: ref(value),
        loadLyrics: async () =>
          lyricsResult('a.vtt', 'First line', 'Second line', 1000),
      });
      await vi.waitFor(() => expect(result.loadedTrackId.value).toBe('a'));
      playerState.currentTime = 2.5;
      expect(result.preview.value.lines[0].text).toBe('Second line');
      scope.stop();
    },
  );

  it('uses the latest live offset after a delayed source read, including an explicit zero', async () => {
    const pending = deferred();
    const liveOffset = ref({
      trackId: 'a',
      sourceFilename: 'a.vtt',
      offsetMs: 100,
    });
    const { playerState, result, scope } = createHarness({
      liveOffset,
      loadLyrics: () => pending.promise,
    });
    playerState.currentTime = 2.95;
    liveOffset.value.offsetMs = 0;
    pending.resolve(lyricsResult('a.vtt', 'First line', 'Second line', 1000));
    await vi.waitFor(() => expect(result.loadedTrackId.value).toBe('a'));
    expect(result.preview.value.lines[0].text).toBe('First line');
    liveOffset.value.offsetMs = 100;
    expect(result.preview.value.lines[0].text).toBe('Second line');
    scope.stop();
  });

  it('keeps the preview empty during conversion preparation and discards cancelled loads', async () => {
    const pending = deferred();
    const prepare = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockReturnValue(null);
    const textVariantLoader = { prepare, project: (document) => document };
    const loadLyrics = vi.fn(async (id, filename) =>
      lyricsResult(filename, `${id}中文`, '第二句'),
    );
    const { currentTrack, result, scope } = createHarness({
      loadLyrics,
      textVariantLoader,
    });
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
    expect(result.document.value).toBeNull();
    expect(result.preview.value).toBeNull();
    expect(result.isLoading.value).toBe(true);
    currentTrack.value = track('b');
    await vi.waitFor(() => expect(result.loadedTrackId.value).toBe('b'));
    pending.resolve();
    await nextTick();
    expect(result.document.value.lines[0].text).toBe('b中文');
    scope.stop();
  });

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
