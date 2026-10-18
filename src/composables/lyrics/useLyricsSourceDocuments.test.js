import { reactive, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLyricsSourceDocuments } from './useLyricsSourceDocuments.js';

afterEach(() => vi.unstubAllGlobals());

function setup(prepareLyrics) {
  const getTrackLyrics = vi.fn(async (id) => ({
    text: `${id}中文`,
    source: { filename: 'zh.vtt' },
  }));
  vi.stubGlobal('window', { Utawakui: { getTrackLyrics } });
  const state = reactive({
    selectedSourceFilename: 'zh.vtt',
    offsetSave: {},
    manualSave: {},
    lyricsText: '',
  });
  const selectedTrack = shallowRef({ id: 'a' });
  const reportLyricsError = vi.fn(() => 'load failed');
  const owner = useLyricsSourceDocuments({
    state,
    selectedTrack,
    prepareLyrics,
    reportLyricsError,
  });
  return { state, selectedTrack, owner, getTrackLyrics };
}

describe('lyrics source preparation boundary', () => {
  it('loads immediately when no custom preparation step is provided', async () => {
    const { state, owner } = setup();
    await owner.loadSelectedLyrics();
    expect(state.lyricsText).toBe('a中文');
    expect(state.isLoadingLyrics).toBe(false);
    expect(state.error).toBeNull();
  });

  it('keeps the loaded source and explains recovery when the label bridge is unavailable', async () => {
    const { state, owner } = setup();
    await owner.loadSelectedLyrics();
    expect(await owner.setSourceLabel('zh.vtt', '排練用')).toBeNull();
    expect(state.manualSave.error).toBe('請重新啟動應用程式後再編輯標籤。');
    expect(state.lyricsText).toBe('a中文');
    expect(state.selectedSourceFilename).toBe('zh.vtt');
    expect(state.manualSave.isSaving).not.toBe(true);
  });
  it('does not publish Chinese text until preparation completes', async () => {
    let resolve;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const { state, owner } = setup(() => pending);
    const load = owner.loadSelectedLyrics();
    await Promise.resolve();
    expect(state.lyricsText).toBe('');
    expect(state.isLoadingLyrics).toBe(true);
    resolve();
    await load;
    expect(state.lyricsText).toBe('a中文');
    expect(state.isLoadingLyrics).toBe(false);
  });

  it('discards a stale source while its converter is loading', async () => {
    let resolve;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const { state, selectedTrack, owner } = setup(
      vi.fn().mockReturnValueOnce(pending),
    );
    const first = owner.loadSelectedLyrics();
    await Promise.resolve();
    selectedTrack.value = { id: 'b' };
    await owner.loadSelectedLyrics();
    resolve();
    await first;
    expect(state.lyricsText).toBe('b中文');
  });

  it('reports failed preparation and permits reloading the same source', async () => {
    const prepare = vi
      .fn()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockReturnValue(null);
    const { state, owner } = setup(prepare);
    await owner.loadSelectedLyrics();
    expect(state.lyricsText).toBe('');
    expect(state.error).toBe('load failed');
    await owner.loadSelectedLyrics();
    expect(state.lyricsText).toBe('a中文');
    expect(state.error).toBeNull();
  });
});
