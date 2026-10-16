import { describe, expect, it } from 'vitest';
import {
  NOTE_PAPERS,
  nextNotePaperIndex,
  notePaperIndex,
} from './notePapers.js';

describe('note papers', () => {
  it('lists the user stocks main accepts, in cycle order', () => {
    expect(NOTE_PAPERS.map((paper) => paper.id)).toEqual([
      'periwinkle',
      'rose',
      'canary',
      'kraft',
      'ruled',
    ]);
    expect(NOTE_PAPERS.map((paper) => paper.label)).toEqual([
      '藍紫',
      '粉紅',
      '鵝黃',
      '牛皮紙',
      '橫線紙',
    ]);
  });

  it('keeps a saved stock and draws one otherwise', () => {
    expect(notePaperIndex('kraft')).toBe(3);
    expect(notePaperIndex('tissue', () => 0.5)).toBe(2);
    expect(notePaperIndex(undefined, () => 0.99)).toBe(4);
  });

  it('cycles back to the first stock after the last', () => {
    expect(nextNotePaperIndex(0)).toBe(1);
    expect(nextNotePaperIndex(4)).toBe(0);
  });
});
