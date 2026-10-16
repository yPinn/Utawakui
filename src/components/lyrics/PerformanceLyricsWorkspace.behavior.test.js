import { reactive, shallowRef, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PerformanceLyricsWorkspace from './PerformanceLyricsWorkspace.vue';
import { mount } from '../ui/uiTestHost.js';

const owners = vi.hoisted(() => ({ lyrics: null, reading: null }));
vi.mock('../../composables/useLyrics.js', () => ({
  useLyrics: () => owners.lyrics,
}));
vi.mock('../../composables/useLyricsReading.js', () => ({
  useLyricsReading: () => owners.reading,
}));
vi.mock('../../composables/useAppView.js', () => ({
  useAppView: () => ({ openLyricsAuthoring: vi.fn() }),
}));

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function flush() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
}
let app;
let vm;
let docs;
const key = (track, source) => `${track}::${source}`;
const matchingDoc = () => ({
  version: 2,
  lines: [
    {
      lineId: 'a',
      text: 'あした',
      romaji: 'ashita',
      segments: [{ t: 'あした' }],
    },
  ],
});

beforeEach(async () => {
  docs = reactive(new Map());
  owners.lyrics = {
    state: reactive({
      offsetSeconds: 0,
      offsetSave: {},
      tracks: [],
      isLoadingLyrics: false,
    }),
    selectedTrack: shallowRef({ id: 'track-a', title: 'Song' }),
    selectedLyrics: shallowRef({
      status: 'ready',
      sources: [{ filename: 'a.lrc' }],
    }),
    selectedSource: shallowRef({ filename: 'a.lrc' }),
    lyricsDocument: shallowRef({
      documentId: 'doc-a',
      normalizerProfileId: 'v1',
      source: { sha256: 'a'.repeat(64) },
      lines: [{ lineId: 'a', text: 'あした' }],
    }),
    lyricLines: shallowRef([{ lineId: 'a', text: 'あした' }]),
    activeLineIndex: shallowRef(0),
    initialize: vi.fn(),
    adjustOffset: vi.fn(),
    resetOffset: vi.fn(),
    retryOffsetSave: vi.fn(),
    playFromLine: vi.fn(),
    selectSource: vi.fn(),
  };
  owners.reading = {
    variant: shallowRef('off'),
    getDoc: vi.fn((track, source) => docs.get(key(track, source)) ?? null),
    isGenerating: vi.fn(() => false),
    errorFor: vi.fn(() => null),
    loadReading: vi.fn(
      async (track, source) => docs.get(key(track, source)) ?? null,
    ),
    generateReading: vi.fn(async (track, source) => {
      docs.set(key(track, source), matchingDoc());
    }),
    setVariant: vi.fn((value) => {
      owners.reading.variant.value = value;
    }),
  };
  const mounted = mount({
    ...PerformanceLyricsWorkspace,
    render: () => null,
  });
  app = mounted.app;
  vm = app._instance.subTree.component.setupState;
  await flush();
  owners.reading.loadReading.mockClear();
});
afterEach(() => app.unmount());

it('closes display before opening the shared manager and preserves a persistent focus target', async () => {
  const trigger = { focus: vi.fn() };
  vm.toggleDisplayMenu({ currentTarget: trigger });
  expect(vm.displayMenuOpen).toBe(true);
  const opening = vm.openSourceManager();
  expect(vm.displayMenuOpen).toBe(false);
  expect(vm.isSourceManagerOpen).toBe(false);
  await opening;
  expect(trigger.focus).toHaveBeenCalledOnce();
  expect(vm.isSourceManagerOpen).toBe(true);
});

it('does not open source management after the selected track disappears', async () => {
  const opening = vm.openSourceManager();
  owners.lyrics.selectedTrack.value = null;
  await opening;
  expect(vm.isSourceManagerOpen).toBe(false);
});

describe('Performance lyrics single reading entry', () => {
  it('switches directly to a cached matching reading without generating', async () => {
    docs.set(key('track-a', 'a.lrc'), matchingDoc());
    await vm.selectReadingVariant('romaji');
    expect(owners.reading.variant.value).toBe('romaji');
    expect(owners.reading.generateReading).not.toHaveBeenCalled();
  });
  it('generates missing readings from the variant action itself', async () => {
    await vm.selectReadingVariant('furigana');
    expect(owners.reading.generateReading).toHaveBeenCalledWith(
      'track-a',
      'a.lrc',
      owners.lyrics.lyricsDocument.value,
      'ja',
    );
  });
  it('does not generate after an unsuccessful read', async () => {
    owners.reading.loadReading.mockResolvedValue(undefined);
    await vm.selectReadingVariant('romaji');
    expect(owners.reading.generateReading).not.toHaveBeenCalled();
  });
  it('waits for the existing reading lookup instead of generating over it', async () => {
    const pending = deferred();
    owners.reading.loadReading.mockReturnValue(pending.promise);
    const request = vm.selectReadingVariant('romaji');
    expect(owners.reading.generateReading).not.toHaveBeenCalled();
    pending.resolve(matchingDoc());
    await request;
    expect(owners.reading.generateReading).not.toHaveBeenCalled();
  });
  it('reuses the generated reading when reactivating the same option', async () => {
    await vm.selectReadingVariant('furigana');
    await vm.selectReadingVariant('furigana');
    expect(owners.reading.generateReading).toHaveBeenCalledTimes(1);
  });
  it('waits until lyrics have finished loading before preparing a reading', async () => {
    owners.lyrics.state.isLoadingLyrics = true;
    await nextTick();
    await vm.selectReadingVariant('furigana');
    expect(owners.reading.loadReading).not.toHaveBeenCalled();
    owners.lyrics.state.isLoadingLyrics = false;
    await flush();
    expect(owners.reading.generateReading).toHaveBeenCalledTimes(1);
  });
  it('coalesces rapid changes while waiting for the same source', async () => {
    const pending = deferred();
    owners.reading.loadReading.mockReturnValue(pending.promise);
    const first = vm.selectReadingVariant('furigana');
    const second = vm.selectReadingVariant('romaji');
    pending.resolve(null);
    await Promise.all([first, second]);
    expect(owners.reading.generateReading).toHaveBeenCalledTimes(1);
    expect(owners.reading.variant.value).toBe('romaji');
  });
  it.each(['off', 'source', 'document', 'unmount'])(
    'ignores a pending lookup after %s',
    async (change) => {
      const pending = deferred();
      owners.reading.loadReading.mockImplementation(
        (track, source, document) =>
          source === 'a.lrc' && document.documentId === 'doc-a'
            ? pending.promise
            : Promise.resolve(matchingDoc()),
      );
      const request = vm.selectReadingVariant('furigana');
      if (change === 'off') vm.selectReadingVariant('off');
      if (change === 'source')
        owners.lyrics.selectedSource.value = { filename: 'b.lrc' };
      if (change === 'document')
        owners.lyrics.lyricsDocument.value = {
          ...owners.lyrics.lyricsDocument.value,
          documentId: 'doc-b',
        };
      if (change === 'unmount') app.unmount();
      pending.resolve(null);
      await request;
      await flush();
      expect(owners.reading.generateReading).not.toHaveBeenCalled();
    },
  );
});
