import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReceiptMotionController } from './receiptMotion.mjs';

function frame(count, extra = {}) {
  return {
    visible: true,
    sourceName: 'Session',
    completedCount: count,
    history: Array.from({ length: count }, (_, i) => ({
      ordinal: i + 1,
      trackId: `track-${i}`,
      title: `Song ${i}`,
    })),
    ...extra,
  };
}
function harness() {
  const positions = [];
  const kills = [];
  const gsap = {
    set: vi.fn((_node, vars) => positions.push(vars.y)),
    to: vi.fn((_node, vars) => {
      positions.push(vars.y);
      vars.onComplete?.();
      return { kill: () => kills.push(true) };
    }),
    killTweensOf: vi.fn(),
  };
  const controller = createReceiptMotionController({
    gsap,
    list: {},
    onPhase: vi.fn(),
    measure: () => ({ rowHeight: 96, capacity: 5 }),
    render: vi.fn(),
  });
  return { controller, gsap, positions, kills };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('receipt printing and timed history review', () => {
  it('rests on latest, reviews only overflow, then returns to latest', () => {
    const { controller, positions } = harness();
    controller.update(frame(13));
    expect(positions.at(-1)).toBe(0);
    vi.advanceTimersByTime(60000);
    expect(positions.at(-1)).toBe(-480);
    vi.advanceTimersByTime(6000);
    expect(positions.at(-1)).toBe(-768);
    vi.advanceTimersByTime(6000);
    expect(positions.at(-1)).toBe(0);
    controller.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a review for a new completion and resets the interval', () => {
    const { controller, positions } = harness();
    controller.update(frame(8));
    vi.advanceTimersByTime(60000);
    expect(positions.at(-1)).toBe(-288);
    controller.update(frame(9));
    expect(positions.slice(-2)).toEqual([-96, 0]);
    vi.advanceTimersByTime(59999);
    expect(positions.at(-1)).toBe(0);
    vi.advanceTimersByTime(1);
    expect(positions.at(-1)).toBe(-384);
    controller.destroy();
  });

  it('does not restart the timer for playback-only snapshots', () => {
    const { controller, positions } = harness();
    controller.update(frame(8));
    vi.advanceTimersByTime(40000);
    controller.update(frame(8, { revision: 999, current: { title: 'Next' } }));
    vi.advanceTimersByTime(20000);
    expect(positions.at(-1)).toBe(-288);
    controller.destroy();
  });

  it('keeps upward latest at the bottom and disables review when requested', () => {
    const { controller, positions } = harness();
    controller.configure({ receiptDirection: 'up', receiptReview: 'off' });
    controller.update(frame(8));
    expect(positions.at(-1)).toBe(-288);
    controller.update(frame(9));
    expect(positions.slice(-2)).toEqual([-288, -384]);
    vi.advanceTimersByTime(180000);
    expect(positions.at(-1)).toBe(-384);
    controller.destroy();
  });

  it('settles recovery and reduced motion without printing and clears all work when inactive', () => {
    const { controller, gsap } = harness();
    controller.update(frame(8));
    controller.setReducedMotion(true);
    controller.update(frame(9));
    expect(gsap.to).not.toHaveBeenCalled();
    controller.suspend();
    expect(vi.getTimerCount()).toBe(0);
    controller.update(frame(10));
    controller.resume();
    controller.update(frame(11), { settle: true });
    expect(gsap.to).not.toHaveBeenCalled();
    controller.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('has no review timer for fitting content or after disposal', () => {
    const { controller } = harness();
    controller.update(frame(2));
    expect(vi.getTimerCount()).toBe(0);
    controller.destroy();
    controller.update(frame(8));
    controller.resume();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('limits a long review to three pages and resumes older history next time', () => {
    const { controller, positions } = harness();
    controller.update(frame(40));
    vi.advanceTimersByTime(60000);
    expect(positions.at(-1)).toBe(-480);
    vi.advanceTimersByTime(12000);
    expect(positions.at(-1)).toBe(-1440);
    vi.advanceTimersByTime(6000);
    expect(positions.at(-1)).toBe(0);
    vi.advanceTimersByTime(60000);
    expect(positions.at(-1)).toBe(-1920);
    controller.destroy();
  });

  it('cancels the old review schedule when direction or interval changes', () => {
    const { controller, positions } = harness();
    controller.update(frame(13));
    vi.advanceTimersByTime(59000);
    controller.configure({
      receiptDirection: 'up',
      receiptReviewInterval: 30,
    });
    expect(positions.at(-1)).toBe(-768);
    vi.advanceTimersByTime(1000);
    expect(positions.at(-1)).toBe(-768);
    vi.advanceTimersByTime(29000);
    expect(positions.at(-1)).toBe(-288);
    controller.configure({ receiptReview: 'off' });
    expect(positions.at(-1)).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    controller.destroy();
  });
});
