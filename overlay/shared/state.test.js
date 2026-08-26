import { describe, expect, it } from 'vitest';
import {
  adaptLiveStageLyricsPresentation,
  analyzeLyricsSource,
} from './lyricsPresentation.mjs';
import { normalizeLyricsDocument } from '../../src/utils/lyricsDocument.js';
import { projectLyricsOutputDocument } from '../../src/utils/outputStreamProjection.js';
import {
  nextPresentationBoundaryDelayMs,
  nextLyricsBoundaryDelayMs,
  selectLiveStageFrame,
  selectMusicStructureFrame,
  selectLyricsOverlayFrame,
  selectLyricsFrame,
  selectArtworkFrame,
  selectNowPlayingFrame,
  selectSetlistFrame,
} from './state.mjs';

function snapshot(overrides = {}) {
  return {
    version: 2,
    revision: 8,
    generatedAt: '2026-08-22T00:00:00.000Z',
    displayDelayMs: 0,
    playback: {
      status: 'playing',
      positionMs: 12000,
      durationMs: 180000,
      rate: 1,
      track: { id: 'track-1', title: '海螺記', artist: '163braces' },
    },
    queue: {
      sourceName: 'Tonight',
      items: [
        {
          state: 'played',
          track: { id: 'track-0', title: 'Intro', artist: 'Singer' },
        },
        {
          state: 'current',
          track: { id: 'track-1', title: '海螺記', artist: '163braces' },
        },
        {
          state: 'queued',
          track: { id: 'track-2', title: 'Next Song', artist: 'Singer' },
        },
      ],
    },
    lyrics: {
      trackId: 'track-1',
      source: { language: 'zh-Hant' },
      synced: true,
      offsetMs: 0,
      activeLineIndex: 1,
      lines: [
        { text: '上一句', startMs: 0, endMs: 9000 },
        { text: '潮聲沿著夜色靠岸', startMs: 9000, endMs: 15000 },
        { text: '   ', startMs: 15000, endMs: 16000 },
        { text: '下一句仍在遠方', startMs: 16000, endMs: 22000 },
      ],
    },
    ...overrides,
  };
}

