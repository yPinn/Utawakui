import { describe, expect, it } from 'vitest';
import {
  nextLyricsBoundaryDelayMs,
  selectLyricsFrame,
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
    });
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

  it('keeps plain T1 output when the active line has no segments', () => {
    const value = snapshot();
    const frame = selectLyricsFrame(value, {
      nowMs: Date.parse(value.generatedAt),
    });

    expect(frame.currentText).toBe('潮聲沿著夜色靠岸');
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
      expect(nextLyricsBoundaryDelayMs(value)).toBeNull();
    }
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
