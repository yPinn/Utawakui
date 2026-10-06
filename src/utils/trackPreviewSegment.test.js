import { describe, expect, it } from 'vitest';

import { resolvePreviewSegment } from './trackPreviewSegment.js';

const structure = {
  sections: [
    { role: 'intro', startMs: 0, endMs: 12000 },
    { role: 'verse', startMs: 12000, endMs: 48000 },
    { role: 'chorus', startMs: 48000, endMs: 70000 },
    { role: 'chorus', startMs: 120000, endMs: 140000 },
  ],
};

const chorus = ['君と見た夢を追いかけて', '夜明けの空へ走り出す'];
const lyricLines = [
  [20, '静かな街の片隅で'],
  [25, '名前もない風が吹いた'],
  ...chorus.map((text, index) => [50 + index * 4, text]),
  [80, '遠回りばかりの日々を'],
  [85, 'それでも愛しく思えた'],
  ...chorus.map((text, index) => [110 + index * 4, text]),
  [170, '最後にもう一度だけ'],
].map(([start, text]) => ({ start, text }));

function downbeat(seconds, confidence = 0.9) {
  return { timeMs: seconds * 1000, positionInBar: 1, confidence };
}

describe('resolvePreviewSegment', () => {
  it('enters a fixed lead-in before the first analysed chorus', () => {
    expect(resolvePreviewSegment({ durationSeconds: 200, structure })).toEqual({
      start: 46,
      end: 76,
      source: 'chorus',
    });
  });

  it('falls back to 30% of the duration without any chorus evidence', () => {
    expect(
      resolvePreviewSegment({ durationSeconds: 200, structure: null }),
    ).toEqual({ start: 58, end: 88, source: 'estimated' });
  });

  it('estimates the chorus from repeated lyric lines', () => {
    expect(
      resolvePreviewSegment({
        durationSeconds: 200,
        lyrics: { lines: lyricLines, offsetSeconds: 0 },
      }),
    ).toEqual({ start: 48, end: 78, source: 'lyrics' });
  });

  it('maps the lyric clock back through the source offset', () => {
    expect(
      resolvePreviewSegment({
        durationSeconds: 200,
        lyrics: { lines: lyricLines, offsetSeconds: 1.5 },
      }).start,
    ).toBe(46.5);
  });

  it('prefers the analysed chorus over the lyric estimate', () => {
    expect(
      resolvePreviewSegment({
        durationSeconds: 200,
        structure: { sections: [{ role: 'chorus', startMs: 90000 }] },
        lyrics: { lines: lyricLines },
      }).source,
    ).toBe('chorus');
  });

  it('snaps the entry to the latest confident bar start within reach', () => {
    const beats = [
      downbeat(44),
      downbeat(46),
      downbeat(48.5, 0.2),
      downbeat(49.5),
    ];

    // 49.5 is under the 1s minimum lead and 48.5 is not confident.
    expect(
      resolvePreviewSegment({
        durationSeconds: 200,
        structure: { sections: structure.sections, beats },
      }).start,
    ).toBe(46);
  });

  it('keeps the fixed lead-in when no bar start is within reach', () => {
    expect(
      resolvePreviewSegment({
        durationSeconds: 200,
        structure: {
          sections: structure.sections,
          beats: [downbeat(30), { timeMs: 47000, positionInBar: 2 }],
        },
      }).start,
    ).toBe(46);
  });

  it('slides a late start back so the window fits before the end', () => {
    expect(
      resolvePreviewSegment({
        durationSeconds: 60,
        structure: { sections: [{ role: 'chorus', startMs: 50000 }] },
      }),
    ).toEqual({ start: 30, end: 60, source: 'chorus' });
  });

  it('plays a short track whole', () => {
    expect(resolvePreviewSegment({ durationSeconds: 20 })).toEqual({
      start: 0,
      end: 20,
      source: 'estimated',
    });
  });

  it('ignores malformed sections and unknown durations', () => {
    expect(
      resolvePreviewSegment({
        durationSeconds: Number.NaN,
        structure: { sections: [{ role: 'chorus', startMs: -1 }, null] },
        lyrics: { lines: lyricLines },
      }),
    ).toEqual({ start: 0, end: 30, source: 'estimated' });
  });
});
