import { describe, expect, it } from 'vitest';
import {
  selectLyricsOverlayFrame,
  nextPresentationBoundaryDelayMs,
} from './state.mjs';

const first = '把所有回憶都留在今晚，',
  second = 'we will find our way back home';
const nowMs = Date.parse('2026-10-20T00:00:00Z');
function snapshot() {
  return {
    revision: 1,
    generatedAt: new Date(nowMs).toISOString(),
    displayDelayMs: 0,
    playback: {
      track: { id: 'song' },
      status: 'playing',
      positionMs: 2000,
      sampledAt: new Date(nowMs).toISOString(),
      rate: 1,
      durationMs: 15000,
    },
    lyrics: {
      trackId: 'song',
      synced: true,
      offsetMs: 0,
      activeLineIndex: 0,
      source: { language: 'zh' },
      lines: [
        {
          text: first + second,
          startMs: 1000,
          endMs: 12000,
          segments: [
            { segmentId: 'a', text: first, startMs: 1200, endMs: 5500 },
            { segmentId: 'b', text: second, startMs: 6000, endMs: 11000 },
          ],
        },
      ],
    },
    queue: { items: [] },
  };
}
const frame = (value) =>
  selectLyricsOverlayFrame(value, { nowMs, templateId: 'kinetic-pop' });
describe('timed mixed long phrases in Kinetic Pop', () => {
  it('switches two whole phrases exactly at the mapped onset and supports backward seek', () => {
    const value = snapshot(),
      original = structuredClone(value);
    expect(frame(value).kineticPop).toMatchObject({
      displayText: first,
      phraseTimingSource: 't2',
    });
    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs,
        templateId: 'kinetic-pop',
      }),
    ).toBe(4000);
    value.playback.positionMs = 5999;
    expect(frame(value).kineticPop.displayText).toBe(first);
    value.playback.positionMs = 6000;
    expect(frame(value).kineticPop.displayText).toBe(second);
    value.playback.positionMs = 2000;
    expect(frame(value).kineticPop.displayText).toBe(first);
    expect(value).toEqual(original);
  });
  it('keeps the entire T1 or coarse T2 line instead of guessing a word-weighted switch', () => {
    const value = snapshot();
    delete value.lyrics.lines[0].segments;
    value.playback.positionMs = 9000;
    expect(frame(value).kineticPop.displayText).toBe(first + second);
    value.lyrics.lines[0].segments = [
      {
        segmentId: 'coarse',
        text: first + second,
        startMs: 1000,
        endMs: 12000,
      },
    ];
    expect(frame(value).kineticPop.displayText).toBe(first + second);
  });
  it('uses applied T1+ onset but preserves source T2 priority and stops splitting when disabled', () => {
    const value = snapshot(),
      line = value.lyrics.lines[0];
    line.estimatedStarts = {
      version: 1,
      segments: line.segments.map((s) => ({
        segmentId: s.segmentId,
        text: s.text,
        startMs: s.startMs,
      })),
    };
    line.estimatedStarts.segments[1].startMs = 7000;
    value.playback.positionMs = 6500;
    expect(frame(value).kineticPop.displayText).toBe(second);
    delete line.segments;
    expect(frame(value).kineticPop).toMatchObject({
      displayText: first,
      phraseTimingSource: 'model-starts',
    });
    value.playback.positionMs = 7000;
    expect(frame(value).kineticPop.displayText).toBe(second);
    delete line.estimatedStarts;
    expect(frame(value).kineticPop.displayText).toBe(first + second);
  });
  it('follows offset and playback rate through the existing clock without retiming the source', () => {
    const value = snapshot();
    value.lyrics.offsetMs = 1000;
    value.playback.rate = 2;
    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs,
        templateId: 'kinetic-pop',
      }),
    ).toBe(1500);
    value.playback.positionMs = 5000;
    expect(frame(value).kineticPop.displayText).toBe(second);
    value.playback.status = 'paused';
    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs,
        templateId: 'kinetic-pop',
      }),
    ).toBeNull();
  });
});
