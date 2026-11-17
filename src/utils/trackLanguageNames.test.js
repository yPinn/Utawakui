import { describe, expect, it } from 'vitest';
import { librarySearchTerms, matchesLibrarySearch } from './librarySearch.js';
import { trackLanguageSearchTexts } from './trackLanguageNames.js';

const japaneseTrack = {
  matchesTitle: () => false,
  texts: trackLanguageSearchTexts('ja'),
};
const finds = (query) =>
  matchesLibrarySearch(librarySearchTerms(query), japaneseTrack);

describe('sung-language search texts', () => {
  it('finds a language by its common names and full-width input', () => {
    for (const query of [
      '日語',
      '日文',
      '日本語',
      'japanese',
      'Ｊａｐａｎｅｓｅ',
    ])
      expect(finds(query)).toBe(true);
    expect(finds('韓文')).toBe(false);
  });

  it('keeps unknown codes searchable as themselves', () => {
    expect(trackLanguageSearchTexts('xx')).toEqual(['xx']);
  });
});
