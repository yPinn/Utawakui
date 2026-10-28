import { expect, it } from 'vitest';
import { lyricsCueTextGroups } from './lyricsCueText.js';

it('keeps a timed cue across reading groups while leaving whitespace and untimed text plain', () => {
  const text = '歌い 出し';
  const groups = lyricsCueTextGroups(
    {
      text,
      chunks: [
        { text: '歌', state: 'past' },
        { text: 'い 出', state: 'active' },
        { text: 'し', state: 'upcoming' },
      ],
    },
    [
      { t: '歌い ', r: 'うたい' },
      { t: '出し', r: 'だし' },
    ],
  );
  expect(
    groups
      .flatMap((g) => g.parts)
      .map((p) => p.text)
      .join(''),
  ).toBe(text);
  expect(
    groups
      .flatMap((g) => g.parts)
      .filter((p) => p.cue)
      .map((p) => p.text),
  ).toEqual(['い', '出']);
  expect(groups.map((g) => g.reading)).toEqual(['うたい', 'だし']);
});
it('drops mismatched readings without dropping original text or inventing a cue during a pause', () => {
  const text = '完整原文';
  const groups = lyricsCueTextGroups(
    { text, chunks: [{ text, state: 'active', cueActive: false }] },
    [{ t: '錯誤', r: 'stale' }],
  );
  expect(groups).toHaveLength(1);
  expect(groups[0].reading).toBeUndefined();
  expect(groups[0].parts).toEqual([{ from: 0, to: 4, text, cue: false }]);
});
