import { describe, expect, it } from 'vitest';
import {
  FISHEYE_FRAME_MS,
  fisheyeLyricsColumns,
  fisheyeLyricsPose,
  fisheyeLetterScale,
  resolveFisheyeExit,
  resolveFisheyeLayout,
} from './fisheyeLyrics.mjs';
import {
  nextPresentationBoundaryDelayMs,
  selectLyricsOverlayFrame,
} from './state.mjs';

describe('Fisheye Lens lyrics', () => {
  it('uses the section only when the exit follows song sections', () => {
    expect(resolveFisheyeExit(undefined, 'base')).toBe('arc');
    expect(resolveFisheyeExit('auto', 'chorus')).toBe('swirl');
    for (const exit of ['arc', 'scale', 'swirl', 'cut']) {
      expect(resolveFisheyeExit(exit, 'chorus')).toBe(exit);
    }
  });
  it('selects the close layout in a detected chorus or when explicitly chosen', () => {
    expect(resolveFisheyeLayout(undefined, 'base')).toBe('standard');
    expect(resolveFisheyeLayout('auto', 'chorus')).toBe('close');
    expect(resolveFisheyeLayout('standard', 'chorus')).toBe('standard');
    expect(resolveFisheyeLayout('close', 'base')).toBe('close');
  });

  it('preserves words and graphemes, and fits unbounded lines into two columns', () => {
    expect(fisheyeLyricsColumns('看這裡')).toEqual({
      right: ['看', '這', '裡'],
      left: [],
    });
    expect(fisheyeLyricsColumns('まだ灯る streetlights')).toEqual({
      right: ['ま', 'だ', '灯'],
      left: ['る', 'streetlights'],
    });
    expect(fisheyeLyricsColumns('風吹過🌬️')).toEqual({
      right: ['風', '吹'],
      left: ['過', '🌬️'],
    });
    const long = fisheyeLyricsColumns('字'.repeat(30));
    expect(long.right).toHaveLength(10);
    expect(long.left).toHaveLength(10);
    expect(long.left.at(-1)).toBe('…');
  });

  it('fits the arc to the line clock and skips transitions for short or static cues', () => {
    const frame = (age, duration = 24, animate = true) =>
      fisheyeLyricsPose({
        ageMs: age * FISHEYE_FRAME_MS + 0.001,
        durationMs: duration * FISHEYE_FRAME_MS,
        animate,
      });
    expect(frame(0).orbit?.face).toBeCloseTo(0.22);
    expect(frame(3).orbit).toBeNull();
    expect(frame(19).orbit?.turn).toBeCloseTo(0.24);
    expect(frame(21).orbit?.turn).toBeCloseTo(1.16);
    expect(frame(22).visible).toBe(false);
    expect(frame(0, 7)).toMatchObject({ visible: true, orbit: null });
    expect(frame(22, 24, false)).toMatchObject({ visible: true, orbit: null });
  });

  it('projects the actual active line, current position, offset and interlude', () => {
    const nowMs = Date.parse('2026-11-13T00:00:00Z');
    const snapshot = {
      generatedAt: new Date(nowMs).toISOString(),
      playback: {
        track: { id: 'song' },
        status: 'playing',
        positionMs: 1100,
        rate: 2,
        durationMs: 5000,
      },
      lyrics: {
        trackId: 'song',
        synced: true,
        offsetMs: 100,
        lines: [
          { text: '實際歌詞', startMs: 1000, endMs: 2200 },
          { text: '下一句', startMs: 3000, endMs: 4500 },
        ],
      },
    };
    const frame = () =>
      selectLyricsOverlayFrame(snapshot, { nowMs, templateId: 'fisheye-lens' });
    expect(frame()).toMatchObject({
      currentText: '實際歌詞',
      fisheyeStage: true,
      fisheyeReflectionClock: { positionMs: 1100, rate: 2, playing: true },
      fisheyeTiming: { playing: true, ageMs: 100, durationMs: 600 },
    });
    snapshot.playback.positionMs = 2350;
    expect(frame()).toMatchObject({
      visible: false,
      fisheyeStage: true,
      fisheyeReflectionClock: { positionMs: 2350, rate: 2, playing: true },
    });
    snapshot.playback.status = 'paused';
    expect(frame().fisheyeReflectionClock).toEqual({
      positionMs: 2350,
      rate: 2,
      playing: false,
    });
    snapshot.playback.positionMs = 3100;
    snapshot.playback.status = 'seeking';
    expect(frame()).toMatchObject({
      currentText: '下一句',
      timelineDiscontinuity: true,
      fisheyeTiming: { playing: false },
    });
    snapshot.playback.track.id = 'other';
    expect(frame()).not.toHaveProperty('fisheyeStage');
  });

  it('chooses the entrance and exit independently and limits blur to a moving arc', () => {
    const pose = (frame, settings) =>
      fisheyeLyricsPose({
        ageMs: (frame + 0.01) * FISHEYE_FRAME_MS,
        durationMs: 24 * FISHEYE_FRAME_MS,
        animate: true,
        ...settings,
      });
    const scale = pose(0, { enter: 'scale', exit: 'swirl' }).scaleTransition;
    expect(fisheyeLetterScale(0, 1, scale)).toBe(0);
    expect(fisheyeLetterScale(3, 1, scale)).toBeGreaterThan(0);
    expect(pose(20, { enter: 'scale', exit: 'swirl' }).swirl.width).toBe(1.09);
    expect(pose(23, { exit: 'swirl' }).swirl.width).toBe(0.66);
    expect(pose(0, { enter: 'smoke' })).toMatchObject({
      visible: false,
      smoke: true,
    });
    expect(pose(2, { enter: 'smoke' })).toMatchObject({
      visible: true,
      particles: 1,
    });
    expect(pose(1, { blur: true }).orbit.trail).toBeGreaterThan(0);
    expect(pose(1).orbit).not.toHaveProperty('trail');
    expect(pose(22, { enter: 'cut', exit: 'cut' })).toMatchObject({
      visible: true,
      orbit: null,
    });
    expect(pose(0, { enter: 'swirl', animate: false })).not.toHaveProperty(
      'swirl',
    );
  });

  it('uses source timing for segment gaps and punctuation phrases and falls back to the complete line', () => {
    const nowMs = Date.parse('2026-11-13T00:00:00Z');
    const line = {
      text: '看著窗外，聽見你說話',
      startMs: 1000,
      endMs: 3800,
      segments: [
        { segmentId: 'a', text: '看著', startMs: 1000, endMs: 1450 },
        { segmentId: 'b', text: '窗外，', startMs: 1600, endMs: 2200 },
        { segmentId: 'c', text: '聽見', startMs: 2400, endMs: 3000 },
        { segmentId: 'd', text: '你說話', startMs: 3100, endMs: 3800 },
      ],
    };
    const snapshot = (positionMs, lines = [line]) => ({
      generatedAt: new Date(nowMs).toISOString(),
      playback: {
        track: { id: 'song' },
        status: 'playing',
        rate: 2,
        positionMs,
        durationMs: 6000,
      },
      lyrics: { trackId: 'song', synced: true, offsetMs: 100, lines },
    });
    const options = (fisheyeGranularity) => ({
      nowMs,
      templateId: 'fisheye-lens',
      fisheyeGranularity,
    });
    expect(
      selectLyricsOverlayFrame(snapshot(1150), options('segment')),
    ).toMatchObject({
      currentText: '看著',
      fisheyeTiming: { ageMs: 125, durationMs: 225 },
    });
    expect(
      selectLyricsOverlayFrame(snapshot(1400), options('segment')),
    ).toMatchObject({ visible: false, fisheyeStage: true });
    expect(
      nextPresentationBoundaryDelayMs(snapshot(1400), options('segment')),
    ).toBe(50);
    expect(
      nextPresentationBoundaryDelayMs(snapshot(2100), options('phrase')),
    ).toBe(100);
    expect(
      selectLyricsOverlayFrame(snapshot(2300), options('phrase')),
    ).toMatchObject({
      currentText: '聽見你說話',
      fisheyeTiming: { ageMs: 0, durationMs: 700 },
    });
    expect(
      selectLyricsOverlayFrame(snapshot(2300), options('line')).currentText,
    ).toBe(line.text);
    for (const mode of ['phrase', 'segment']) {
      expect(
        selectLyricsOverlayFrame(
          snapshot(2300, [{ ...line, segments: [] }]),
          options(mode),
        ).currentText,
      ).toBe(line.text);
    }
  });
});
