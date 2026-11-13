import { describe, expect, it } from 'vitest';
import { lyricChorusRanges } from './lyricsChorus.mjs';

const refrain = [
  '沿著夜色一路靠岸',
  '海風吹起遠方的帆',
  '等到晨光照亮海面',
  '再把心事寫進星空',
  '讓歌聲穿過這條街',
  '回到最初相遇那天',
];

function occurrence(startMs, phrases, intervalMs = 4000) {
  return phrases.map((text, index) => ({
    text,
    startMs: startMs + index * intervalMs,
    endMs: startMs + (index + 1) * intervalMs - 500,
  }));
}

function song(first, second) {
  return [
    ...occurrence(0, ['城市醒來前還很安靜']),
    ...first,
    ...occurrence(65000, ['再沿著小路轉個彎']),
    ...second,
    ...occurrence(115000, ['天亮以後我們再出發']),
  ];
}

describe('lyricChorusRanges', () => {
  it.each([1, 2])(
    'ignores repeated hooks with only %s lyric lines',
    (count) => {
      const phrases = refrain.slice(0, count);
      expect(
        lyricChorusRanges(
          song(occurrence(20000, phrases), occurrence(80000, phrases)),
          120000,
        ),
      ).toEqual([]);
    },
  );

  it('ignores a fast repeated fragment with three lines', () => {
    const phrases = refrain.slice(0, 3);
    expect(
      lyricChorusRanges(
        song(
          occurrence(20000, phrases, 1500),
          occurrence(80000, phrases, 1500),
        ),
        120000,
      ),
    ).toEqual([]);
  });

  it('spans every repeated line and the pauses between them', () => {
    expect(
      lyricChorusRanges(
        song(occurrence(20000, refrain), occurrence(80000, refrain)),
        120000,
      ),
    ).toEqual([
      { startMs: 20000, endMs: 43500 },
      { startMs: 80000, endMs: 103500 },
    ]);
  });
});
