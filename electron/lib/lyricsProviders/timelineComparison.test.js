import { describe, expect, it } from 'vitest';
import {
  buildLyricsTimelineEvidence,
  compareLyricsTimelines,
  projectLyricsCandidateResult,
} from './timelineComparison.js';

const texts = [
  'Looking toward the morning',
  'Walking along the river',
  'Keeping the window open',
  'Waiting until the evening',
  'Turning another page',
  'Holding this final moment',
];
const lines = (offset = 0) =>
  texts.map((text, i) => ({ text, start: 10 + i * 12 + offset }));
const evidence = (offset = 0) => buildLyricsTimelineEvidence(lines(offset));

describe('read-only lyrics timeline evidence', () => {
  it('compares full line starts with an explicit candidate-minus-reference sign', () => {
    expect(compareLyricsTimelines(evidence(), evidence(2))).toEqual({
      offsetMs: 2000,
      matchedLineCount: 6,
    });
    expect(compareLyricsTimelines(evidence(), evidence(-2))).toEqual({
      offsetMs: -2000,
      matchedLineCount: 6,
    });
    expect(compareLyricsTimelines(evidence(), evidence())).toBeNull();
    expect(compareLyricsTimelines(evidence(), evidence(1))).toBeNull();
  });

  it('unifies Chinese scripts, Unicode width, punctuation and case only for comparison', () => {
    const original = [
      { text: '我們走過這條街', start: 10 },
      { text: '聽見遠方的聲音', start: 20 },
      { text: '讓記憶留在這裡', start: 30 },
      { text: '帶著夢想向前走', start: 40 },
      { text: 'Ｈｅｌｌｏ，Ｗｏｒｌｄ！', start: 50 },
    ];
    const other = [
      '我们走过这条街',
      '听见远方的声音',
      '让记忆留在这里',
      '带着梦想向前走',
      'hello world',
    ].map((text, i) => ({ text, start: original[i].start + 2 }));
    const before = structuredClone(original);
    expect(
      compareLyricsTimelines(
        buildLyricsTimelineEvidence(original),
        buildLyricsTimelineEvidence(other),
      ),
    ).toEqual({ offsetMs: 2000, matchedLineCount: 5 });
    expect(original).toEqual(before);
    expect(JSON.stringify(buildLyricsTimelineEvidence(original))).not.toContain(
      '我們',
    );
  });

  it('excludes repeated text even if another occurrence has no timestamp', () => {
    const repeated = [...lines(), { text: texts[0] }];
    const current = buildLyricsTimelineEvidence(repeated);
    expect(current.samples).toHaveLength(5);
    expect(
      compareLyricsTimelines(
        current,
        buildLyricsTimelineEvidence([
          ...lines(2),
          { text: texts[0], start: 100 },
        ]),
      ),
    ).toEqual({ offsetMs: 2000, matchedLineCount: 5 });
    expect(
      buildLyricsTimelineEvidence(
        Array.from({ length: 12 }, (_, i) => ({
          text: 'Repeating chorus line',
          start: i * 10,
        })),
      ),
    ).toBeNull();
  });

  it('declines insufficient matches, localized drift, reordered lines and narrow evidence', () => {
    expect(
      compareLyricsTimelines(
        buildLyricsTimelineEvidence(lines().slice(0, 4)),
        evidence(2),
      ),
    ).toBeNull();
    const drift = lines(2);
    drift[4].start += 2;
    expect(
      compareLyricsTimelines(evidence(), buildLyricsTimelineEvidence(drift)),
    ).toBeNull();
    const swapped = lines(2);
    [swapped[1].text, swapped[2].text] = [swapped[2].text, swapped[1].text];
    expect(
      compareLyricsTimelines(evidence(), buildLyricsTimelineEvidence(swapped)),
    ).toBeNull();
    expect(compareLyricsTimelines(evidence(), evidence(16))).toBeNull();
    const narrow = (offset) =>
      lines(offset).map((line, i) => ({ ...line, start: i + offset }));
    expect(
      compareLyricsTimelines(
        buildLyricsTimelineEvidence(narrow(0)),
        buildLyricsTimelineEvidence(narrow(2)),
      ),
    ).toBeNull();
  });

  it('requires substantial text overlap and excludes credits and invalid times', () => {
    const manyOtherLines = Array.from({ length: 30 }, (_, i) => ({
      text: `Unrelated content number ${i}`,
      start: 100 + i * 10,
    }));
    expect(
      compareLyricsTimelines(
        evidence(),
        buildLyricsTimelineEvidence([
          ...lines(2).slice(0, 5),
          ...manyOtherLines,
        ]),
      ),
    ).toBeNull();
    expect(
      buildLyricsTimelineEvidence([
        { text: '作詞：測試作者', start: 0 },
        { text: 'Composer: A Person', start: 1 },
        { text: 'yeah', start: Number.NaN },
        { text: texts[0], start: -1 },
      ]),
    ).toBeNull();
  });

  it('bounds evidence across the whole song and never exports source text', () => {
    const large = Array.from({ length: 300 }, (_, i) => ({
      text: `Unique phrase number ${i}`,
      start: i * 3,
    }));
    const current = buildLyricsTimelineEvidence(large);
    expect(current.samples).toHaveLength(128);
    expect(current.samples[0].startMs).toBe(0);
    expect(current.samples.at(-1).startMs).toBe(897000);
    expect(JSON.stringify(current)).not.toMatch(/Unique|phrase|number/);
    expect(
      compareLyricsTimelines(
        current,
        buildLyricsTimelineEvidence(
          large.map((line) => ({ ...line, start: line.start + 2 })),
        ),
      ),
    ).toMatchObject({ offsetMs: 2000, matchedLineCount: 128 });
    expect(buildLyricsTimelineEvidence(Array(5001).fill(large[0]))).toBeNull();
    expect(
      buildLyricsTimelineEvidence([{ text: 'x'.repeat(2001), start: 0 }]),
    ).toBeNull();
    expect(
      buildLyricsTimelineEvidence(
        Array.from({ length: 100 }, (_, i) => ({
          text: `Unique ${i} ${'x'.repeat(1500)}`,
          start: i * 10,
        })),
      ),
    ).toBeNull();
  });

  it('does not trust malformed internal evidence', () => {
    for (const bad of [
      null,
      {},
      { profile: 'unknown', samples: [] },
      { ...evidence(), samples: [{ key: 'bad', startMs: 1 }] },
    ])
      expect(compareLyricsTimelines(evidence(), bad)).toBeNull();
    for (const patch of [
      { key: 'bad' },
      { startMs: -1 },
      { startMs: Number.NaN },
      { key: evidence().samples[0].key },
    ]) {
      const bad = evidence(2);
      Object.assign(bad.samples[1], patch);
      expect(compareLyricsTimelines(evidence(), bad)).toBeNull();
    }
    expect(buildLyricsTimelineEvidence(null)).toBeNull();
    expect(
      buildLyricsTimelineEvidence([null, { text: '', start: 0 }]),
    ).toBeNull();
  });

  it('uses the median for bounded timestamp jitter, keeping the original starts intact', () => {
    const candidate = lines(2);
    [0, 0.2, 0.1, 0, -0.1, 0.1].forEach((jitter, i) => {
      candidate[i].start += jitter;
    });
    const before = structuredClone(candidate);
    expect(
      compareLyricsTimelines(
        evidence(),
        buildLyricsTimelineEvidence(candidate),
      ),
    ).toEqual({ offsetMs: 2050, matchedLineCount: 6 });
    expect(candidate).toEqual(before);
  });

  it('strips private signatures from public single-provider results without mutating the cache', () => {
    const result = {
      provider: 'lrclib',
      candidates: [],
      timelineEvidenceById: { 1: evidence() },
    };
    expect(projectLyricsCandidateResult(result)).toEqual({
      provider: 'lrclib',
      candidates: [],
    });
    expect(result.timelineEvidenceById[1]).toEqual(evidence());
  });
});
