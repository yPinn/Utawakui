import { describe, expect, it } from 'vitest';
import {
  fineTextParts,
  projectLyricsFineFrame,
  mapLyricsFineText,
  projectNativeLyricsFrame,
  prepareLyricsPaintFrame,
  prepareLocalLyricsPaintFrame,
} from './lyricsFineFrame.mjs';
import {
  selectLyricsOverlayFrame,
  nextLyricsBoundaryDelayMs,
} from './state.mjs';

const fine = {
  version: 1,
  units: [
    { unitId: 'u1', from: 0, to: 1, startMs: 1100, endMs: 1300 },
    { unitId: 'u2', from: 1, to: 2, startMs: 1400, endMs: 2200 },
    { unitId: 'u3', from: 2, to: 4, startMs: 3000, endMs: 3700 },
  ],
};
const line = {
  lineId: 'line',
  text: '今日歌う',
  startMs: 1000,
  endMs: 5000,
  estimatedStarts: {
    version: 1,
    segments: [
      { segmentId: 'a', text: '今日', startMs: 1000 },
      { segmentId: 'b', text: '歌う', startMs: 3000 },
    ],
  },
  estimatedFineTiming: fine,
};

describe('model fine timing presentation', () => {
  it('gives starts-only local text bounded display ink without changing Output evidence', () => {
    const coarse = { ...line, estimatedFineTiming: undefined };
    const before = structuredClone(coarse);
    const paint = prepareLocalLyricsPaintFrame(coarse);
    expect(paint.units).toEqual([
      {
        unitId: 'paint-gap-0-2',
        from: 0,
        to: 2,
        startMs: 1000,
        endMs: 3000,
        timingSource: 'display-estimate',
      },
      {
        unitId: 'paint-gap-2-4',
        from: 2,
        to: 4,
        startMs: 3000,
        endMs: 5000,
        timingSource: 'display-estimate',
      },
    ]);
    expect(prepareLocalLyricsPaintFrame(coarse)).toBe(paint);
    expect(
      prepareLocalLyricsPaintFrame({ ...coarse, endMs: null }).units,
    ).toHaveLength(1);
    expect(prepareLyricsPaintFrame(coarse)).toBeNull();
    expect(projectLyricsFineFrame(coarse, 1500)).toBeNull();
    expect(coarse).toEqual(before);
    for (const bad of [
      {
        ...coarse,
        estimatedStarts: {
          version: 2,
          segments: coarse.estimatedStarts.segments,
        },
      },
      {
        ...coarse,
        estimatedStarts: {
          version: 1,
          segments: [{ text: 'wrong', startMs: 1000 }],
        },
      },
      {
        ...coarse,
        estimatedStarts: {
          version: 1,
          segments: [
            { text: '今日', startMs: 3000 },
            { text: '歌う', startMs: 1000 },
          ],
        },
      },
      {
        ...coarse,
        segments: [{ text: coarse.text, startMs: 1000, endMs: 5000 }],
      },
      {
        ...coarse,
        text: '👩‍💻',
        estimatedStarts: {
          version: 1,
          segments: [
            { text: '👩', startMs: 1000 },
            { text: '‍💻', startMs: 3000 },
          ],
        },
      },
    ])
      expect(prepareLocalLyricsPaintFrame(bad)).toBeNull();
  });
  it('preserves known fine pauses and original intervals in local ink', () => {
    const paint = prepareLocalLyricsPaintFrame(line);
    expect(paint).toBe(prepareLyricsPaintFrame(line));
    expect(paint.units).toEqual(fine.units);
    expect(paint.units[1].startMs - paint.units[0].endMs).toBe(100);
    expect(paint.units[2].startMs - paint.units[1].endMs).toBe(800);
  });
  it('fills missing paint ranges from coarse onsets without changing retained fine evidence', () => {
    const partial = {
      ...line,
      estimatedFineTiming: {
        version: 1,
        units: [
          { unitId: 'actual', from: 1, to: 2, startMs: 1400, endMs: 2200 },
        ],
      },
    };
    const before = structuredClone(partial);
    const paint = prepareLyricsPaintFrame(partial);
    expect(paint.units).toEqual([
      {
        unitId: 'paint-gap-0-1',
        from: 0,
        to: 1,
        startMs: 1000,
        endMs: 1400,
        timingSource: 'display-estimate',
      },
      partial.estimatedFineTiming.units[0],
      {
        unitId: 'paint-gap-2-4',
        from: 2,
        to: 4,
        startMs: 3000,
        endMs: 5000,
        timingSource: 'display-estimate',
      },
    ]);
    expect(prepareLyricsPaintFrame(partial)).toBe(paint);
    expect(partial).toEqual(before);
    expect(projectLyricsFineFrame(partial, 1200).units[0].progress).toBe(0.5);
    expect(
      prepareLyricsPaintFrame({ ...partial, estimatedFineTiming: undefined }),
    ).toBeNull();
    const open = prepareLyricsPaintFrame({ ...partial, endMs: null });
    expect(open).toBeNull();
    const impossible = prepareLyricsPaintFrame({
      ...partial,
      estimatedFineTiming: {
        version: 1,
        units: [
          { unitId: 'early', from: 1, to: 2, startMs: 1000, endMs: 2200 },
        ],
      },
    });
    expect(impossible.units.some((u) => u.from === 0)).toBe(false);
  });
  it('bounds display paint within a coarse range and preserves model units crossing a coarse boundary', () => {
    const conflict = {
      lineId: 'conflict',
      text: '甲乙丙',
      startMs: 1000,
      endMs: 4000,
      estimatedStarts: {
        version: 1,
        segments: [
          { segmentId: 'a', text: '甲', startMs: 1000 },
          { segmentId: 'b', text: '乙丙', startMs: 1500 },
        ],
      },
      estimatedFineTiming: {
        version: 1,
        units: [
          { unitId: 'a', from: 0, to: 1, startMs: 1000, endMs: 2000 },
          { unitId: 'c', from: 2, to: 3, startMs: 3000, endMs: 3500 },
        ],
      },
    };
    expect(prepareLyricsPaintFrame(conflict).units).toEqual(
      conflict.estimatedFineTiming.units,
    );
    const crossing = {
      ...line,
      estimatedFineTiming: {
        version: 1,
        units: [
          { unitId: 'cross', from: 1, to: 3, startMs: 1500, endMs: 2500 },
        ],
      },
    };
    expect(prepareLyricsPaintFrame(crossing).units).toEqual([
      {
        unitId: 'paint-gap-0-1',
        from: 0,
        to: 1,
        startMs: 1000,
        endMs: 1500,
        timingSource: 'display-estimate',
      },
      ...crossing.estimatedFineTiming.units,
      {
        unitId: 'paint-gap-3-4',
        from: 3,
        to: 4,
        startMs: 3000,
        endMs: 5000,
        timingSource: 'display-estimate',
      },
    ]);
    const inner = {
      ...line,
      estimatedStarts: {
        version: 1,
        segments: [{ segmentId: 'one', text: line.text, startMs: 1000 }],
      },
      estimatedFineTiming: {
        version: 1,
        units: [
          { unitId: 'a', from: 0, to: 1, startMs: 1000, endMs: 1200 },
          { unitId: 'b', from: 2, to: 3, startMs: 1800, endMs: 2000 },
        ],
      },
    };
    expect(
      prepareLyricsPaintFrame(inner).units.filter(
        (u) => u.timingSource === 'display-estimate',
      ),
    ).toMatchObject([
      { from: 1, to: 2, startMs: 1200, endMs: 1800 },
      { from: 3, to: 4, startMs: 2000, endMs: 5000 },
    ]);
    const full = {
      lineId: 'cap',
      text: 'ab'.repeat(1000),
      startMs: 0,
      endMs: 5000,
      estimatedStarts: {
        version: 1,
        segments: [{ segmentId: 'all', text: 'ab'.repeat(1000), startMs: 0 }],
      },
      estimatedFineTiming: {
        version: 1,
        units: Array.from({ length: 1000 }, (_, i) => ({
          unitId: `f${i}`,
          from: i * 2,
          to: i * 2 + 1,
          startMs: i * 4 + 1,
          endMs: i * 4 + 2,
        })),
      },
    };
    expect(prepareLyricsPaintFrame(full).units).toEqual(
      full.estimatedFineTiming.units,
    );
    const colliding = {
      ...inner,
      estimatedFineTiming: {
        version: 1,
        units: [
          { ...inner.estimatedFineTiming.units[0], unitId: 'paint-gap-1-4' },
        ],
      },
    };
    const ids = prepareLyricsPaintFrame(colliding).units.map((u) => u.unitId);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('keeps repeated KTV phrases source-relative and gives each lane its own fine intervals', () => {
    const phrase = '今日歌う、';
    const text = phrase.repeat(10);
    const chunks = Array.from({ length: 10 }, (_, i) => ({
      segmentId: `s${i}`,
      text: phrase,
      startMs: 1000 + i * 2000,
    }));
    const units = chunks.map((s, i) => ({
      unitId: `u${i}`,
      from: i * phrase.length,
      to: i * phrase.length + 4,
      startMs: s.startMs + 100,
      endMs: s.startMs + 1000,
    }));
    const long = {
      lineId: 'repeat',
      text,
      startMs: 1000,
      endMs: 22000,
      estimatedStarts: { version: 1, segments: chunks },
      estimatedFineTiming: { version: 1, units },
    };
    const generatedAt = '2026-10-22T00:00:00Z';
    const snapshot = {
      revision: 1,
      generatedAt,
      playback: {
        track: { id: 'song' },
        status: 'playing',
        positionMs: 1000,
        sampledAt: generatedAt,
        playbackRate: 1,
      },
      lyrics: { trackId: 'song', synced: true, offsetMs: 0, lines: [long] },
    };
    const frames = chunks.map((s) => {
      snapshot.playback.positionMs = s.startMs + 500;
      return selectLyricsOverlayFrame(snapshot, {
        templateId: 'karaoke-stack',
        nowMs: Date.parse(generatedAt),
      }).ktv;
    });
    expect(frames.some((f) => f.currentSourceRange?.from > 0)).toBe(true);
    for (const f of frames) {
      for (const u of (f.currentFineTiming?.units ?? []).filter(
        (u) => u.timingSource !== 'display-estimate',
      )) {
        const original = units.find((x) => x.unitId === u.unitId);
        expect(u.from).toBe(original.from - f.currentSourceRange.from);
        expect([u.startMs, u.endMs]).toEqual([
          original.startMs,
          original.endMs,
        ]);
        expect(f.currentText.slice(u.from, u.to)).toBe(
          text.slice(original.from, original.to),
        );
      }
    }
    expect(frames.some((f) => f.nextFineTiming?.units.length)).toBe(true);
  });
  it('uses the same local ink shape for native T2, keeping unknown ends cue-only', () => {
    const native = {
      ...line,
      segments: [
        { segmentId: 'a', text: '今日', startMs: 1000, endMs: 2000 },
        { segmentId: 'b', text: '歌う', startMs: 3000, endMs: null },
      ],
    };
    const before = structuredClone(native);
    const frame = projectNativeLyricsFrame(native, 1500);
    expect(frame.timingSource).toBe('t2');
    expect(frame.chunks[0].state).toBe('active');
    expect(frame.fineTiming.units).toEqual([
      { unitId: 'native-0', from: 0, to: 2, startMs: 1000, endMs: 2000 },
    ]);
    expect(
      projectNativeLyricsFrame({ ...native, endMs: null }, 1500).fineTiming
        .units,
    ).toEqual(frame.fineTiming.units);
    expect(
      projectNativeLyricsFrame({ ...native, endMs: null }, 3500).chunks[1]
        .state,
    ).toBe('active');
    expect(
      projectNativeLyricsFrame(
        {
          ...native,
          segments: [{ text: 'wrong', startMs: 1000, endMs: 2000 }],
        },
        1500,
      ),
    ).toBeNull();
    expect(projectNativeLyricsFrame(line, 1500)).toBeNull();
    expect(native).toEqual(before);
  });
  it('carries fine intervals into KTV without changing the immediate coarse cue or hold clock', () => {
    const snapshot = {
      generatedAt: '2026-10-22T00:00:00Z',
      revision: 1,
      displayDelayMs: 200,
      playback: {
        track: { id: 'song' },
        status: 'playing',
        positionMs: 1200,
        sampledAt: '2026-10-22T00:00:00Z',
        playbackRate: 1,
      },
      lyrics: { synced: true, trackId: 'song', offsetMs: 0, lines: [line] },
    };
    const nowMs = Date.parse(snapshot.generatedAt);
    const frame = selectLyricsOverlayFrame(snapshot, {
      nowMs,
      templateId: 'karaoke-stack',
    }).ktv;
    expect(frame.currentFineTiming?.units[0]).toMatchObject({
      from: 0,
      to: 1,
      progress: 0.5,
    });
    expect(frame.currentFineTiming).toMatchObject({
      sampledAtMs: nowMs,
      advanceAtMs: nowMs + 200,
    });
    expect(frame.currentSegments[0]).toMatchObject({
      state: 'active',
      progress: null,
      remainingMs: null,
    });
    expect(frame.currentText).toBe(line.text);
    snapshot.lyrics.lines = [
      {
        ...line,
        segments: [
          { segmentId: 'native', text: line.text, startMs: 1000, endMs: 5000 },
        ],
      },
    ];
    const native = selectLyricsOverlayFrame(snapshot, {
      nowMs,
      templateId: 'karaoke-stack',
    }).ktv;
    expect(native.currentTimingSource).toBe('t2');
    expect(native.currentFineTiming).toBeUndefined();
  });
  it('maps only stable converted boundaries and declines length-changing or combining rewrites', () => {
    const evidence = {
      version: 1,
      units: [{ unitId: 'f', from: 0, to: 1, startMs: 1000, endMs: 2000 }],
    };
    const convert = (text) => text.replaceAll('发', '髮');
    expect(mapLyricsFineText('发型', '髮型', evidence, convert)).toEqual(
      evidence,
    );
    expect(mapLyricsFineText('发型', '髮型', evidence)).toBeNull();
    expect(
      mapLyricsFineText('发型', '髮型', evidence, (text) =>
        text.replaceAll('发', '發'),
      ),
    ).toBeNull();
    expect(mapLyricsFineText('发型', '新髮型', evidence)).toBeNull();
    expect(
      mapLyricsFineText('xy', 'a\u0301', evidence, (text) =>
        text === 'x' ? 'a' : '\u0301',
      ),
    ).toBeNull();
    expect(mapLyricsFineText('发型', '髮型', null)).toBeNull();
    expect(mapLyricsFineText('发型', '发型', evidence)).toBe(evidence);
  });
  it('fills real unit intervals continuously at their own speeds, preserving gaps and completion', () => {
    const at = (p) =>
      projectLyricsFineFrame(line, p, { rate: 2, playing: true });
    expect(at(1200).units[0]).toMatchObject({
      progress: 0.5,
      remainingMs: 50,
      delayMs: 0,
    });
    expect(at(1800).units[1]).toMatchObject({
      progress: 0.5,
      remainingMs: 200,
    });
    expect(at(1350).units[0].progress).toBe(1);
    expect(at(1350).units[1]).toMatchObject({
      progress: 0,
      delayMs: 25,
      remainingMs: 400,
    });
    expect(at(4000).units.every((u) => u.progress === 1)).toBe(true);
    expect(projectLyricsFineFrame(line, 1800).units[1].remainingMs).toBeNull();
  });
  it('preserves all source text and declines a unit split by a ruby or page boundary', () => {
    const units = projectLyricsFineFrame(line, 1800).units;
    expect(
      fineTextParts(line.text, units)
        .map((p) => p.text)
        .join(''),
    ).toBe(line.text);
    expect(fineTextParts(line.text, units, 2, 3)).toEqual([
      { from: 2, to: 3, text: '歌' },
    ]);
    const partial = fineTextParts(
      line.text,
      units.filter((u) => u.unitId !== 'u2'),
    );
    expect(partial.map((p) => p.text).join('')).toBe(line.text);
    expect(partial.find((p) => p.from === 1)).not.toHaveProperty('unitId');
    const word = fineTextParts('今日歌う', [fine.units[2]], 2, 4);
    expect(word.map((part) => part.text)).toEqual(['歌', 'う']);
    expect(word.map((part) => [part.paintFrom, part.paintTo])).toEqual([
      [0, 0.5],
      [0.5, 1],
    ]);
    expect(word.map((part) => [part.startMs, part.endMs])).toEqual([
      [3000, 3700],
      [3000, 3700],
    ]);
  });
  it('rejects unsafe fine evidence without replacing starts and always prefers native T2', () => {
    expect(
      projectLyricsFineFrame(
        { ...line, segments: [{ text: line.text }] },
        1500,
      ),
    ).toBeNull();
    expect(
      projectLyricsFineFrame(
        { ...line, estimatedFineTiming: { ...fine, version: 2 } },
        1500,
      ),
    ).toBeNull();
    expect(
      projectLyricsFineFrame({ ...line, estimatedStarts: undefined }, 1500),
    ).toBeNull();
  });
  it('adds a separate fine projection to Focus without changing coarse onset states or deadlines', () => {
    const snapshot = {
      generatedAt: '2026-10-22T00:00:00Z',
      revision: 1,
      playback: {
        track: { id: 'song' },
        status: 'playing',
        positionMs: 1000,
        sampledAt: '2026-10-22T00:00:00Z',
        playbackRate: 1,
      },
      lyrics: { synced: true, trackId: 'song', offsetMs: 0, lines: [line] },
    };
    const options = {
      nowMs: Date.parse(snapshot.generatedAt),
      templateId: 'focus-line',
    };
    const frame = selectLyricsOverlayFrame(snapshot, options);
    expect(frame.currentTimingSource).toBe('model-starts');
    expect(frame.currentSegments[0]).toMatchObject({
      state: 'active',
      progress: null,
    });
    expect(frame.currentFineTiming.units[0]).toMatchObject({
      progress: 0,
      delayMs: 100,
    });
    expect(nextLyricsBoundaryDelayMs(snapshot, options)).toBe(1200);
    snapshot.displayDelayMs = 200;
    const held = selectLyricsOverlayFrame(snapshot, options).currentFineTiming;
    expect(held.positionMs).toBe(1000);
    expect(held.advanceAtMs).toBe(options.nowMs + 200);
    expect(
      selectLyricsOverlayFrame(snapshot, {
        ...options,
        nowMs: options.nowMs + 150,
      }).currentFineTiming.positionMs,
    ).toBe(1000);
  });
});
