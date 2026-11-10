import { expect, it } from 'vitest';
import {
  pairTranslationText,
  translationForLine,
} from './lyricsTranslationImport.js';

const lines = ['first', 'second', 'third'].map((lineId) => ({
  lineId,
  text: '同じ',
}));

it('pairs by original row and keeps an empty middle row from shifting a repeat', () => {
  expect(pairTranslationText('\uFEFFFirst\r\n\r\nThird\r\n', lines)).toEqual({
    first: 'First',
    third: 'Third',
  });
  expect(pairTranslationText('\n\n', lines)).toBeNull();
  expect(pairTranslationText('1\n2\n3\n4', lines)).toBeNull();
});

it('selects by line ID, suppresses missing rows, and rejects changed source text', () => {
  const saved = new Map([['third', { original: '同じ', text: 'Third' }]]);
  expect(translationForLine(saved, lines[0])).toBe('');
  expect(translationForLine(saved, lines[2])).toBe('Third');
  expect(translationForLine(saved, { ...lines[2], text: '別' })).toBe('');
});
