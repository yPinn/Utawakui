import { describe, expect, it } from 'vitest';
import {
  adaptLiveStageLyricsPresentation,
  analyzeLyricsSource,
} from './lyricsPresentation.mjs';
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
