import { describe, expect, it } from 'vitest';
import {
  selectLyricsOverlayFrame,
  nextLyricsBoundaryDelayMs,
  nextPresentationBoundaryDelayMs,
} from './state.mjs';

function snapshot() {
  return {
    revision: 1,
    generatedAt: '2026-10-20T00:00:00Z',
    displayDelayMs: 0,
    playback: {
      track: { id: 'song' },
      status: 'playing',
      positionMs: 2000,
      sampledAt: '2026-10-20T00:00:00Z',
      playbackRate: 1,
      durationMs: 10000,
    },
    lyrics: {
      trackId: 'song',
      synced: true,
      offsetMs: 0,
      activeLineIndex: 0,
      source: { language: 'zh' },
      lines: [
        {
          text: '今天唱歌',
          startMs: 1000,
          endMs: 5000,
          estimatedStarts: {
            version: 1,
            segments: [
              { segmentId: 'a', text: '今天', startMs: 1200 },
              { segmentId: 'b', text: '唱歌', startMs: 3200 },
            ],
          },
        },
        { text: '今天唱歌', startMs: 6000, endMs: 9000 },
      ],
    },
    queue: { items: [] },
  };
}
const nowMs = Date.parse('2026-10-20T00:00:00Z');
describe('T1+ in existing T2 template presentation', () => {
  it('uses immediate onset highlights without guessing continuous progress or sung ends', () => {
    const value = snapshot();
    const before = structuredClone(value);
    const frame = selectLyricsOverlayFrame(value, {
      nowMs,
      templateId: 'focus-line',
    });
    expect(frame.currentTimingSource).toBe('model-starts');
    expect(frame.currentSegments).toEqual([
      {
        segmentId: 'a',
        text: '今天',
        state: 'active',
        progress: null,
        remainingMs: null,
      },
      {
        segmentId: 'b',
        text: '唱歌',
        state: 'upcoming',
        progress: 0,
        remainingMs: null,
      },
    ]);
    expect(nextLyricsBoundaryDelayMs(value, { nowMs })).toBe(1200);
    expect(value).toEqual(before);
  });
  it('keeps native T2 authoritative, and repeated T1 occurrences do not inherit model starts', () => {
    const value = snapshot();
    value.lyrics.lines[0].segments = [
      { segmentId: 'native', text: '今天唱歌', startMs: 1000, endMs: 5000 },
    ];
    expect(
      selectLyricsOverlayFrame(value, { nowMs, templateId: 'focus-line' })
        .currentTimingSource,
    ).toBe('t2');
    value.playback.positionMs = 6500;
    expect(
      selectLyricsOverlayFrame(value, { nowMs, templateId: 'focus-line' })
        .currentTimingSource,
    ).toBe('line-estimate');
  });
  it('uses the karaoke-stack segment styling path without estimating continuous progress', () => {
    const frame = selectLyricsOverlayFrame(snapshot(), {
      nowMs,
      templateId: 'karaoke-stack',
    });
    expect(frame.ktv.currentTimingSource).toBe('model-starts');
    expect(frame.ktv.currentSegments.map((s) => s.remainingMs)).toEqual([
      null,
      null,
    ]);
    expect(frame.ktv.currentSegments[0].progress).toBeNull();
  });
  it('uses model phrase onsets for the existing Kinetic Pop layout and scheduler', () => {
    const value = snapshot();
    value.lyrics.source.language = 'en';
    value.lyrics.lines = [
      {
        text: 'first second',
        startMs: 1000,
        endMs: 5000,
        estimatedStarts: {
          version: 1,
          segments: [
            { segmentId: 'a', text: 'first ', startMs: 1200 },
            { segmentId: 'b', text: 'second', startMs: 3200 },
          ],
        },
      },
    ];
    expect(
      selectLyricsOverlayFrame(value, { nowMs, templateId: 'kinetic-pop' })
        .kineticPop,
    ).toMatchObject({
      displayText: 'first',
      phraseTimingSource: 'model-starts',
    });
    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs,
        templateId: 'kinetic-pop',
      }),
    ).toBe(1200);
    value.playback.positionMs = 3500;
    expect(
      selectLyricsOverlayFrame(value, { nowMs, templateId: 'kinetic-pop' })
        .kineticPop.displayText,
    ).toBe('second');
  });
  it('keeps pause, rate and offset on the existing single clock', () => {
    const value = snapshot();
    value.playback.rate = 2;
    value.lyrics.offsetMs = -500;
    expect(nextLyricsBoundaryDelayMs(value, { nowMs })).toBe(850);
    value.playback.status = 'paused';
    expect(nextLyricsBoundaryDelayMs(value, { nowMs })).toBeNull();
    expect(
      selectLyricsOverlayFrame(value, { nowMs, templateId: 'focus-line' })
        .currentSegments[0].progress,
    ).toBeNull();
  });
});
