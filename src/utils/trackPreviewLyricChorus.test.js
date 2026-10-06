import { describe, expect, it } from 'vitest';

import { findLyricChorusStart } from './trackPreviewLyricChorus.js';

const DURATION = 240;
const chorus = [
  '君と見た夢を追いかけて',
  '夜明けの空へ走り出す',
  '涙もいつか光になる',
  'この歌が届くまで',
];

function lines(entries) {
  return entries.map(([start, text]) => ({ start, text }));
}

function chorusAt(start, texts = chorus) {
  return texts.map((text, index) => [start + index * 4, text]);
}

const verse = (start, texts) =>
  texts.map((text, index) => [start + index * 4, text]);

const song = [
  ...verse(20, ['静かな街の片隅で', '名前もない風が吹いた']),
  ...verse(36, ['ふいに振り返れば', '君が笑っていた']),
  ...chorusAt(50),
  ...verse(80, ['遠回りばかりの日々を', 'それでも愛しく思えた']),
  ...chorusAt(110),
  ...verse(140, ['言えなかった言葉が', '胸の奥で揺れている']),
  ...chorusAt(170),
];

describe('findLyricChorusStart', () => {
  it('returns the first repeat of the most repeated block', () => {
    expect(findLyricChorusStart(lines(song), DURATION)).toBe(50);
  });

  it('tolerates small rewording and punctuation between repeats', () => {
    const varied = song.map(([start, text]) =>
      start === 170 ? [start, '君と見た夢を、追いかけた！'] : [start, text],
    );

    expect(findLyricChorusStart(lines(varied), DURATION)).toBe(50);
  });

  it('skips an opening hook for a later repeat', () => {
    expect(
      findLyricChorusStart(lines([...chorusAt(2), ...song]), DURATION),
    ).toBe(50);
  });

  it('ignores short filler lines when matching blocks', () => {
    const filler = verse(150, ['oh', 'oh', 'oh', 'oh', 'oh', 'oh']);

    expect(
      findLyricChorusStart(
        lines([...song, ...filler].sort((a, b) => a[0] - b[0])),
        DURATION,
      ),
    ).toBe(50);
  });

  it('declines unsynced, partial, unordered or repeat-free lyrics', () => {
    expect(
      findLyricChorusStart(
        song.map(([, text]) => ({ start: Number.NaN, text })),
        DURATION,
      ),
    ).toBeNull();
    expect(
      findLyricChorusStart(lines([...chorusAt(50), ...chorusAt(110)]), 400),
    ).toBeNull();
    expect(
      findLyricChorusStart(lines([...song].reverse()), DURATION),
    ).toBeNull();
    expect(
      findLyricChorusStart(
        lines(
          song.filter(
            ([start]) => start < 110 || start === 140 || start === 144,
          ),
        ),
        DURATION,
      ),
    ).toBeNull();
  });

  it('declines a chorus outside the plausible window', () => {
    expect(findLyricChorusStart(lines(song), 60)).toBeNull();
    expect(findLyricChorusStart(lines(song), Number.NaN)).toBeNull();
    expect(findLyricChorusStart(undefined, DURATION)).toBeNull();
  });
});
