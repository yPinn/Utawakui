import { reactive, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

let readingVariant;
let playerOwner;
let lyricsOwner;
let readingOwner;
vi.mock('./usePlayer.js', () => ({
  usePlayer: () => playerOwner ?? { state: reactive({ track: null }) },
}));
vi.mock('./usePlaybackQueue.js', () => ({
  usePlaybackQueue: () => ({ state: {}, upcomingTracks: shallowRef([]) }),
}));
vi.mock('./useLyrics.js', () => ({
  useLyrics: () =>
    lyricsOwner ?? {
      state: {},
      selectedTrack: shallowRef(null),
      selectedSource: shallowRef(null),
      lyricLines: shallowRef([]),
      activeLineIndex: shallowRef(-1),
    },
}));
vi.mock('./useLyricsReading.js', () => ({
  useLyricsReading: () =>
    readingOwner ?? {
      variant: readingVariant,
      getDoc: vi.fn(),
      loadReading: vi.fn(),
    },
}));

afterEach(() => {
  playerOwner = null;
  lyricsOwner = null;
  readingOwner = null;
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('Performer shared reading preference publication', () => {
  it('routes toolbar intents to canonical player and reading preparation owners, rejecting closed-window commands', async () => {
    readingVariant = shallowRef('off');
    playerOwner = {
      state: reactive({ track: { id: 'a' } }),
      play: vi.fn(),
      pause: vi.fn(),
    };
    lyricsOwner = {
      state: reactive({
        selectedTrackId: 'a',
        selectedSourceFilename: 'a.lrc',
        isLoadingLyrics: false,
      }),
      selectedTrack: shallowRef({ id: 'a' }),
      selectedSource: shallowRef({ filename: 'a.lrc', language: 'ja' }),
      lyricLines: shallowRef([
        { lineId: 'line', text: '夜に駆ける', start: 1, end: 3 },
      ]),
      activeLineIndex: shallowRef(0),
      lyricsDocument: shallowRef({
        documentId: 'doc',
        normalizerProfileId: 'v1',
        source: { sha256: 'a'.repeat(64) },
      }),
    };
    readingOwner = {
      variant: readingVariant,
      getDoc: () => null,
      loadReading: vi.fn(async () => null),
      generateReading: vi.fn(async () => {}),
      isGenerating: () => false,
      errorFor: () => null,
      setVariant: (variant) => {
        readingVariant.value = variant;
      },
    };
    let listener;
    const open = vi.fn().mockResolvedValue({ open: true });
    const publish = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('window', {
      Utawakui: {
        getPerformerViewStatus: async () => ({ open: false }),
        openPerformerView: open,
        closePerformerView: async () => ({ open: false }),
        publishPerformerSnapshot: publish,
        onPerformerControlIntent: (callback) => {
          listener = callback;
          return () => {};
        },
      },
    });
    const { usePerformerSelfView } = await import('./usePerformerSelfView.js');
    const owner = usePerformerSelfView();
    await owner.initialize();
    await owner.open();
    const revision = open.mock.calls[0][0].state.revision;
    expect(await listener({ action: 'play', revision, trackId: 'a' })).toBe(
      true,
    );
    expect(playerOwner.play).toHaveBeenCalledOnce();
    expect(await listener({ action: 'pause', revision, trackId: 'a' })).toBe(
      true,
    );
    expect(playerOwner.pause).toHaveBeenCalledOnce();
    expect(
      await listener({ action: 'reading-furigana', revision, trackId: 'a' }),
    ).toBe(true);
    expect(readingVariant.value).toBe('furigana');
    expect(readingOwner.loadReading).toHaveBeenCalled();
    expect(readingOwner.generateReading).toHaveBeenCalledOnce();
    await owner.close();
    expect(await listener({ action: 'play', revision, trackId: 'a' })).toBe(
      false,
    );
    expect(playerOwner.play).toHaveBeenCalledOnce();
  });
  it('publishes changes while open and seeds a reopened window from the latest selection', async () => {
    readingVariant = shallowRef('off');
    const publish = vi.fn().mockResolvedValue(true);
    const open = vi.fn().mockResolvedValue({ open: true });
    vi.stubGlobal('window', {
      Utawakui: {
        getPerformerViewStatus: vi.fn().mockResolvedValue({ open: false }),
        openPerformerView: open,
        closePerformerView: vi.fn().mockResolvedValue({ open: false }),
        publishPerformerSnapshot: publish,
      },
    });
    const { usePerformerSelfView } = await import('./usePerformerSelfView.js');
    const owner = usePerformerSelfView();
    await owner.initialize();
    await owner.open();
    expect(open.mock.calls[0][0].readings.variant).toBe('off');
    for (const variant of ['furigana', 'romaji', 'off']) {
      readingVariant.value = variant;
      await vi.waitFor(() =>
        expect(publish.mock.calls.at(-1)?.[0].readings.variant).toBe(variant),
      );
    }
    await owner.close();
    const calls = publish.mock.calls.length;
    readingVariant.value = 'romaji';
    await Promise.resolve();
    expect(publish).toHaveBeenCalledTimes(calls);
    await owner.open();
    expect(open.mock.calls.at(-1)[0].readings.variant).toBe('romaji');
  });
});
