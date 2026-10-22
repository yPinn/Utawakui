import { describe, expect, it, vi } from 'vitest';
import {
  paintLyricsFineUnit,
  cancelLyricsFinePaint,
} from './lyricsFinePaint.mjs';

function node() {
  return {
    style: { setProperty: vi.fn() },
    animate: vi.fn(() => ({ cancel: vi.fn() })),
  };
}
const unit = { unitId: 'u', startMs: 1000, endMs: 2000 };
describe('fine text paint clock', () => {
  it('starts at the current media position and uses remaining wall time, including commit cost', () => {
    const el = node();
    paintLyricsFineUnit(
      el,
      unit,
      { positionMs: 1250, sampledAtMs: 10000, rate: 2, playing: true },
      { nowMs: 10025 },
    );
    expect(el.style.setProperty).toHaveBeenCalledWith(
      '--lyrics-fine-progress',
      '30%',
    );
    expect(el.animate).toHaveBeenCalledWith(
      [
        { '--lyrics-fine-progress': '30%' },
        { '--lyrics-fine-progress': '100%' },
      ],
      { delay: 0, duration: 350, easing: 'linear', fill: 'forwards' },
    );
  });
  it('freezes on pause, relocates on backward seek, and cancels obsolete animations', () => {
    const el = node();
    paintLyricsFineUnit(el, unit, { positionMs: 1500, rate: 1, playing: true });
    const animation = el.animate.mock.results[0].value;
    paintLyricsFineUnit(el, unit, {
      positionMs: 1600,
      rate: 1,
      playing: false,
    });
    expect(animation.cancel).toHaveBeenCalledOnce();
    expect(el.style.setProperty).toHaveBeenLastCalledWith(
      '--lyrics-fine-progress',
      '60%',
    );
    paintLyricsFineUnit(el, unit, { positionMs: 1100, rate: 1, playing: true });
    expect(el.style.setProperty).toHaveBeenLastCalledWith(
      '--lyrics-fine-progress',
      '10%',
    );
    cancelLyricsFinePaint(el);
    expect(el.animate.mock.results[1].value.cancel).toHaveBeenCalledOnce();
  });
  it('schedules future units without delaying the onset cue, and reduced motion has a static current state', () => {
    const el = node();
    paintLyricsFineUnit(el, unit, { positionMs: 500, rate: 2, playing: true });
    expect(el.animate.mock.calls[0][1]).toMatchObject({
      delay: 250,
      duration: 500,
    });
    paintLyricsFineUnit(
      el,
      unit,
      { positionMs: 1500, rate: 1, playing: true },
      { reducedMotion: true },
    );
    expect(el.animate).toHaveBeenCalledOnce();
    expect(el.style.setProperty).toHaveBeenLastCalledWith(
      '--lyrics-fine-progress',
      '50%',
    );
    cancelLyricsFinePaint(el);
  });
  it('does not animate completed, invalid or absent intervals', () => {
    const el = node();
    for (const u of [unit, null, { ...unit, endMs: 0 }])
      paintLyricsFineUnit(el, u, { positionMs: 2200, rate: 1, playing: true });
    expect(el.animate).not.toHaveBeenCalled();
  });
  it('honors an intentional Output clock hold and subtracts commit cost across its end', () => {
    const el = node();
    const clock = {
      positionMs: 1000,
      sampledAtMs: 10000,
      advanceAtMs: 10200,
      rate: 1,
      playing: true,
    };
    const next = { startMs: 1100, endMs: 1300 };
    paintLyricsFineUnit(el, next, clock, { nowMs: 10050 });
    expect(el.animate.mock.calls[0][1]).toMatchObject({
      delay: 250,
      duration: 200,
    });
    paintLyricsFineUnit(el, next, clock, { nowMs: 10350 });
    expect(el.style.setProperty).toHaveBeenLastCalledWith(
      '--lyrics-fine-progress',
      '25%',
    );
    expect(el.animate.mock.calls[1][1]).toMatchObject({
      delay: 0,
      duration: 150,
    });
  });
});
