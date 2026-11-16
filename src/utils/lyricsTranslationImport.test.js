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
    rows: { first: 'First', third: 'Third' },
  });
  expect(pairTranslationText('\n\n', lines)).toBeNull();
  expect(pairTranslationText('1\n2\n3\n4', lines)).toEqual({
    error: 'tooManyRows',
    count: 4,
  });
  expect(pairTranslationText('x'.repeat(1001), lines)).toEqual({
    error: 'lineTooLong',
  });
});

it('pairs copied Markdown blocks without stripping repeated lyrics or translated text', () => {
  expect(
    pairTranslationText(
      '**同じ**\r\n\r\n**同じ**\r\n\r\n-\u00A0**Translation**\r\n- **同じ**\r\n\r\n同じ\r\n•Translation',
      lines,
    ),
  ).toEqual({
    mode: 'blocks',
    rows: { first: 'Translation', second: '同じ', third: 'Translation' },
    skipped: [],
  });
});

it('matches plain copied blocks after list markers are lost by the clipboard', () => {
  const source = ['痛みの数だけ', '心臓を突破して', '脳に'].map((text, i) => ({
    lineId: lines[i].lineId,
    text,
  }));
  expect(
    pairTranslationText(
      '痛みの数だけ\n\n心臓を突破して\n\n每一份痛苦\n多出一行\n衝破心臟\n\n脳に\n\n我的大腦',
      source,
    ),
  ).toEqual({
    mode: 'blocks',
    rows: { third: '我的大腦' },
    skipped: [[1, 2]],
  });
  expect(pairTranslationText('痛みの数だけ\n\n第一句\n多一行', source)).toEqual(
    { error: 'tooManyRows', count: 4 },
  );
});

it('skips only the mismatched block and resumes at the next original line', () => {
  expect(
    pairTranslationText(
      '**同じ**\n**同じ**\n- First\n- Second\n- Extra\n\n**同じ**\n- Third',
      lines,
    ),
  ).toEqual({ mode: 'blocks', rows: { third: 'Third' }, skipped: [[1, 2]] });

  expect(pairTranslationText('同じ\n- One\n同じ\n- ** **', lines)).toEqual({
    mode: 'blocks',
    rows: { first: 'One', second: '' },
    skipped: [],
  });
});

it('rejects copied originals that diverge from the active source', () => {
  expect(
    pairTranslationText('**同じ**\n- First\n\n**別**\n- Second', lines),
  ).toEqual({ error: 'sourceMismatch' });
});

it('keeps ordinary translation-only text and its blank positions', () => {
  expect(pairTranslationText('- First\n\n- Third', lines)).toEqual({
    rows: { first: '- First', third: '- Third' },
  });
});

it('selects by line ID, suppresses missing rows, and rejects changed source text', () => {
  const saved = new Map([['third', { original: '同じ', text: 'Third' }]]);
  expect(translationForLine(saved, lines[0])).toBe('');
  expect(translationForLine(saved, lines[2])).toBe('Third');
  expect(translationForLine(saved, { ...lines[2], text: '別' })).toBe('');
});
