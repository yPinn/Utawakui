import { describe, expect, it } from 'vitest';
import { librarySearchTerms, matchesLibrarySearch } from './librarySearch.js';

const track = {
  matchesTitle: (term) => '雪 distance (feat. 罗言)'.includes(term),
  texts: ['Capper', '罗言', '中文'],
};
const search = (query) =>
  matchesLibrarySearch(librarySearchTerms(query), track);

describe('library search', () => {
  it('splits on any whitespace and lowercases', () => {
    expect(librarySearchTerms('  中文　雪  Distance ')).toEqual([
      '中文',
      '雪',
      'distance',
    ]);
    expect(librarySearchTerms('   ')).toEqual([]);
  });

  it('requires every word to match a title or another field', () => {
    expect(search('')).toBe(true);
    expect(search('中文 雪')).toBe(true);
    expect(search('capper distance')).toBe(true);
    expect(search('中文 日語')).toBe(false);
  });
});
