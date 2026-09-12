import { describe, expect, it } from 'vitest';
import {
  adaptLiveStageLyricsPresentation,
  analyzeLyricsSource,
  compileLyricsPresentationDocument,
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
    const frame = selectLyricsFrame(value, {
      nowMs: Date.parse(value.generatedAt),
    });

    expect(frame).toMatchObject({
      revision: 8,
      visible: true,
      currentText: '潮聲沿著夜色靠岸',
      nextText: '下一句仍在遠方',
      language: 'zh-Hant',
      lineIndex: 1,
      currentVisibleLineIndex: 1,
      nextVisibleLineIndex: 2,
      lineProgress: 0.5,
      currentTimingSource: 'line-estimate',
    });
    expect(frame.currentSegments.map((segment) => segment.text).join('')).toBe(
      '潮聲沿著夜色靠岸',
    );
    expect(frame.currentSegments).toHaveLength(8);
    expect(frame).not.toHaveProperty('lineRemainingMs');
  });

  it('selects only the reading aligned to the active canonical lyric line', () => {
    const base = snapshot();
    const currentReading = {
      lineId: 'line-2',
      text: '潮聲沿著夜色靠岸',
      segments: [{ text: '潮聲', reading: 'しおごえ' }],
    };
    const value = {
      ...base,
      lyrics: {
        ...base.lyrics,
        reading: {
          lines: [
            { text: '上一句', segments: [] },
            currentReading,
            { text: '   ', segments: [] },
            { text: '下一句仍在遠方', segments: [] },
          ],
        },
      },
    };

    expect(
      selectLyricsFrame(value, { nowMs: Date.parse(value.generatedAt) })
        .currentReading,
    ).toBe(currentReading);
    value.lyrics.reading.lines[1] = {
      ...currentReading,
      text: '過期文字',
    };
    expect(
      selectLyricsFrame(value, { nowMs: Date.parse(value.generatedAt) }),
    ).not.toHaveProperty('currentReading');
  });

  it('projects only the active template customization when a template is selected', () => {
    const value = snapshot();
    const nowMs = Date.parse(value.generatedAt);

    const generic = selectLyricsOverlayFrame(value, {
      nowMs,
      templateId: 'focus-line',
    });
    expect(generic).not.toHaveProperty('ktv');
    expect(generic).not.toHaveProperty('liveStage');
    expect(generic).not.toHaveProperty('lyricsSourceAnalysis');

    const ktv = selectLyricsOverlayFrame(value, {
      nowMs,
      templateId: 'karaoke-stack',
    });
    expect(ktv.ktv).toMatchObject({ visible: true });
    expect(ktv).not.toHaveProperty('liveStage');

    const manga = selectLyricsOverlayFrame(value, {
      nowMs,
      templateId: 'manga-frame',
    });
    expect(manga.lyricsSourceAnalysis?.sourceText).toBe(generic.currentText);
    expect(manga).not.toHaveProperty('ktv');
    expect(manga).not.toHaveProperty('liveStage');

    const liveStage = selectLyricsOverlayFrame(value, {
      nowMs,
      templateId: 'live-stage',
    });
    expect(liveStage.liveStage).toMatchObject({ active: true });
    expect(liveStage.lyricsSourceAnalysis?.sourceText).toBe(
      generic.currentText,
    );
    expect(liveStage).not.toHaveProperty('ktv');

    const kineticPop = selectLyricsOverlayFrame(value, {
      nowMs,
      templateId: 'kinetic-pop',
    });
    expect(kineticPop.kineticPop).toMatchObject({
      text: generic.currentText,
      material: 'candy-rim',
      composition: 'punch',
    });
    expect(kineticPop).not.toHaveProperty('ktv');
    expect(kineticPop).not.toHaveProperty('liveStage');
    expect(kineticPop).not.toHaveProperty('lyricsSourceAnalysis');

    const fixedMaterial = selectLyricsOverlayFrame(value, {
      nowMs,
      templateId: 'kinetic-pop',
      kineticMaterial: 'chromatic-depth',
    });
    expect(fixedMaterial.kineticPop.material).toBe('chromatic-depth');
  });

  it('projects one shared lyrics rhythm reference for every lyrics template', () => {
    const base = snapshot();
    const value = snapshot({
      musicStructure: {
        documentId: 'music-rhythm',
        trackId: 'track-1',
        sourceRevision: 'source-1',
        sourceDurationMs: 180000,
        level: 'M1',
        tempo: { bpm: 120, confidence: 0.9 },
        beats: Array.from({ length: 12 }, (_value, index) => ({
          timeMs: 9000 + index * 500,
          positionInBar: (index % 4) + 1,
          downbeat: index % 4 === 0,
          confidence: 0.9,
        })),
        sections: [],
      },
    });
    const nowMs = Date.parse(base.generatedAt);

    for (const templateId of [
      'focus-line',
      'quiet-caption',
      'karaoke-stack',
      'kinetic-pop',
      'ornate-vertical',
      'manga-frame',
      'live-stage',
    ]) {
      expect(
        selectLyricsOverlayFrame(value, { nowMs, templateId }),
      ).toMatchObject({
        musicStructure: { level: 'M1' },
        lyricsRhythm: {
          timingSource: 'beat-grid',
          beatDurationMs: 500,
          lineBeatCount: 12,
          lineBeatIndex: 6,
          currentBeat: { beatIndex: 6, lyricsTimeMs: 12000 },
          nextBeat: { beatIndex: 7, lyricsTimeMs: 12500, delayMs: 500 },
        },
      });
    }

    for (const templateId of [
      'focus-line',
      'quiet-caption',
      'kinetic-pop',
      'ornate-vertical',
      'manga-frame',
      'live-stage',
    ]) {
      expect(
        nextPresentationBoundaryDelayMs(value, { nowMs, templateId }),
      ).not.toBe(500);
    }
    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs,
        templateId: 'karaoke-stack',
      }),
    ).toBe(500);
  });

  it('schedules the next lyric boundary for the kinetic template', () => {
    const value = snapshot();
    const nowMs = Date.parse(value.generatedAt);

    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs,
        templateId: 'kinetic-pop',
      }),
    ).toBe(3000);
  });

  it('projects the cached ornate vertical presentation for the active line', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 3000 },
      lyrics: {
        ...snapshot().lyrics,
        source: { language: 'ja' },
        activeLineIndex: 0,
        documentId: 'ornate-state',
        documentRevision: 3,
        lines: [
          {
            text: '夜が明けるまで後悔を抱えて歩いていく',
            startMs: 0,
            endMs: 6000,
          },
          { text: '後悔ばかりが募って', startMs: 6000, endMs: 12000 },
        ],
      },
    });
    const presentationDocument = compileLyricsPresentationDocument(
      {
        documentId: value.lyrics.documentId,
        documentRevision: value.lyrics.documentRevision,
        language: value.lyrics.source.language,
        lines: value.lyrics.lines,
      },
      { templateId: 'ornate-vertical' },
    );

    const frame = selectLyricsOverlayFrame(value, {
      nowMs: Date.parse(value.generatedAt),
      presentationDocument,
      templateId: 'ornate-vertical',
    });

    expect(frame.ornateVertical).toMatchObject({
      text: '夜が明けるまで後悔を抱えて歩いていく',
      keyword: { index: 7, text: '後悔' },
      placement: 'right',
    });
    expect(
      frame.ornateVertical.segments.map((segment) => segment.text),
    ).toEqual(['夜が明けるまで後悔を', '抱えて歩いていく']);
    expect(frame).not.toHaveProperty('kineticPop');
    expect(frame).not.toHaveProperty('lyricsSourceAnalysis');
  });

  it('selects and schedules authored Kinetic Pop phrases inside one timed line', () => {
    const base = snapshot();
    const sourceText = 'いつでも僕らはこんな風に ぼんくらな夜に飽き飽き';
    const valueAt = (positionMs) => ({
      ...base,
      playback: { ...base.playback, positionMs },
      lyrics: {
        ...base.lyrics,
        lines: [
          base.lyrics.lines[0],
          { text: sourceText, startMs: 9000, endMs: 15000 },
          ...base.lyrics.lines.slice(2),
        ],
      },
    });
    const nowMs = Date.parse(base.generatedAt);

    const first = selectLyricsOverlayFrame(valueAt(11000), {
      nowMs,
      templateId: 'kinetic-pop',
    });
    const second = selectLyricsOverlayFrame(valueAt(13000), {
      nowMs,
      templateId: 'kinetic-pop',
    });

    expect(first.kineticPop).toMatchObject({
      text: sourceText,
      displayText: 'いつでも僕らはこんな風に',
      phraseIndex: 0,
    });
    expect(second.kineticPop).toMatchObject({
      text: sourceText,
      displayText: 'ぼんくらな夜に飽き飽き',
      phraseIndex: 1,
    });
    expect(
      nextPresentationBoundaryDelayMs(valueAt(11000), {
        nowMs,
        templateId: 'kinetic-pop',
      }),
    ).toBe(1131);
    expect(
      nextPresentationBoundaryDelayMs(valueAt(13000), {
        nowMs,
        templateId: 'kinetic-pop',
      }),
    ).toBe(2000);
  });

  it('uses authored T2 boundaries for Kinetic Pop phrase changes', () => {
    const base = snapshot();
    const sourceText = 'first second';
    const line = {
      text: sourceText,
      startMs: 9000,
      endMs: 15000,
      segments: [
        {
          segmentId: 'first',
          text: 'first ',
          startMs: 9000,
          endMs: 10000,
        },
        {
          segmentId: 'second',
          text: 'second',
          startMs: 13500,
          endMs: 15000,
        },
      ],
    };
    const valueAt = (positionMs) => ({
      ...base,
      playback: { ...base.playback, positionMs },
      lyrics: { ...base.lyrics, lines: [line] },
    });
    const nowMs = Date.parse(base.generatedAt);

    expect(
      selectLyricsOverlayFrame(valueAt(12000), {
        nowMs,
        templateId: 'kinetic-pop',
      }).kineticPop,
    ).toMatchObject({
      displayText: 'first',
      phraseIndex: 0,
      phraseTimingSource: 't2',
    });
    expect(
      selectLyricsOverlayFrame(valueAt(14000), {
        nowMs,
        templateId: 'kinetic-pop',
      }).kineticPop,
    ).toMatchObject({
      displayText: 'second',
      phraseIndex: 1,
      phraseTimingSource: 't2',
    });
    expect(
      nextPresentationBoundaryDelayMs(valueAt(12000), {
        nowMs,
        templateId: 'kinetic-pop',
      }),
    ).toBe(1500);
  });

  it('schedules only boundaries used by the active template', () => {
    const value = snapshot({
      playback: {
        ...snapshot().playback,
        positionMs: 1000,
      },
      lyrics: {
        ...snapshot().lyrics,
        trackId: null,
        synced: false,
        activeLineIndex: -1,
        lines: [],
      },
    });
    const nowMs = Date.parse(value.generatedAt);

    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs,
        templateId: 'focus-line',
      }),
    ).toBeNull();
    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs,
        templateId: 'live-stage',
      }),
    ).toBe(3000);
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

    expect(selectLyricsFrame(value, { nowMs })).not.toHaveProperty('countIn');
    expect(
      selectLyricsOverlayFrame(value, {
        nowMs,
        templateId: 'karaoke-stack',
      }).ktv,
    ).toMatchObject({
      visible: true,
      countIn: {
        remainingBeats: 2,
        totalBeats: 4,
        timingSource: 'beat-grid',
      },
    });
    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs,
        templateId: 'karaoke-stack',
      }),
    ).toBe(500);
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

    expect(selectLyricsFrame(value, { nowMs })).not.toHaveProperty('countIn');
    expect(
      selectLyricsOverlayFrame(value, {
        nowMs,
        templateId: 'karaoke-stack',
      }).ktv,
    ).toMatchObject({
      countIn: {
        remainingBeats: 3,
        totalBeats: 4,
        timingSource: 'fallback',
      },
    });
    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs,
        templateId: 'karaoke-stack',
      }),
    ).toBe(500);

    const beforeCountIn = {
      ...value,
      playback: { ...value.playback, positionMs: 7000 },
    };
    expect(selectLyricsFrame(beforeCountIn, { nowMs })).not.toHaveProperty(
      'countIn',
    );
    expect(nextLyricsBoundaryDelayMs(beforeCountIn, { nowMs })).toBe(3000);
    expect(
      nextPresentationBoundaryDelayMs(beforeCountIn, {
        nowMs,
        templateId: 'karaoke-stack',
      }),
    ).toBe(1000);
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

    expect(selectLyricsFrame(value, { nowMs })).not.toHaveProperty('countIn');
    expect(
      selectLyricsOverlayFrame(value, {
        nowMs,
        templateId: 'karaoke-stack',
      }).ktv,
    ).toMatchObject({
      countIn: { remainingBeats: 3, timingSource: 'tempo' },
    });
    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs,
        templateId: 'karaoke-stack',
      }),
    ).toBe(600);
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
      visible: true,
      currentText: '[女]',
      nextText: '[女]第一句',
    });
    expect(
      selectLyricsOverlayFrame(value, {
        nowMs,
        templateId: 'karaoke-stack',
      }).ktv,
    ).toMatchObject({
      countIn: { visibleLineIndex: 0, remainingBeats: 3 },
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
      playback: { ...snapshot().playback, positionMs: 8000 },
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
          { text: '下一句', startMs: 14000, endMs: 19000 },
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
    expect(preRoll.currentSegments).toHaveLength(5);
    expect(
      preRoll.currentSegments.every(
        (segment) => segment.state === 'upcoming' && segment.progress === 0,
      ),
    ).toBe(true);
    expect(active).toMatchObject({
      currentText: '窗外的麻雀',
      nextText: '在電線桿上多嘴',
      currentVisibleLineIndex: 0,
      nextVisibleLineIndex: 1,
    });
    expect(
      active.currentSegments.map(({ segmentId, text }) => ({
        segmentId,
        text,
      })),
    ).toEqual(
      preRoll.currentSegments.map(({ segmentId, text }) => ({
        segmentId,
        text,
      })),
    );
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

  it('projects the upcoming T2 line before a continuous KTV lane handoff', () => {
    const lines = [
      {
        text: 'A line',
        startMs: 0,
        endMs: 2000,
        segments: [
          { segmentId: 'a-1', text: 'A ', startMs: 0, endMs: 1000 },
          { segmentId: 'a-2', text: 'line', startMs: 1000, endMs: 2000 },
        ],
      },
      {
        text: 'B line',
        startMs: 2000,
        endMs: 4000,
        segments: [
          { segmentId: 'b-1', text: 'B ', startMs: 2000, endMs: 3000 },
          { segmentId: 'b-2', text: 'line', startMs: 3000, endMs: 4000 },
        ],
      },
    ];
    const before = snapshot({
      playback: { ...snapshot().playback, positionMs: 1000 },
      lyrics: { ...snapshot().lyrics, activeLineIndex: 0, lines },
    });
    const after = {
      ...before,
      playback: { ...before.playback, positionMs: 2500 },
      lyrics: { ...before.lyrics, activeLineIndex: 1 },
    };
    const nowMs = Date.parse(before.generatedAt);
    const upcoming = selectLyricsOverlayFrame(before, { nowMs }).ktv;
    const active = selectLyricsOverlayFrame(after, { nowMs }).ktv;

    expect(upcoming.nextSegments).toEqual([
      expect.objectContaining({
        segmentId: 'b-1',
        state: 'upcoming',
        progress: 0,
      }),
      expect.objectContaining({
        segmentId: 'b-2',
        state: 'upcoming',
        progress: 0,
      }),
    ]);
    expect(
      active.currentSegments.map(({ segmentId, text }) => ({
        segmentId,
        text,
      })),
    ).toEqual(
      upcoming.nextSegments.map(({ segmentId, text }) => ({
        segmentId,
        text,
      })),
    );
  });

  it('keeps the upcoming T2 lane mounted through a sub-frame completed gap', () => {
    const lines = [
      {
        text: 'A line',
        startMs: 0,
        endMs: 2000,
        segments: [
          { segmentId: 'a-1', text: 'A ', startMs: 0, endMs: 1000 },
          { segmentId: 'a-2', text: 'line', startMs: 1000, endMs: 2000 },
        ],
      },
      {
        text: 'B line',
        startMs: 2001,
        endMs: 4000,
        segments: [
          { segmentId: 'b-1', text: 'B ', startMs: 2001, endMs: 3000 },
          { segmentId: 'b-2', text: 'line', startMs: 3000, endMs: 4000 },
        ],
      },
    ];
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 2000 },
      lyrics: { ...snapshot().lyrics, activeLineIndex: 0, lines },
      musicStructure: null,
    });

    const completed = selectLyricsOverlayFrame(value, {
      nowMs: Date.parse(value.generatedAt),
      templateId: 'karaoke-stack',
    }).ktv;

    expect(completed).toMatchObject({
      currentText: 'A line',
      currentVisibleLineIndex: 0,
      lineProgress: 1,
      nextText: 'B line',
      nextVisibleLineIndex: 1,
      nextLaneIndex: 1,
    });
    expect(completed.nextSegments).toEqual([
      expect.objectContaining({ segmentId: 'b-1', state: 'upcoming' }),
      expect.objectContaining({ segmentId: 'b-2', state: 'upcoming' }),
    ]);
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
      currentLaneIndex: 0,
      nextLaneIndex: 1,
      countIn: {
        remainingBeats: 4,
        totalBeats: 4,
        timingSource: 'tempo',
        visibleLineIndex: 1,
        laneIndex: 1,
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
      nextText: '第二行',
      nextVisibleLineIndex: 1,
      nextHeld: true,
    });

    const interlude = selectLyricsOverlayFrame(
      {
        ...base,
        playback: { ...base.playback, positionMs: 26000 },
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
      currentLaneIndex: 0,
      nextLaneIndex: 1,
      countIn: {
        remainingBeats: 3,
        timingSource: 'fallback',
        laneIndex: 0,
      },
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
        { ...base, playback: { ...base.playback, positionMs: 20000 } },
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
[00:42.00]下段開頭
[00:49.00]下一句`,
      source,
    });
    const outputDocument = projectLyricsOutputDocument({
      trackId: 'track-1',
      source,
      document,
    });
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 35000 },
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
        { ...base, playback: { ...base.playback, positionMs: 37000 } },
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
        { ...base, playback: { ...base.playback, positionMs: 11000 } },
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

  it('keeps a Classic KTV section tail for five seconds before a long interlude', () => {
    const base = snapshot({
      lyrics: {
        ...snapshot().lyrics,
        lines: [
          { text: '尾句', startMs: 0, endMs: 5000 },
          { text: '下段', startMs: 30000, endMs: 34000 },
        ],
      },
      musicStructure: null,
    });
    const nowMs = Date.parse(base.generatedAt);

    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 9999 } },
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
            positionMs: 9999,
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
        { ...base, playback: { ...base.playback, positionMs: 10000 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({ visible: false, countIn: null });
  });

  it('keeps the contiguous final pair together through the active and completed tail', () => {
    const base = snapshot({
      lyrics: {
        ...snapshot().lyrics,
        lines: [
          { text: 'You will shine', startMs: 0, endMs: 4000 },
          {
            text: "If it's gonna be a BAD DAY",
            startMs: 4000,
            endMs: 8000,
          },
          { text: 'Next verse', startMs: 30000, endMs: 34000 },
        ],
      },
      musicStructure: null,
    });
    const nowMs = Date.parse(base.generatedAt);

    for (const positionMs of [6000, 12999]) {
      expect(
        selectLyricsOverlayFrame(
          { ...base, playback: { ...base.playback, positionMs } },
          { nowMs },
        ).ktv,
      ).toMatchObject({
        visible: true,
        currentText: "If it's gonna be a BAD DAY",
        currentVisibleLineIndex: 1,
        nextText: 'You will shine',
        nextVisibleLineIndex: 0,
        nextHeld: true,
      });
    }
  });

  it('does not pull a previous section across an entrance gap into the final pair', () => {
    const base = snapshot({
      playback: { ...snapshot().playback, positionMs: 12000 },
      lyrics: {
        ...snapshot().lyrics,
        lines: [
          { text: 'Prior section', startMs: 0, endMs: 4000 },
          { text: 'Final isolated line', startMs: 10000, endMs: 14000 },
        ],
      },
      musicStructure: null,
    });

    expect(
      selectLyricsOverlayFrame(base, {
        nowMs: Date.parse(base.generatedAt),
      }).ktv,
    ).toMatchObject({
      currentText: 'Final isolated line',
      nextText: '',
      nextVisibleLineIndex: null,
    });
  });

  it('keeps the 600ms completed hold for a continuous lyric handoff', () => {
    const base = snapshot({
      lyrics: {
        ...snapshot().lyrics,
        lines: [
          { text: '連續尾句', startMs: 0, endMs: 5000 },
          { text: '接續歌詞', startMs: 7000, endMs: 11000 },
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
    ).toMatchObject({
      visible: true,
      currentText: '連續尾句',
      lineProgress: 1,
    });
    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 5600 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({ visible: false, countIn: null });
  });

  it('keeps the final track lyric for the same five-second tail', () => {
    const base = snapshot({
      lyrics: {
        ...snapshot().lyrics,
        lines: [{ text: '全曲最後一句', startMs: 0, endMs: 5000 }],
      },
      musicStructure: null,
    });
    const nowMs = Date.parse(base.generatedAt);

    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 9999 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({
      visible: true,
      currentText: '全曲最後一句',
      lineProgress: 1,
    });
    expect(
      nextPresentationBoundaryDelayMs(
        { ...base, playback: { ...base.playback, positionMs: 5000 } },
        { nowMs, templateId: 'karaoke-stack' },
      ),
    ).toBe(5000);
    expect(
      selectLyricsOverlayFrame(
        { ...base, playback: { ...base.playback, positionMs: 10000 } },
        { nowMs },
      ).ktv,
    ).toMatchObject({ visible: false, countIn: null });
  });

  it('carries the remaining section-tail hold into a five-second entrance', () => {
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
      laneReplacementDelayMs: 4500,
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

  it('preserves speaker-like source text in base projection but excludes it from KTV lanes', () => {
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
      nextText: '[男]',
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
      currentText: '[男]',
      currentVisibleLineIndex: 1,
      nextText: '第二句',
      nextVisibleLineIndex: 2,
    });
    expect(
      selectLyricsOverlayFrame(base, {
        nowMs: Date.parse(base.generatedAt),
        templateId: 'karaoke-stack',
      }).ktv,
    ).toMatchObject({
      currentText: '第一句',
      nextText: '第二句',
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
    const pageDelayMs = Math.ceil(
      lineStartMs + (lineEndMs - lineStartMs) * pageBoundary - positionMs,
    );
    const nextDelayMs = nextPresentationBoundaryDelayMs(value, {
      nowMs: Date.parse(value.generatedAt),
    });
    expect(nextDelayMs).toBeGreaterThan(0);
    expect(nextDelayMs).toBeLessThanOrEqual(pageDelayMs);
  });

  it('uses an authored T2 source boundary for the next Live Stage page', () => {
    const text =
      '想看見天上璀璨的星光 sing it with me tonight beyond every doubt';
    const secondPageStart = text.indexOf('tonight');
    const line = {
      text,
      startMs: 9000,
      endMs: 19000,
      segments: [
        {
          segmentId: 'whole-line',
          text,
          startMs: 9000,
          endMs: 19000,
        },
      ],
    };
    const base = snapshot({
      lyrics: { ...snapshot().lyrics, lines: [line] },
    });
    const boundaryMs =
      line.startMs +
      ((line.endMs - line.startMs) * secondPageStart) / text.length;
    const nowMs = Date.parse(base.generatedAt);
    const before = {
      ...base,
      playback: { ...base.playback, positionMs: boundaryMs - 500 },
    };
    const after = {
      ...base,
      playback: { ...base.playback, positionMs: boundaryMs + 100 },
    };

    expect(
      selectLyricsOverlayFrame(before, {
        lyricsPresentationPolicyId: 'balanced',
        nowMs,
        templateId: 'live-stage',
      }),
    ).toMatchObject({
      liveStagePageIndex: 0,
      liveStagePageTimingSource: 't2',
    });
    expect(
      selectLyricsOverlayFrame(after, {
        lyricsPresentationPolicyId: 'balanced',
        nowMs,
        templateId: 'live-stage',
      }),
    ).toMatchObject({
      liveStagePageIndex: 1,
      liveStagePageTimingSource: 't2',
    });
    expect(
      nextPresentationBoundaryDelayMs(before, {
        lyricsPresentationPolicyId: 'balanced',
        nowMs,
        templateId: 'live-stage',
      }),
    ).toBe(500);
    expect(
      nextPresentationBoundaryDelayMs(after, {
        lyricsPresentationPolicyId: 'balanced',
        nowMs,
        templateId: 'live-stage',
      }),
    ).toBe(Math.ceil(line.endMs - after.playback.positionMs));
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

  it('schedules the next estimated word boundary using rate and offset', () => {
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
    ).toBe(125);
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
      currentTimingSource: 't2',
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

  it('projects Manga bubble reveal from authored T2 source ranges', () => {
    const line = {
      text: '「前半」「後半」',
      startMs: 9000,
      endMs: 17000,
      segments: [
        {
          segmentId: 'segment-all',
          text: '「前半」「後半」',
          startMs: 9000,
          endMs: 17000,
        },
      ],
    };
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 12000 },
      lyrics: {
        ...snapshot().lyrics,
        source: { language: 'ja' },
        lines: [line],
      },
    });
    const nowMs = Date.parse(value.generatedAt);

    expect(
      selectLyricsOverlayFrame(value, {
        nowMs,
        templateId: 'manga-frame',
      }),
    ).toMatchObject({
      currentTimingSource: 't2',
      mangaBubbleTiming: [
        { startMs: 9000, state: 'revealed' },
        { startMs: 13000, state: 'upcoming' },
      ],
    });
    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs,
        templateId: 'manga-frame',
      }),
    ).toBe(1000);
  });

  it('recomputes T2 Manga bubble reveal on seek and freezes scheduling when paused', () => {
    const line = {
      text: '「前半」「後半」',
      startMs: 9000,
      endMs: 17000,
      segments: [
        {
          segmentId: 'segment-first',
          text: '「前半」',
          startMs: 9000,
          endMs: 12000,
        },
        {
          segmentId: 'segment-second',
          text: '「後半」',
          startMs: 14000,
          endMs: 17000,
        },
      ],
    };
    const base = snapshot({
      lyrics: {
        ...snapshot().lyrics,
        source: { language: 'ja' },
        lines: [line],
      },
    });
    const nowMs = Date.parse(base.generatedAt);
    const frameAt = (positionMs, status) =>
      selectLyricsOverlayFrame(
        {
          ...base,
          playback: { ...base.playback, positionMs, status },
        },
        { nowMs, templateId: 'manga-frame' },
      );

    expect(frameAt(15000, 'seeking').mangaBubbleTiming).toMatchObject([
      { state: 'revealed' },
      { state: 'revealed' },
    ]);
    expect(frameAt(10000, 'seeking').mangaBubbleTiming).toMatchObject([
      { state: 'revealed' },
      { state: 'upcoming' },
    ]);
    expect(frameAt(13000, 'paused').mangaBubbleTiming).toMatchObject([
      { state: 'revealed' },
      { state: 'upcoming' },
    ]);
    expect(
      nextPresentationBoundaryDelayMs(
        {
          ...base,
          playback: {
            ...base.playback,
            positionMs: 13000,
            status: 'paused',
          },
        },
        { nowMs, templateId: 'manga-frame' },
      ),
    ).toBeNull();
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

  it('estimates T1 word timing from line duration and visible character weight', () => {
    const line = { text: 'I love music', startMs: 0, endMs: 10000 };
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 3000 },
      lyrics: {
        ...snapshot().lyrics,
        activeLineIndex: 0,
        source: { language: 'en' },
        lines: [line],
      },
    });
    const nowMs = Date.parse(value.generatedAt);
    const frame = selectLyricsFrame(value, {
      nowMs,
    });

    expect(frame).toMatchObject({
      currentText: 'I love music',
      currentTimingSource: 'line-estimate',
      currentSegments: [
        {
          text: 'I ',
          state: 'past',
          progress: 1,
          remainingMs: null,
        },
        {
          text: 'love ',
          state: 'active',
          progress: 0.5,
          remainingMs: 2000,
        },
        {
          text: 'music',
          state: 'upcoming',
          progress: 0,
          remainingMs: null,
        },
      ],
    });
    expect(nextLyricsBoundaryDelayMs(value, { nowMs })).toBe(2000);
    expect(line).not.toHaveProperty('segments');
    const ktvFrame = selectLyricsOverlayFrame(value, { nowMs }).ktv;
    expect(ktvFrame).toMatchObject({
      currentTimingSource: 'line-estimate',
    });
    expect(ktvFrame.currentSegments).toHaveLength(frame.currentSegments.length);
    frame.currentSegments.forEach((segment, index) => {
      expect(ktvFrame.currentSegments[index]).toMatchObject({
        text: segment.text,
        state: segment.state,
        progress: segment.progress,
        remainingMs: segment.remainingMs,
      });
    });
    expect(
      selectLyricsFrame(
        {
          ...value,
          playback: { ...value.playback, status: 'paused' },
        },
        { nowMs: nowMs + 5000 },
      ).currentSegments[1],
    ).toMatchObject({
      state: 'active',
      progress: 0.5,
      remainingMs: null,
    });
  });

  it('uses estimated word timing when partial T2 reaches a T1 line', () => {
    const lines = [
      {
        text: 'timed segments',
        startMs: 0,
        endMs: 4000,
        segments: [
          {
            segmentId: 'segment-1',
            text: 'timed ',
            startMs: 0,
            endMs: 2000,
          },
          {
            segmentId: 'segment-2',
            text: 'segments',
            startMs: 2000,
            endMs: 4000,
          },
        ],
      },
      { text: 'line fallback', startMs: 4000, endMs: 8000 },
    ];
    const segmented = snapshot({
      playback: { ...snapshot().playback, positionMs: 1000 },
      lyrics: { ...snapshot().lyrics, activeLineIndex: 0, lines },
    });
    const fallback = {
      ...segmented,
      playback: { ...segmented.playback, positionMs: 5500 },
      lyrics: { ...segmented.lyrics, activeLineIndex: 1 },
    };

    expect(
      selectLyricsFrame(segmented, {
        nowMs: Date.parse(segmented.generatedAt),
      }),
    ).toMatchObject({
      currentText: 'timed segments',
      currentTimingSource: 't2',
      currentSegments: [
        expect.objectContaining({
          segmentId: 'segment-1',
          state: 'active',
        }),
        expect.objectContaining({
          segmentId: 'segment-2',
          state: 'upcoming',
        }),
      ],
    });
    const fallbackFrame = selectLyricsFrame(fallback, {
      nowMs: Date.parse(fallback.generatedAt),
    });
    expect(fallbackFrame).toMatchObject({
      currentText: 'line fallback',
      currentTimingSource: 'line-estimate',
      currentSegments: [
        expect.objectContaining({ text: 'line ', state: 'past' }),
        expect.objectContaining({ text: 'fallback', state: 'active' }),
      ],
    });
    expect(fallbackFrame).not.toHaveProperty('lineRemainingMs');
  });

  it('estimates unspaced CJK timing per visible character', () => {
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 1500 },
      lyrics: {
        ...snapshot().lyrics,
        activeLineIndex: 0,
        source: { language: 'zh-Hant' },
        lines: [{ text: '你 好嗎！', startMs: 0, endMs: 3000 }],
      },
    });
    const nowMs = Date.parse(value.generatedAt);

    expect(selectLyricsFrame(value, { nowMs })).toMatchObject({
      currentTimingSource: 'line-estimate',
      currentSegments: [
        expect.objectContaining({ text: '你 ', state: 'past' }),
        expect.objectContaining({
          text: '好',
          state: 'active',
          progress: 0.5,
          remainingMs: 500,
        }),
        expect.objectContaining({ text: '嗎！', state: 'upcoming' }),
      ],
    });
    expect(nextLyricsBoundaryDelayMs(value, { nowMs })).toBe(500);
  });

  it.each([
    {
      label: 'Japanese graphemes',
      language: 'ja',
      sourceText: '歌になる',
      expectedText: ['歌', 'に', 'な', 'る'],
      positionMs: 1500,
      activeIndex: 1,
    },
    {
      label: 'Korean words',
      language: 'ko',
      sourceText: '나의 노래',
      expectedText: ['나의 ', '노래'],
      positionMs: 1000,
      activeIndex: 0,
    },
  ])(
    'keeps $label deterministic while preserving exact text',
    ({ language, sourceText, expectedText, positionMs, activeIndex }) => {
      const value = snapshot({
        playback: { ...snapshot().playback, positionMs },
        lyrics: {
          ...snapshot().lyrics,
          activeLineIndex: 0,
          source: { language },
          lines: [{ text: sourceText, startMs: 0, endMs: 4000 }],
        },
      });
      const frame = selectLyricsFrame(value, {
        nowMs: Date.parse(value.generatedAt),
      });

      expect(frame.currentSegments.map((segment) => segment.text)).toEqual(
        expectedText,
      );
      expect(
        frame.currentSegments.map((segment) => segment.text).join(''),
      ).toBe(sourceText);
      expect(frame.currentSegments[activeIndex]).toMatchObject({
        state: 'active',
        progress: 0.5,
      });
    },
  );

  it('does not estimate word timing without a finite T1 interval', () => {
    const value = snapshot({
      playback: {
        ...snapshot().playback,
        positionMs: 1000,
        durationMs: null,
      },
      lyrics: {
        ...snapshot().lyrics,
        activeLineIndex: 0,
        lines: [{ text: 'open line', startMs: 0, endMs: null }],
      },
    });
    const frame = selectLyricsFrame(value, {
      nowMs: Date.parse(value.generatedAt),
    });

    expect(frame.currentText).toBe('open line');
    expect(frame).not.toHaveProperty('currentTimingSource');
    expect(frame).not.toHaveProperty('currentSegments');
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

  it('selects the current music beat with bounded reads from a large grid', () => {
    let indexedBeatReads = 0;
    const beatValues = Array.from({ length: 130000 }, (_, index) => ({
      timeMs: index + 1,
      confidence: 0.9,
    }));
    const beats = new Proxy(beatValues, {
      get(target, property, receiver) {
        if (/^\d+$/.test(String(property))) indexedBeatReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const value = snapshot({
      playback: { ...snapshot().playback, positionMs: 12000 },
      musicStructure: {
        documentId: 'music-large-projection',
        trackId: 'track-1',
        sourceRevision: 'source-1',
        sourceDurationMs: 180000,
        level: 'M1',
        tempo: null,
        beats,
        sections: [],
      },
    });

    expect(
      selectMusicStructureFrame(value, {
        nowMs: Date.parse(value.generatedAt),
      }).currentBeat,
    ).toMatchObject({ beatIndex: 11999, timeMs: 12000 });
    expect(indexedBeatReads).toBeLessThan(40);
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
      current: { title: '海螺記', artist: '163braces' },
      history: [{ title: 'Intro', artist: 'Singer' }],
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

  it.each(['buffering', 'seeking', 'ended', 'error'])(
    'preserves the %s transport phase for Artwork choreography',
    (status) => {
      expect(
        selectArtworkFrame(
          snapshot({
            playback: {
              status,
              positionMs: 32000,
              durationMs: 180000,
              rate: 1,
              track: {
                id: 'track-1',
                title: '海螺記',
                artist: '163braces',
              },
            },
          }),
        ).playbackStatus,
      ).toBe(status);
    },
  );

  it('projects only the current song and recent completed history in playback order', () => {
    const value = snapshot({
      queue: {
        sourceName: 'Tonight',
        items: [
          ...Array.from({ length: 10 }, (_, index) => ({
            state: 'played',
            track: {
              id: `played-${index}`,
              title: `Played ${index + 1}`,
              artist: 'Singer',
            },
          })),
          {
            state: 'current',
            track: { id: 'current', title: 'Current', artist: 'Singer' },
          },
          {
            state: 'queued',
            track: { id: 'queued', title: 'Upcoming', artist: 'Singer' },
          },
        ],
      },
    });

    expect(selectSetlistFrame(value)).toMatchObject({
      current: { title: 'Current', artist: 'Singer' },
      history: [
        { title: 'Played 3', artist: 'Singer' },
        { title: 'Played 4', artist: 'Singer' },
        { title: 'Played 5', artist: 'Singer' },
        { title: 'Played 6', artist: 'Singer' },
        { title: 'Played 7', artist: 'Singer' },
        { title: 'Played 8', artist: 'Singer' },
        { title: 'Played 9', artist: 'Singer' },
        { title: 'Played 10', artist: 'Singer' },
      ],
    });
    expect(JSON.stringify(selectSetlistFrame(value))).not.toContain('Upcoming');
  });

  it('does not expose a queued-only Setlist and keeps completed history visible', () => {
    const queuedOnly = snapshot({
      queue: {
        sourceName: 'Tonight',
        items: [
          {
            state: 'queued',
            track: { id: 'queued', title: 'Upcoming', artist: 'Singer' },
          },
        ],
      },
    });
    expect(selectSetlistFrame(queuedOnly)).toMatchObject({
      visible: false,
      current: null,
      history: [],
    });

    const historyOnly = snapshot({
      queue: {
        sourceName: 'Tonight',
        items: [
          {
            state: 'played',
            track: { id: 'played', title: 'Completed', artist: 'Singer' },
          },
        ],
      },
    });
    expect(selectSetlistFrame(historyOnly)).toMatchObject({
      visible: true,
      current: null,
      history: [{ title: 'Completed', artist: 'Singer' }],
    });
  });
});