describe('overlay state selectors', () => {
  it('selects the current and next non-empty lyric lines', () => {
    const value = snapshot();
    expect(
      selectLyricsFrame(value, { nowMs: Date.parse(value.generatedAt) }),
    ).toEqual({
      revision: 8,
      visible: true,
      currentText: '潮聲沿著夜色靠岸',
      nextText: '下一句仍在遠方',
      language: 'zh-Hant',
      lineIndex: 1,
      currentVisibleLineIndex: 1,
      nextVisibleLineIndex: 2,
      lineProgress: 0.5,
      lineRemainingMs: 3000,
    });
  });

  it('projects a four-beat first-vocal count-in from the beat grid', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 8800 },
      lyrics: {
        ...snapshot().lyrics,
        activeLineIndex: -1,
        lines: [{ text: '[女]第一句', startMs: 10000, endMs: 14000 }],
      },
      musicStructure: {
        documentId: 'music-count-in',
        trackId: 'track-1',
        sourceRevision: 'source-1',
        sourceDurationMs: 180000,
        level: 'M1',
        tempo: { bpm: 120, confidence: 0.9 },
        beats: [7600, 8200, 8700, 9300].map((timeMs) => ({
          timeMs,
          confidence: 0.9,
        })),
        sections: [],
      },
    });
    const nowMs = Date.parse(value.generatedAt);

    expect(selectLyricsFrame(value, { nowMs })).toMatchObject({
      visible: false,
      countIn: {
        text: '[女]第一句',
        lineIndex: 0,
        visibleLineIndex: 0,
        remainingBeats: 2,
        totalBeats: 4,
        timingSource: 'beat-grid',
      },
    });
    expect(nextLyricsBoundaryDelayMs(value, { nowMs })).toBe(500);
  });

  it('falls back to a lyric-aligned 120 BPM count-in without analysis', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 8500 },
      lyrics: {
        ...snapshot().lyrics,
        activeLineIndex: -1,
        lines: [{ text: '第一句', startMs: 10000, endMs: 14000 }],
      },
      musicStructure: null,
    });
    const nowMs = Date.parse(value.generatedAt);

    expect(selectLyricsFrame(value, { nowMs })).toMatchObject({
      visible: false,
      countIn: {
        text: '第一句',
        remainingBeats: 3,
        totalBeats: 4,
        timingSource: 'fallback',
      },
    });
    expect(nextLyricsBoundaryDelayMs(value, { nowMs })).toBe(500);

    const beforeCountIn = {
      ...value,
      playback: { ...value.playback, positionMs: 7000 },
    };
    expect(selectLyricsFrame(beforeCountIn, { nowMs })).not.toHaveProperty(
      'countIn',
    );
    expect(nextLyricsBoundaryDelayMs(beforeCountIn, { nowMs })).toBe(1000);
  });

  it('uses confident tempo when no beat grid is available', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 8200 },
      lyrics: {
        ...snapshot().lyrics,
        activeLineIndex: -1,
        lines: [{ text: '第一句', startMs: 10000, endMs: 14000 }],
      },
      musicStructure: {
        documentId: 'music-tempo-count-in',
        trackId: 'track-1',
        sourceRevision: 'source-1',
        sourceDurationMs: 180000,
        level: 'M1',
        tempo: { bpm: 100, confidence: 0.9 },
        beats: [],
        sections: [],
      },
    });
    const nowMs = Date.parse(value.generatedAt);

    expect(selectLyricsFrame(value, { nowMs })).toMatchObject({
      countIn: {
        remainingBeats: 3,
        timingSource: 'tempo',
      },
    });
    expect(nextLyricsBoundaryDelayMs(value, { nowMs })).toBe(600);
  });

  it('keeps the first-vocal count-in when a timed speaker cue is active', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 8500 },
      lyrics: {
        ...snapshot().lyrics,
        activeLineIndex: 0,
        lines: [
          { text: '[女]', startMs: 8000, endMs: 10000 },
          { text: '[女]第一句', startMs: 10000, endMs: 14000 },
        ],
      },
      musicStructure: null,
    });
    const nowMs = Date.parse(value.generatedAt);

    expect(selectLyricsFrame(value, { nowMs })).toMatchObject({
      visible: false,
      currentText: '',
      nextText: '',
      countIn: {
        text: '[女]第一句',
        visibleLineIndex: 0,
        remainingBeats: 3,
      },
    });
  });

  it('projects authored CJK phrases as consecutive Classic KTV A and B units', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 1000 },
      lyrics: {
        ...snapshot().lyrics,
        lines: [
          {
            text: '雨下整夜 我的愛溢出就像雨水',
            startMs: 0,
            endMs: 7000,
          },
          {
            text: '院子落葉 跟我的思念厚厚一疊',
            startMs: 7000,
            endMs: 14000,
          },
        ],
      },
    });
    const nowMs = Date.parse(value.generatedAt);

    expect(selectLyricsOverlayFrame(value, { nowMs }).ktv).toMatchObject({
      visible: true,
      currentText: '雨下整夜',
      nextText: '我的愛溢出就像雨水',
      currentVisibleLineIndex: 0,
      nextVisibleLineIndex: 1,
    });

    const secondPhrase = selectLyricsOverlayFrame(
      {
        ...value,
        playback: { ...value.playback, positionMs: 3000 },
      },
      { nowMs },
    ).ktv;
    expect(secondPhrase).toMatchObject({
      currentText: '我的愛溢出就像雨水',
      nextText: '院子落葉',
      currentVisibleLineIndex: 1,
      nextVisibleLineIndex: 2,
    });
  });

  it('uses aligned T2 segments as exact KTV phrase boundaries', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 2500 },
      lyrics: {
        ...snapshot().lyrics,
        lines: [
          {
            text: '雨下整夜 我的愛',
            startMs: 0,
            endMs: 5000,
            segments: [
              {
                segmentId: 'phrase-a',
                text: '雨下整夜',
                startMs: 0,
                endMs: 2000,
              },
              {
                segmentId: 'space',
                text: ' ',
                startMs: 2000,
                endMs: 2000,
              },
              {
                segmentId: 'phrase-b',
                text: '我的愛',
                startMs: 2000,
                endMs: 5000,
              },
            ],
          },
        ],
      },
    });
    const nowMs = Date.parse(value.generatedAt);

    expect(selectLyricsOverlayFrame(value, { nowMs }).ktv).toMatchObject({
      currentText: '我的愛',
      currentVisibleLineIndex: 1,
      currentTimingSource: 't2',
      currentSegments: [
        {
          segmentId: 'phrase-b',
          text: '我的愛',
          state: 'active',
        },
      ],
    });
  });

  it('honors an explicit final T2 segment end when the parent line is open', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 4000 },
      lyrics: {
        ...snapshot().lyrics,
        lines: [
          {
            text: '明示尾端',
            startMs: 0,
            endMs: null,
            segments: [
              {
                segmentId: 'explicit-end',
                text: '明示尾端',
                startMs: 0,
                endMs: 3000,
              },
            ],
          },
          { text: '下一句', startMs: 10000, endMs: 15000 },
        ],
      },
    });

    expect(
      selectLyricsOverlayFrame(value, {
        nowMs: Date.parse(value.generatedAt),
      }).ktv,
    ).toMatchObject({ visible: false, countIn: null });
  });

  it('keeps speaker-cued Enhanced LRC phrases on their exact T2 timings', () => {
    const source = {
      filename: 'duet.lrc',
      kind: 'lrclib',
      language: 'zh-Hant',
    };
    const document = normalizeLyricsDocument({
      text: `[00:01.00][女]<00:01.00>她的 <00:02.00>歌詞
[00:05.00]下一句`,
      source,
    });
    const outputDocument = projectLyricsOutputDocument({
      trackId: 'track-1',
      source,
      document,
    });
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 1500 },
      lyrics: {
        ...snapshot().lyrics,
        source: outputDocument.source,
        lines: outputDocument.lines,
      },
    });

    expect(
      selectLyricsOverlayFrame(value, {
        nowMs: Date.parse(value.generatedAt),
      }).ktv,
    ).toMatchObject({
      currentText: '她的',
      currentRole: 'female',
      currentTimingSource: 't2',
      currentSegments: [
        {
          text: '她的',
          state: 'active',
        },
      ],
      nextText: '歌詞',
    });
  });

  it('preloads two normal KTV phrases while count-in remains lane decoration', () => {
    const lines = [
      {
        text: '窗外的麻雀 在電線桿上多嘴',
        startMs: 10000,
        endMs: 17000,
      },
    ];
    const before = snapshot({
      playback: { ...snapshot().playback, positionMs: 8500 },
      lyrics: { ...snapshot().lyrics, activeLineIndex: -1, lines },
      musicStructure: null,
    });
    const started = {
      ...before,
      playback: { ...before.playback, positionMs: 10000 },
      lyrics: { ...before.lyrics, activeLineIndex: 0 },
    };
    const nowMs = Date.parse(before.generatedAt);
    const preRoll = selectLyricsOverlayFrame(before, { nowMs }).ktv;
    const active = selectLyricsOverlayFrame(started, { nowMs }).ktv;

    expect(
      selectLyricsOverlayFrame(
        { ...before, playback: { ...before.playback, positionMs: 4999 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({ visible: false, countIn: null });
    expect(
      selectLyricsOverlayFrame(
        { ...before, playback: { ...before.playback, positionMs: 5000 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({
      visible: true,
      currentText: '窗外的麻雀',
      nextText: '在電線桿上多嘴',
      countIn: {
        remainingBeats: 4,
        totalBeats: 4,
        timingSource: 'fallback',
      },
    });

    expect(preRoll).toMatchObject({
      visible: true,
      currentText: '窗外的麻雀',
      nextText: '在電線桿上多嘴',
      currentVisibleLineIndex: 0,
      nextVisibleLineIndex: 1,
      lineProgress: 0,
      countIn: {
        remainingBeats: 3,
        totalBeats: 4,
        timingSource: 'fallback',
      },
    });
    expect(active).toMatchObject({
      currentText: '窗外的麻雀',
      nextText: '在電線桿上多嘴',
      currentVisibleLineIndex: 0,
      nextVisibleLineIndex: 1,
    });
    expect(active.countIn).toBeNull();

    expect(
      selectLyricsOverlayFrame(
        {
          ...before,
          playback: { ...before.playback, status: 'seeking' },
        },
        { nowMs },
      ),
    ).toMatchObject({
      timelineDiscontinuity: true,
      ktv: { visible: true, countIn: { remainingBeats: 3 } },
    });
  });

  it('falls back to BPM when the final four confident beat-grid points are not consecutive', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 7500 },
      lyrics: {
        ...snapshot().lyrics,
        activeLineIndex: -1,
        lines: [{ text: '第一句', startMs: 10000, endMs: 14000 }],
      },
      musicStructure: {
        documentId: 'music-missing-count-in-beat',
        trackId: 'track-1',
        sourceRevision: 'source-1',
        sourceDurationMs: 180000,
        level: 'M1',
        tempo: { bpm: 120, confidence: 0.9 },
        beats: [
          { timeMs: 7500, confidence: 0.9 },
          { timeMs: 8000, confidence: 0.2 },
          { timeMs: 8500, confidence: 0.9 },
          { timeMs: 9000, confidence: 0.9 },
          { timeMs: 9500, confidence: 0.9 },
        ],
        sections: [],
      },
    });
    const nowMs = Date.parse(value.generatedAt);

    expect(selectLyricsOverlayFrame(value, { nowMs }).ktv).toMatchObject({
      visible: true,
      currentText: '第一句',
      countIn: {
        remainingBeats: 4,
        totalBeats: 4,
        timingSource: 'tempo',
      },
    });
    expect(
      selectLyricsOverlayFrame(
        { ...value, playback: { ...value.playback, positionMs: 8000 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({
      countIn: {
        remainingBeats: 4,
        totalBeats: 4,
        timingSource: 'tempo',
      },
    });
  });

  it('starts a slow-BPM count-in on its first beat even when it precedes T-minus-five', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 3999 },
      lyrics: {
        ...snapshot().lyrics,
        activeLineIndex: -1,
        lines: [{ text: '慢歌第一句', startMs: 10000, endMs: 16000 }],
      },
      musicStructure: {
        documentId: 'music-slow-count-in',
        trackId: 'track-1',
        sourceRevision: 'source-1',
        sourceDurationMs: 180000,
        level: 'M1',
        tempo: { bpm: 40, confidence: 0.9 },
        beats: [],
        sections: [],
      },
    });
    const nowMs = Date.parse(value.generatedAt);

    expect(selectLyricsOverlayFrame(value, { nowMs }).ktv).toMatchObject({
      visible: false,
      countIn: null,
    });
    expect(
      selectLyricsOverlayFrame(
        { ...value, playback: { ...value.playback, positionMs: 4000 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({
      visible: true,
      currentText: '慢歌第一句',
      countIn: {
        remainingBeats: 4,
        totalBeats: 4,
        timingSource: 'tempo',
      },
    });
  });

  it('counts a slow-BPM interlude re-entry on the upcoming lane while the tail is active', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 4000 },
      lyrics: {
        ...snapshot().lyrics,
        activeLineIndex: 0,
        lines: [
          { text: '副歌尾句', startMs: 0, endMs: 5000 },
          { text: '慢歌下段', startMs: 10000, endMs: 15000 },
        ],
      },
      musicStructure: {
        documentId: 'music-slow-interlude-count-in',
        trackId: 'track-1',
        sourceRevision: 'source-1',
        sourceDurationMs: 180000,
        level: 'M1',
        tempo: { bpm: 40, confidence: 0.9 },
        beats: [],
        sections: [],
      },
    });
    const nowMs = Date.parse(value.generatedAt);

    expect(selectLyricsOverlayFrame(value, { nowMs }).ktv).toMatchObject({
      visible: true,
      currentText: '副歌尾句',
      nextText: '慢歌下段',
      currentVisibleLineIndex: 0,
      nextVisibleLineIndex: 1,
      countIn: {
        remainingBeats: 4,
        totalBeats: 4,
        timingSource: 'tempo',
        visibleLineIndex: 1,
      },
    });
  });

  it('clears an inferred long tail and counts into the next vocal section', () => {
    const source = {
      filename: 'interlude.lrc',
      kind: 'lrclib',
      language: 'zh-Hant',
    };
    const document = normalizeLyricsDocument({
      text: `[00:00.00]第一行
[00:07.00]第二行
[00:14.00]副歌尾句
[00:47.00]雨下整夜 我的愛溢出就像雨水
[00:54.00]下一行`,
      source,
    });
    const outputDocument = projectLyricsOutputDocument({
      trackId: 'track-1',
      source,
      document,
    });
    expect(outputDocument.lines[2]).toMatchObject({
      endMs: 47000,
      endInferred: true,
    });
    const base = snapshot({
      lyrics: {
        ...snapshot().lyrics,
        source: outputDocument.source,
        lines: outputDocument.lines,
      },
      musicStructure: null,
    });
    const nowMs = Date.parse(base.generatedAt);

    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 15000 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({
      visible: true,
      currentText: '副歌尾句',
      nextText: '',
      nextVisibleLineIndex: null,
    });

    const interlude = selectLyricsOverlayFrame(
      {
        ...base,
        playback: { ...base.playback, positionMs: 25000 },
      },
      { nowMs },
    ).ktv;
    expect(interlude).toMatchObject({ visible: false, countIn: null });

    const reentry = selectLyricsOverlayFrame(
      {
        ...base,
        playback: { ...base.playback, positionMs: 45500 },
      },
      { nowMs },
    ).ktv;
    expect(reentry).toMatchObject({
      visible: true,
      currentText: '雨下整夜',
      nextText: '我的愛溢出就像雨水',
      currentVisibleLineIndex: 3,
      nextVisibleLineIndex: 4,
      countIn: { remainingBeats: 3, timingSource: 'fallback' },
    });
  });

  it('keeps inferred interludes short when a speaker-only row precedes re-entry', () => {
    const source = {
      filename: 'speaker-interlude.lrc',
      kind: 'lrclib',
      language: 'zh-Hant',
    };
    const document = normalizeLyricsDocument({
      text: `[00:00.00]第一行
[00:07.00]副歌尾句
[00:30.00][女]
[00:31.00]下段開頭
[00:38.00]下一句`,
      source,
    });
    const outputDocument = projectLyricsOutputDocument({
      trackId: 'track-1',
      source,
      document,
    });
    const base = snapshot({
      lyrics: {
        ...snapshot().lyrics,
        source: outputDocument.source,
        lines: outputDocument.lines,
      },
      musicStructure: null,
    });
    const nowMs = Date.parse(base.generatedAt);

    expect(outputDocument.lines[1]).toMatchObject({
      endMs: 30000,
      endInferred: true,
    });
    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 17000 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({ visible: false, countIn: null });
    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 29500 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({
      visible: true,
      currentText: '下段開頭',
      countIn: { remainingBeats: 3 },
    });
  });

  it('clears a converter-inferred Enhanced LRC segment tail before re-entry', () => {
    const source = {
      filename: 'enhanced-interlude.lrc',
      kind: 'lrclib',
      language: 'zh-Hant',
    };
    const document = normalizeLyricsDocument({
      text: `[00:00.00]<00:00.00>副歌尾句
[00:30.00]<00:30.00>下段 <00:33.00>開頭
[00:37.00]下一句`,
      source,
    });
    const outputDocument = projectLyricsOutputDocument({
      trackId: 'track-1',
      source,
      document,
    });
    const base = snapshot({
      lyrics: {
        ...snapshot().lyrics,
        source: outputDocument.source,
        lines: outputDocument.lines,
      },
      musicStructure: null,
    });
    const nowMs = Date.parse(base.generatedAt);

    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 15000 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({ visible: false, countIn: null });
    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 28500 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({
      currentText: '下段',
      nextText: '開頭',
      countIn: { remainingBeats: 3 },
    });
  });

  it('keeps the open final Enhanced LRC segment active on a final line', () => {
    const source = {
      filename: 'open-final-segment.lrc',
      kind: 'lrclib',
      language: 'zh-Hant',
    };
    const document = normalizeLyricsDocument({
      text: '[00:00.00]<00:00.00>甲<00:02.00>乙',
      source,
    });
    const outputDocument = projectLyricsOutputDocument({
      trackId: 'track-1',
      source,
      document,
    });
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 4000 },
      lyrics: {
        ...snapshot().lyrics,
        source: outputDocument.source,
        lines: outputDocument.lines,
      },
      musicStructure: null,
    });

    expect(
      selectLyricsOverlayFrame(value, {
        nowMs: Date.parse(value.generatedAt),
      }).ktv,
    ).toMatchObject({
      visible: true,
      currentText: '甲乙',
      currentTimingSource: 't2',
      currentSegments: [
        { text: '甲', state: 'past' },
        { text: '乙', state: 'active' },
      ],
    });
  });

  it('preserves semantic spaces between exact Enhanced LRC segments', () => {
    const source = {
      filename: 'english-segments.lrc',
      kind: 'lrclib',
      language: 'en',
    };
    const document = normalizeLyricsDocument({
      text: `[00:00.00]<00:00.00>hello <00:02.00>world
[00:05.00]next`,
      source,
    });
    const outputDocument = projectLyricsOutputDocument({
      trackId: 'track-1',
      source,
      document,
    });
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 2500 },
      lyrics: {
        ...snapshot().lyrics,
        source: outputDocument.source,
        lines: outputDocument.lines,
      },
      musicStructure: null,
    });

    expect(
      selectLyricsOverlayFrame(value, {
        nowMs: Date.parse(value.generatedAt),
      }).ktv,
    ).toMatchObject({
      currentText: 'hello world',
      currentTimingSource: 't2',
      currentSegments: [
        { text: 'hello ', state: 'past' },
        { text: 'world', state: 'active' },
      ],
    });
  });

  it('falls back to sequential phrase timing when one T2 segment spans both phrases', () => {
    const source = {
      filename: 'cross-phrase-segment.lrc',
      kind: 'lrclib',
      language: 'zh-Hant',
    };
    const document = normalizeLyricsDocument({
      text: `[00:00.00]<00:00.00>甲 乙
[00:05.00]下句`,
      source,
    });
    const outputDocument = projectLyricsOutputDocument({
      trackId: 'track-1',
      source,
      document,
    });
    const base = snapshot({
      lyrics: {
        ...snapshot().lyrics,
        source: outputDocument.source,
        lines: outputDocument.lines,
      },
      musicStructure: null,
    });
    const nowMs = Date.parse(base.generatedAt);

    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 1000 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({
      currentText: '甲',
      nextText: '乙',
      currentTimingSource: 'line-estimate',
    });
    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 4000 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({
      currentText: '乙',
      currentTimingSource: 'line-estimate',
    });
  });

  it('caps an inferred T2 tail at a following hidden speaker boundary', () => {
    const source = {
      filename: 'speaker-segment-cap.lrc',
      kind: 'lrclib',
      language: 'zh-Hant',
    };
    const document = normalizeLyricsDocument({
      text: `[00:00.00]第一行
[00:07.00]第二行
[00:14.00]<00:29.00>尾詞
[00:30.00][女]
[00:40.00]下段開頭
[00:47.00]下一句`,
      source,
    });
    const outputDocument = projectLyricsOutputDocument({
      trackId: 'track-1',
      source,
      document,
    });
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 34999 },
      lyrics: {
        ...snapshot().lyrics,
        source: outputDocument.source,
        lines: outputDocument.lines,
      },
      musicStructure: null,
    });

    expect(outputDocument.lines[2]).toMatchObject({
      endMs: 30000,
      endInferred: true,
    });
    expect(
      selectLyricsOverlayFrame(value, {
        nowMs: Date.parse(value.generatedAt),
      }).ktv,
    ).toMatchObject({ visible: false, countIn: null });
  });

  it('estimates an inferred Enhanced LRC tail from its final exact segment start', () => {
    const source = {
      filename: 'late-segment-interlude.lrc',
      kind: 'lrclib',
      language: 'zh-Hant',
    };
    const document = normalizeLyricsDocument({
      text: `[00:00.00]第一行
[00:07.00]第二行
[00:14.00]<00:25.00>延後尾詞
[00:47.00]下段開頭
[00:54.00]下一句`,
      source,
    });
    const outputDocument = projectLyricsOutputDocument({
      trackId: 'track-1',
      source,
      document,
    });
    const base = snapshot({
      lyrics: {
        ...snapshot().lyrics,
        source: outputDocument.source,
        lines: outputDocument.lines,
      },
      musicStructure: null,
    });
    const nowMs = Date.parse(base.generatedAt);

    const active = selectLyricsOverlayFrame(
      { ...base, playback: { ...base.playback, positionMs: 26000 } },
      { nowMs },
    ).ktv;
    expect(active).toMatchObject({
      visible: true,
      currentText: '延後尾詞',
      currentSegments: [
        {
          text: '延後尾詞',
          state: 'active',
        },
      ],
    });
    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 35000 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({ visible: false, countIn: null });
  });

  it('preserves an explicit long VTT cue that ends at the next cue start', () => {
    const source = {
      filename: 'explicit.vtt',
      kind: 'youtube-cc',
      language: 'zh-Hant',
    };
    const document = normalizeLyricsDocument({
      text: `WEBVTT

00:00:00.000 --> 00:00:30.000
這是明示的長句

00:00:30.000 --> 00:00:37.000
下一句`,
      source,
    });
    const outputDocument = projectLyricsOutputDocument({
      trackId: 'track-1',
      source,
      document,
    });
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 15000 },
      lyrics: {
        ...snapshot().lyrics,
        source: outputDocument.source,
        lines: outputDocument.lines,
      },
    });

    expect(outputDocument.lines[0]).not.toHaveProperty('endInferred');
    expect(
      selectLyricsOverlayFrame(value, {
        nowMs: Date.parse(value.generatedAt),
      }).ktv,
    ).toMatchObject({
      visible: true,
      currentText: '這是明示的長句',
      lineProgress: 0.5,
    });
  });

  it('prefers a confident M2 instrumental boundary over gap estimation', () => {
    const lines = [
      { text: '副歌尾句', startMs: 0, endMs: null },
      { text: '下段開頭 下一個片語', startMs: 30000, endMs: 37000 },
    ];
    const base = snapshot({
      lyrics: { ...snapshot().lyrics, lines },
      musicStructure: {
        documentId: 'music-instrumental-reentry',
        trackId: 'track-1',
        sourceRevision: 'source-1',
        sourceDurationMs: 180000,
        level: 'M2',
        tempo: { bpm: 120, confidence: 0.9 },
        beats: [],
        sections: [
          {
            sectionId: 'verse',
            startMs: 0,
            endMs: 6000,
            role: 'chorus',
            confidence: 0.9,
          },
          {
            sectionId: 'instrumental',
            startMs: 6000,
            endMs: 30000,
            role: 'instrumental',
            confidence: 0.9,
          },
        ],
      },
    });
    const nowMs = Date.parse(base.generatedAt);

    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 10000 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({ visible: false });
    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 24999 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({ visible: false, countIn: null });
    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 25000 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({
      visible: true,
      currentText: '下段開頭',
      nextText: '下一個片語',
      countIn: {
        remainingBeats: 4,
        totalBeats: 4,
        timingSource: 'tempo',
      },
    });
    expect(
      selectLyricsOverlayFrame(
        {
          ...base,
          playback: {
            ...base.playback,
            status: 'seeking',
            positionMs: 25000,
          },
        },
        { nowMs },
      ),
    ).toMatchObject({
      timelineDiscontinuity: true,
      ktv: {
        visible: true,
        currentVisibleLineIndex: 1,
        countIn: { remainingBeats: 4, timingSource: 'tempo' },
      },
    });
    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 28000 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({
      currentText: '下段開頭',
      nextText: '下一個片語',
      countIn: {
        remainingBeats: 4,
        totalBeats: 4,
        timingSource: 'tempo',
      },
    });
    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 28500 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({
      countIn: { remainingBeats: 3, timingSource: 'tempo' },
    });
  });

  it('releases a completed Classic KTV line after a short handoff', () => {
    const base = snapshot({
      lyrics: {
        ...snapshot().lyrics,
        lines: [
          { text: '尾句', startMs: 0, endMs: 5000 },
          { text: '下段', startMs: 12000, endMs: 16000 },
        ],
      },
      musicStructure: null,
    });
    const nowMs = Date.parse(base.generatedAt);

    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 5599 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({ visible: true, currentText: '尾句', lineProgress: 1 });
    expect(
      selectLyricsOverlayFrame(
        {
          ...base,
          playback: {
            ...base.playback,
            status: 'seeking',
            positionMs: 5599,
          },
        },
        { nowMs },
      ),
    ).toMatchObject({
      timelineDiscontinuity: true,
      ktv: { visible: true, currentText: '尾句', lineProgress: 1 },
    });
    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 5600 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({ visible: false, countIn: null });
  });

  it('carries only the remaining lane hold into a five-second entrance', () => {
    const base = snapshot({
      lyrics: {
        ...snapshot().lyrics,
        lines: [
          { text: '副歌尾句', startMs: 0, endMs: 5000 },
          { text: '下段開頭', startMs: 10500, endMs: 14500 },
        ],
      },
      musicStructure: null,
    });
    const nowMs = Date.parse(base.generatedAt);

    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 5500 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({
      visible: true,
      currentText: '下段開頭',
      countIn: { remainingBeats: 4, timingSource: 'fallback' },
      laneReplacementDelayMs: 100,
    });
  });

  it('freezes whole-line progress projection when playback is paused', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, status: 'paused' },
    });

    const frame = selectLyricsFrame(value, {
      nowMs: Date.parse(value.generatedAt),
    });

    expect(frame.lineProgress).toBe(0.5);
    expect(frame).not.toHaveProperty('lineRemainingMs');
  });

  it('numbers only visible lyric lines so fixed KTV lanes survive blank rows and reconnects', () => {
    const value = snapshot();

    expect(
      selectLyricsFrame(value, { nowMs: Date.parse(value.generatedAt) }),
    ).toMatchObject({
      currentText: '潮聲沿著夜色靠岸',
      currentVisibleLineIndex: 1,
      nextText: '下一句仍在遠方',
      nextVisibleLineIndex: 2,
    });

    expect(
      selectLyricsFrame(
        {
          ...value,
          playback: { ...value.playback, positionMs: 17000 },
          lyrics: { ...value.lyrics, activeLineIndex: 3 },
        },
        { nowMs: Date.parse(value.generatedAt) },
      ),
    ).toMatchObject({
      currentText: '下一句仍在遠方',
      currentVisibleLineIndex: 2,
      nextText: '',
      nextVisibleLineIndex: null,
    });
  });

  it('does not let a speaker-only metadata row consume a visible KTV lane', () => {
    const lines = [
      { text: '第一句', startMs: 0, endMs: 9000 },
      { text: '[男]', startMs: 9000, endMs: 10000 },
      { text: '第二句', startMs: 10000, endMs: 15000 },
    ];
    const base = snapshot({
      playback: { ...snapshot().playback, positionMs: 5000 },
      lyrics: {
        ...snapshot().lyrics,
        activeLineIndex: 0,
        lines,
      },
    });

    expect(
      selectLyricsFrame(base, { nowMs: Date.parse(base.generatedAt) }),
    ).toMatchObject({
      currentText: '第一句',
      currentVisibleLineIndex: 0,
      nextText: '第二句',
      nextVisibleLineIndex: 1,
    });

    const markerFrame = selectLyricsFrame(
      {
        ...base,
        playback: { ...base.playback, positionMs: 9500 },
        lyrics: { ...base.lyrics, activeLineIndex: 1 },
      },
      { nowMs: Date.parse(base.generatedAt) },
    );
    expect(markerFrame).toMatchObject({
      currentText: '',
      currentVisibleLineIndex: null,
      nextText: '第二句',
      nextVisibleLineIndex: 1,
    });
  });

  it('projects stable synced-line progress for Live Stage pagination after seek or reconnect', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 17000 },
      lyrics: {
        ...snapshot().lyrics,
        lines: [
          {
            text: 'Every little signal should leave the middle of the stage completely visible',
            startMs: 12000,
            endMs: 22000,
          },
        ],
      },
    });

    expect(
      selectLyricsFrame(value, { nowMs: Date.parse(value.generatedAt) }),
    ).toMatchObject({ lineIndex: 0, lineProgress: 0.5 });
  });

  it('analyzes the canonical lyric once before the overlay template receives it', () => {
    const value = snapshot({
      lyrics: {
        ...snapshot().lyrics,
        lines: [
          {
            text: "[리즈] 내 답이야 (That's my style)",
            startMs: 9000,
            endMs: 15000,
          },
        ],
      },
    });

    expect(
      selectLyricsOverlayFrame(value, {
        nowMs: Date.parse(value.generatedAt),
      }).lyricsSourceAnalysis,
    ).toMatchObject({
      sourceText: "[리즈] 내 답이야 (That's my style)",
      speaker: '리즈',
      units: [
        { kind: 'main', text: '내 답이야' },
        { kind: 'parenthetical', text: "That's my style" },
      ],
    });
  });

  it('projects the Live Stage card from a fixed 4–8 second playback window', () => {
    const base = snapshot({
      playback: { ...snapshot().playback, positionMs: 0 },
    });
    const nowMs = Date.parse(base.generatedAt);

    for (const [positionMs, visible] of [
      [3999, false],
      [4000, true],
      [7999, true],
      [8000, false],
    ]) {
      expect(
        selectLiveStageFrame(
          {
            ...base,
            playback: { ...base.playback, status: 'paused', positionMs },
          },
          { nowMs },
        ),
      ).toMatchObject({
        active: true,
        cardVisible: visible,
        trackId: 'track-1',
        title: '海螺記',
        artist: '163braces',
      });
    }
  });

  it('keeps a timed lyric and the independently timed Live Stage card visible together', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 4500 },
      lyrics: {
        ...snapshot().lyrics,
        lines: [{ text: '[리즈]\n現在就開始唱', startMs: 0, endMs: 8000 }],
      },
    });

    expect(
      selectLyricsOverlayFrame(value, {
        nowMs: Date.parse(value.generatedAt),
      }),
    ).toMatchObject({
      visible: true,
      currentText: '[리즈]\n現在就開始唱',
      liveStage: {
        active: true,
        cardVisible: true,
        title: '海螺記',
      },
    });
  });

  it('schedules fixed Live Stage boundaries even without synced lyrics', () => {
    const base = snapshot({
      playback: { ...snapshot().playback, positionMs: 0 },
      lyrics: { ...snapshot().lyrics, trackId: 'another-track' },
    });
    const nowMs = Date.parse(base.generatedAt);

    expect(nextPresentationBoundaryDelayMs(base, { nowMs })).toBe(4000);
    expect(
      nextPresentationBoundaryDelayMs(
        { ...base, playback: { ...base.playback, positionMs: 4000 } },
        { nowMs },
      ),
    ).toBe(4000);
    expect(
      nextPresentationBoundaryDelayMs(
        { ...base, playback: { ...base.playback, positionMs: 8000 } },
        { nowMs },
      ),
    ).toBeNull();
  });

  it('does not reschedule a Live Stage boundary beyond a short track duration', () => {
    const value = snapshot({
      playback: {
        ...snapshot().playback,
        positionMs: 500,
        durationMs: 800,
      },
      lyrics: { ...snapshot().lyrics, trackId: 'another-track' },
    });

    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs: Date.parse(value.generatedAt),
      }),
    ).toBeNull();
  });

  it('schedules the next Live Stage caption page inside a long synced line', () => {
    const text =
      'Every little signal should leave the middle of the stage completely visible';
    const lineStartMs = 9000;
    const lineEndMs = 19000;
    const positionMs = 10000;
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs },
      lyrics: {
        ...snapshot().lyrics,
        lines: [{ text, startMs: lineStartMs, endMs: lineEndMs }],
      },
    });
    const [pageBoundary] = adaptLiveStageLyricsPresentation(
      analyzeLyricsSource(text),
      { lineProgress: 0 },
    ).pageBreakProgresses;

    expect(pageBoundary).toBeGreaterThan(0.1);
    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs: Date.parse(value.generatedAt),
      }),
    ).toBe(
      Math.ceil(
        lineStartMs + (lineEndMs - lineStartMs) * pageBoundary - positionMs,
      ),
    );
  });

  it('hides lyrics that do not belong to the playing track', () => {
    const value = snapshot({
      lyrics: { ...snapshot().lyrics, trackId: 'another-track' },
    });
    expect(selectLyricsFrame(value)).toMatchObject({
      revision: 8,
      visible: false,
      currentText: '',
      nextText: '',
      lineIndex: null,
      currentVisibleLineIndex: null,
      nextVisibleLineIndex: null,
    });
  });

  it('projects the active lyric from snapshot time instead of waiting for the next update', () => {
    const value = snapshot({
      playback: {
        ...snapshot().playback,
        positionMs: 12000,
      },
      lyrics: {
        ...snapshot().lyrics,
        offsetMs: 500,
      },
    });

    expect(
      selectLyricsFrame(value, {
        nowMs: Date.parse(value.generatedAt) + 3500,
      }),
    ).toMatchObject({
      currentText: '下一句仍在遠方',
      nextText: '',
      lineIndex: 3,
    });
  });

  it('schedules the next lyric boundary using playback rate and lyrics offset', () => {
    const value = snapshot({
      playback: {
        ...snapshot().playback,
        positionMs: 12000,
        rate: 2,
      },
      lyrics: {
        ...snapshot().lyrics,
        offsetMs: 500,
      },
    });

    expect(
      nextLyricsBoundaryDelayMs(value, {
        nowMs: Date.parse(value.generatedAt),
      }),
    ).toBe(1250);
    expect(
      nextLyricsBoundaryDelayMs(
        {
          ...value,
          playback: { ...value.playback, status: 'paused' },
        },
        { nowMs: Date.parse(value.generatedAt) },
      ),
    ).toBeNull();
  });

  it('projects segment phase and progress from the canonical playback clock', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 12000 },
      lyrics: {
        ...snapshot().lyrics,
        lines: [
          { text: '上一句', startMs: 0, endMs: 9000 },
          {
            text: '潮聲沿著夜色靠岸',
            startMs: 9000,
            endMs: 15000,
            segments: [
              {
                segmentId: 'segment-1',
                text: '潮聲',
                startMs: 9000,
                endMs: 11000,
              },
              {
                segmentId: 'segment-2',
                text: '沿著夜色靠岸',
                startMs: 11000,
                endMs: 15000,
              },
            ],
          },
          { text: '下一句', startMs: 15000, endMs: 20000 },
        ],
      },
    });

    expect(
      selectLyricsFrame(value, { nowMs: Date.parse(value.generatedAt) }),
    ).toMatchObject({
      currentText: '潮聲沿著夜色靠岸',
      currentSegments: [
        {
          segmentId: 'segment-1',
          text: '潮聲',
          state: 'past',
          progress: 1,
          remainingMs: null,
        },
        {
          segmentId: 'segment-2',
          text: '沿著夜色靠岸',
          state: 'active',
          progress: 0.25,
          remainingMs: 3000,
        },
      ],
    });
  });

  it('uses segment boundaries for local scheduling and freezes paused progress', () => {
    const segmentLine = {
      text: 'first second',
      startMs: 9000,
      endMs: 15000,
      segments: [
        {
          segmentId: 'segment-1',
          text: 'first ',
          startMs: 9000,
          endMs: null,
        },
        {
          segmentId: 'segment-2',
          text: 'second',
          startMs: 11000,
          endMs: 15000,
        },
      ],
    };
    const value = snapshot({
      playback: {
        ...snapshot().playback,
        positionMs: 10000,
        rate: 2,
      },
      lyrics: {
        ...snapshot().lyrics,
        activeLineIndex: 0,
        lines: [segmentLine],
      },
    });
    const nowMs = Date.parse(value.generatedAt);

    expect(nextLyricsBoundaryDelayMs(value, { nowMs })).toBe(500);
    expect(
      selectLyricsFrame(
        {
          ...value,
          playback: { ...value.playback, status: 'paused' },
        },
        { nowMs: nowMs + 5000 },
      ).currentSegments[0],
    ).toMatchObject({
      state: 'active',
      progress: 0.5,
      remainingMs: null,
    });
  });

  it('keeps T1 projection separate from fabricated segment timing', () => {
    const value = snapshot();
    const frame = selectLyricsFrame(value, {
      nowMs: Date.parse(value.generatedAt),
    });

    expect(frame.currentText).toBe('潮聲沿著夜色靠岸');
    expect(frame).not.toHaveProperty('currentSegments');
    expect(frame.lineRemainingMs).toBe(3000);
  });

  it('keeps an open-ended active segment without fabricated progress', () => {
    const value = snapshot({
      playback: {
        ...snapshot().playback,
        positionMs: 1000,
        durationMs: null,
      },
      lyrics: {
        ...snapshot().lyrics,
        activeLineIndex: 0,
        lines: [
          {
            text: 'open',
            startMs: 0,
            endMs: null,
            segments: [
              {
                segmentId: 'segment-open',
                text: 'open',
                startMs: 0,
                endMs: null,
              },
            ],
          },
        ],
      },
    });

    expect(
      selectLyricsFrame(value, {
        nowMs: Date.parse(value.generatedAt),
      }).currentSegments[0],
    ).toMatchObject({
      state: 'active',
      progress: null,
      remainingMs: null,
    });
  });

  it('applies lyrics offset when track duration closes the final segment', () => {
    const value = snapshot({
      playback: {
        ...snapshot().playback,
        positionMs: 9500,
        durationMs: 10000,
      },
      lyrics: {
        ...snapshot().lyrics,
        activeLineIndex: 0,
        offsetMs: 1000,
        lines: [
          {
            text: 'final',
            startMs: 9000,
            endMs: null,
            segments: [
              {
                segmentId: 'segment-final',
                text: 'final',
                startMs: 9000,
                endMs: null,
              },
            ],
          },
        ],
      },
    });

    expect(
      selectLyricsFrame(value, {
        nowMs: Date.parse(value.generatedAt),
      }).currentSegments[0],
    ).toMatchObject({
      state: 'active',
      progress: 0.75,
      remainingMs: 500,
    });
  });

  it('freezes the projected clock while buffering or seeking', () => {
    for (const status of ['buffering', 'seeking']) {
      const value = snapshot({
        playback: { ...snapshot().playback, status, positionMs: 12000 },
      });
      expect(
        selectLyricsFrame(value, {
          nowMs: Date.parse(value.generatedAt) + 10000,
        }),
      ).toMatchObject({ currentText: '潮聲沿著夜色靠岸' });
      if (status === 'seeking') {
        expect(selectLyricsFrame(value)).toMatchObject({
          timelineDiscontinuity: true,
        });
      }
      expect(nextLyricsBoundaryDelayMs(value)).toBeNull();
    }
  });

  it('projects the active section and beat from playback time without lyrics offset', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 12000 },
      lyrics: { ...snapshot().lyrics, offsetMs: 3000 },
      musicStructure: {
        documentId: 'music-1',
        trackId: 'track-1',
        sourceRevision: 'source-1',
        sourceDurationMs: 180000,
        level: 'M2',
        tempo: { bpm: 120, confidence: 0.8 },
        beats: [
          { timeMs: 11500, positionInBar: 4, confidence: 0.9 },
          {
            timeMs: 12000,
            positionInBar: 1,
            downbeat: true,
            confidence: 0.82,
          },
          { timeMs: 12500, positionInBar: 2, confidence: 0.78 },
        ],
        sections: [
          {
            sectionId: 'section-verse',
            startMs: 0,
            endMs: 12000,
            role: 'verse',
            confidence: 0.91,
          },
          {
            sectionId: 'section-chorus',
            startMs: 12000,
            endMs: 24000,
            role: 'chorus',
            confidence: 0.73,
          },
        ],
      },
    });

    expect(
      selectMusicStructureFrame(value, {
        nowMs: Date.parse(value.generatedAt),
      }),
    ).toEqual({
      documentId: 'music-1',
      level: 'M2',
      activeSection: {
        sectionId: 'section-chorus',
        role: 'chorus',
        confidence: 0.73,
      },
      currentBeat: {
        beatIndex: 1,
        timeMs: 12000,
        elapsedMs: 0,
        positionInBar: 1,
        downbeat: true,
        confidence: 0.82,
      },
    });
    expect(
      selectLyricsFrame(value, { nowMs: Date.parse(value.generatedAt) }),
    ).toMatchObject({
      musicStructure: {
        activeSection: { role: 'chorus' },
        currentBeat: { timeMs: 12000, downbeat: true },
      },
    });
  });

  it('falls back to M0 when music structure does not belong to the playing track', () => {
    const value = snapshot({
      musicStructure: {
        documentId: 'music-1',
        trackId: 'another-track',
        sourceRevision: 'source-1',
        sourceDurationMs: 180000,
        level: 'M2',
        tempo: null,
        beats: [],
        sections: [],
      },
    });

    expect(selectMusicStructureFrame(value)).toBeNull();
    expect(selectLyricsFrame(value)).not.toHaveProperty('musicStructure');
  });

  it('schedules the next confident lyric, beat, or section boundary and freezes non-playing states', () => {
    const value = snapshot({
      playback: {
        ...snapshot().playback,
        positionMs: 12000,
        rate: 2,
      },
      lyrics: {
        ...snapshot().lyrics,
        offsetMs: 1000,
        lines: [
          { text: 'current', startMs: 9000, endMs: 15000 },
          { text: 'next', startMs: 15000, endMs: 20000 },
        ],
      },
      musicStructure: {
        documentId: 'music-1',
        trackId: 'track-1',
        sourceRevision: 'source-1',
        sourceDurationMs: 180000,
        level: 'M2',
        tempo: null,
        beats: [
          { timeMs: 12200, confidence: 0.2 },
          { timeMs: 12500, confidence: 0.8 },
        ],
        sections: [
          {
            sectionId: 'section-1',
            startMs: 0,
            endMs: 13000,
            role: 'verse',
            confidence: 0.9,
          },
          {
            sectionId: 'section-2',
            startMs: 13000,
            endMs: 180000,
            role: 'unknown',
            confidence: 0.9,
          },
        ],
      },
    });
    const nowMs = Date.parse(value.generatedAt);

    expect(nextPresentationBoundaryDelayMs(value, { nowMs })).toBe(250);
    for (const status of [
      'paused',
      'buffering',
      'seeking',
      'ended',
      'disconnected',
    ]) {
      expect(
        nextPresentationBoundaryDelayMs(
          { ...value, playback: { ...value.playback, status } },
          { nowMs },
        ),
      ).toBeNull();
    }
  });

  it('schedules within contract limits without spreading a large beat grid', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 0 },
      lyrics: { ...snapshot().lyrics, trackId: 'another-track' },
      musicStructure: {
        documentId: 'music-large',
        trackId: 'track-1',
        sourceRevision: 'source-1',
        sourceDurationMs: 180000,
        level: 'M1',
        tempo: null,
        beats: Array.from({ length: 130000 }, (_, index) => ({
          timeMs: index + 1,
          confidence: 0.9,
        })),
        sections: [],
      },
    });

    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs: Date.parse(value.generatedAt),
      }),
    ).toBe(1);
  });

  it('projects a negative display compensation ahead while playing', () => {
    const value = snapshot({
      displayDelayMs: -1000,
      playback: { ...snapshot().playback, positionMs: 1000 },
      lyrics: {
        ...snapshot().lyrics,
        lines: [
          { text: 'first', startMs: 0, endMs: 2000 },
          { text: 'second', startMs: 2000, endMs: 4000 },
        ],
      },
    });

    expect(
      selectLyricsFrame(value, { nowMs: Date.parse(value.generatedAt) }),
    ).toMatchObject({ currentText: 'second' });
  });

  it('selects now-playing and queue frames without media fields', () => {
    expect(selectNowPlayingFrame(snapshot())).toEqual({
      revision: 8,
      visible: true,
      trackId: 'track-1',
      title: '海螺記',
      artist: '163braces',
      nextTitle: 'Next Song',
    });

    expect(selectSetlistFrame(snapshot())).toEqual({
      revision: 8,
      visible: true,
      sourceName: 'Tonight',
      rows: [
        { state: 'played', title: 'Intro', artist: 'Singer' },
        { state: 'current', title: '海螺記', artist: '163braces' },
        { state: 'queued', title: 'Next Song', artist: 'Singer' },
      ],
    });
  });

  it('projects bounded Artwork playback state with an M0-safe duration fallback', () => {
    expect(
      selectArtworkFrame(snapshot(), {
        nowMs: Date.parse('2026-08-22T00:00:03.000Z'),
      }),
    ).toMatchObject({
      revision: 8,
      visible: true,
      trackId: 'track-1',
      title: '海螺記',
      artist: '163braces',
      playbackStatus: 'playing',
      positionMs: 15000,
      durationMs: 180000,
      progress: 15 / 180,
    });

    expect(
      selectArtworkFrame(
        snapshot({
          playback: {
            status: 'paused',
            positionMs: 32000,
            track: { id: 'track-1', title: '海螺記', artist: '163braces' },
          },
        }),
      ),
    ).toMatchObject({
      playbackStatus: 'paused',
      positionMs: 32000,
      durationMs: 0,
      progress: 0,
    });
  });

  it('caps the public setlist frame at eight readable rows', () => {
    const value = snapshot({
      queue: {
        sourceName: 'Tonight',
        items: Array.from({ length: 12 }, (_, index) => ({
          state: index === 0 ? 'current' : 'queued',
          track: {
            id: `track-${index}`,
            title: `Track ${index + 1}`,
            artist: 'Singer',
          },
        })),
      },
    });

    expect(selectSetlistFrame(value).rows).toHaveLength(8);
  });
});
