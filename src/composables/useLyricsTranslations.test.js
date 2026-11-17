import { effectScope, nextTick, reactive, shallowRef } from 'vue';
import { expect, it, vi } from 'vitest';
import {
  translationLanguageLabels,
  useLyricsTranslations,
} from './useLyricsTranslations.js';
import translationValues from '../../shared/lyricsTranslationValues.json';

it('hands a save from one view to another view of the same source', async () => {
  const record = { revision: 'disk', rows: { 'zh-TW': [], en: [] } };
  vi.stubGlobal('window', {
    Utawakui: { getLyricsTranslations: vi.fn().mockResolvedValue(record) },
  });
  const lyrics = {
    state: reactive({ isLoadingLyrics: false }),
    selectedTrack: shallowRef({ id: 'track' }),
    selectedSource: shallowRef({ filename: 'a.lrc' }),
    sourceSession: shallowRef({ id: 's' }),
    lyricsDocument: shallowRef({
      documentId: 'doc',
      source: { filename: 'a.lrc' },
      lines: [{ lineId: 'line', text: 'Hello' }],
    }),
  };
  const scope = effectScope();
  const [editor, output] = scope.run(() => [
    useLyricsTranslations(lyrics),
    useLyricsTranslations(lyrics),
  ]);
  await vi.waitFor(() => expect(output.record.value).toBe(record));

  const saved = {
    revision: 'saved',
    rows: {
      'zh-TW': [],
      en: [{ lineId: 'line', original: 'Hello', text: 'Hi' }],
    },
  };
  editor.applySaved(saved, editor.context.value);
  expect(output.record.value).toBe(saved);
  scope.stop();
  vi.unstubAllGlobals();
});

it('labels every shared translation language', () => {
  for (const id of translationValues.languages)
    expect(translationLanguageLabels[id]?.()).toBeTruthy();
});

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
