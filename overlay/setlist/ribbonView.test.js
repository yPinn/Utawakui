import { describe, expect, it } from 'vitest';
import {
  ribbonBandStyle,
  ribbonPages,
  ribbonTitleRuns,
  ribbonTitleScript,
} from './ribbonView.mjs';

const rows = (heights, first = 1) =>
  heights.map((height, index) => ({
    height,
    track: { ordinal: first + index },
  }));
const ordinals = (pages) =>
  pages.map((page) => page.map(({ track }) => track.ordinal));

describe('Ribbon Setlist page layout', () => {
  it('starts the next song at the top without moving the completed page', () => {
    const full = rows(Array(14).fill(48));
    expect(ribbonPages(full, 2)).toEqual([full]);
    expect(ribbonPages([...full, ...rows([48], 15)], 2)).toEqual([
      full,
      rows([48], 15),
    ]);
  });

  it('breaks earlier when two-line titles fill the available height', () => {
    const history = rows([84, 84, ...Array(11).fill(48)]);
    expect(ribbonPages(history, 2).map((page) => page.length)).toEqual([12, 1]);
  });

  it('keeps later boundaries when the history window drops an older prefix', () => {
    const history = rows(Array(24).fill(48), 6);
    expect(ordinals(ribbonPages(history, 2, 14))).toEqual([
      Array.from({ length: 9 }, (_, i) => i + 6),
      Array.from({ length: 14 }, (_, i) => i + 15),
      [29],
    ]);
  });

  it.each([
    ['Lucid Dreams', 'default'],
    ['想妳想得要命', 'han'],
    ['夜に駆ける', 'kana'],
    ['첫눈처럼 너에게 가겠다', 'hangul'],
  ])('uses the corresponding type treatment for %s', (title, script) => {
    expect(ribbonTitleScript(title)).toBe(script);
  });
});

describe('Ribbon Setlist mixed-script punctuation', () => {
  it('keeps the English apostrophe and ASCII parentheses in one Latin run', () => {
    expect(ribbonTitleRuns('求救訊號 (I’m Not OK)')).toEqual([
      { text: '求救訊號', latin: false },
      { text: ' (I’m Not OK)', latin: true },
    ]);
  });

  it('preserves fullwidth symbols and uses the regional font for CJK punctuation', () => {
    const source = '「求救訊號」（Ｉ’ｍ）・夜（I’m OK）';
    const runs = ribbonTitleRuns(source);
    expect(runs.map(({ text }) => text).join('')).toBe(source);
    expect(runs.filter(({ latin }) => latin)).toEqual([
      { text: 'I’m OK', latin: true },
    ]);
  });
});

describe('Ribbon Setlist band layout', () => {
  const history = Array.from({ length: 14 }, (_, index) => ({
    ordinal: index + 1,
    trackId: `track-${index + 1}`,
    title: `Song ${index + 1}`,
  }));

  it('keeps the same band for the same completed track when older rows leave', () => {
    const bands = history.map((track) => ribbonBandStyle(track, 2));
    expect(history.slice(4).map((track) => ribbonBandStyle(track, 2))).toEqual(
      bands.slice(4),
    );
    expect(
      bands
        .slice(1)
        .every((band, index) => Math.abs(band.start - bands[index].start) >= 5),
    ).toBe(true);
    const seams = bands
      .slice(1)
      .map((band, index) => band.trimTop + bands[index].trimBottom - 2);
    expect(seams).toContain(-2);
    expect(seams.some((gap) => gap === 1 || gap === 2)).toBe(true);
    expect(bands.some(({ tilt }) => tilt > 0)).toBe(true);
    expect(bands.some(({ tilt }) => tilt < 0)).toBe(true);
  });

  it('preserves every band property when a track changes playback status', () => {
    for (const track of history) {
      expect(ribbonBandStyle({ ...track, current: true }, 2)).toEqual(
        ribbonBandStyle(track, 2),
      );
    }
  });
});
