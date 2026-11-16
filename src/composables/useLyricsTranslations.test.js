import { effectScope, nextTick, reactive, shallowRef } from 'vue';
import { expect, it, vi } from 'vitest';
import { useLyricsTranslations } from './useLyricsTranslations.js';

it('loads the selected source and ignores reads and saves from a previous source', async () => {
  let finishFirstRead;
  const firstRead = new Promise((resolve) => {
    finishFirstRead = resolve;
  });
  const firstRecord = { revision: 'first', rows: { 'zh-TW': [], en: [] } };
  const secondRecord = { ...firstRecord, revision: 'second' };
  const api = vi
    .fn()
    .mockReturnValueOnce(firstRead)
    .mockResolvedValue(secondRecord);
  vi.stubGlobal('window', { Utawakui: { getLyricsTranslations: api } });
  const lyrics = {
    state: reactive({ isLoadingLyrics: false }),
    selectedTrack: shallowRef({ id: 'track' }),
    selectedSource: shallowRef(),
    sourceSession: shallowRef(),
    lyricsDocument: shallowRef(),
  };
  function select(filename) {
    lyrics.selectedSource.value = { filename };
    lyrics.sourceSession.value = { id: filename };
    lyrics.lyricsDocument.value = {
      documentId: filename,
      source: { filename },
      lines: [{ lineId: 'line', text: 'Hello' }],
    };
  }

  const scope = effectScope();
  try {
    select('a.lrc');
    const translations = scope.run(() => useLyricsTranslations(lyrics));
    const first = translations.context.value;
    select('b.lrc');
    expect(translations.record.value).toBeNull();
    await nextTick();
    await Promise.resolve();
    expect(api).toHaveBeenLastCalledWith(
      'track',
      'b.lrc',
      { id: 'b.lrc' },
      'b.lrc',
    );
    expect(translations.record.value).toBe(secondRecord);

    finishFirstRead(firstRecord);
    await Promise.resolve();
    translations.applySaved(firstRecord, first);
    expect(translations.record.value).toBe(secondRecord);
  } finally {
    scope.stop();
    vi.unstubAllGlobals();
  }
});
