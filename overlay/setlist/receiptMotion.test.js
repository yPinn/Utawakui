import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReceiptMotionController } from './receiptMotion.mjs';
import { receiptPageLayout } from '../../shared/presentation/receiptSetlist.mjs';

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
function harness(
  measure = () => ({ rowHeight: 96, capacity: 5 }),
  { autoComplete = true } = {},
) {
  const positions = [];
  const viewportHeights = [];
  const render = vi.fn();
  const kills = [];
  const gsap = {
    set: vi.fn((_node, vars) => positions.push(vars.y)),
    to: vi.fn((_node, vars) => {
      positions.push(vars.y);
      if (autoComplete) vars.onComplete?.();
      return { kill: () => kills.push(true) };
    }),
    killTweensOf: vi.fn(),
  };
  const controller = createReceiptMotionController({
    gsap,
    list: {},
    onPhase: vi.fn(),
    measure,
    setViewportHeight: (height) => viewportHeights.push(height),
    render,
  });
  return { controller, gsap, positions, kills, viewportHeights, render };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('receipt printing and timed history review', () => {
  it('rests on latest, reviews only overflow, then returns to latest', () => {
    const { controller, positions, gsap } = harness();
    controller.update(frame(13));
    expect(positions.at(-1)).toBe(0);
    vi.advanceTimersByTime(15000);
    expect(positions.at(-1)).toBe(-768);
    expect(gsap.to.mock.calls.at(-1)[1].ease).toBe('none');
    vi.advanceTimersByTime(1000);
    expect(positions.at(-1)).toBe(0);
    controller.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a review for a new completion and resets the interval', () => {
    const { controller, positions } = harness();
    controller.update(frame(8));
    vi.advanceTimersByTime(15000);
    expect(positions.at(-1)).toBe(-288);
    controller.update(frame(9));
    expect(positions.slice(-2)).toEqual([-96, 0]);
    vi.advanceTimersByTime(14999);
    expect(positions.at(-1)).toBe(0);
    vi.advanceTimersByTime(1);
    expect(positions.at(-1)).toBe(-384);
    controller.destroy();
  });

  it('does not restart the timer for playback-only snapshots', () => {
    const { controller, positions } = harness();
    controller.update(frame(8));
    vi.advanceTimersByTime(10000);
    controller.update(frame(8, { revision: 999, current: { title: 'Next' } }));
    vi.advanceTimersByTime(5000);
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

  it('reviews a continuous range and targets older history on the next cycle', () => {
    const { controller, positions } = harness();
    controller.update(frame(40));
    vi.advanceTimersByTime(15000);
    expect(positions.at(-1)).toBe(-1440);
    vi.advanceTimersByTime(1000);
    expect(positions.at(-1)).toBe(0);
    vi.advanceTimersByTime(15000);
    expect(positions.at(-1)).toBe(-2880);
    controller.destroy();
  });

  it.each(['down', 'up'])(
    'animates the reverse path back to latest for %s feed',
    (direction) => {
      const { controller, gsap } = harness();
      controller.configure({ receiptDirection: direction });
      controller.update(frame(18));
      gsap.to.mockClear();
      vi.advanceTimersByTime(16000);
      expect(gsap.to.mock.calls.map(([, vars]) => vars.y)).toEqual(
        direction === 'down' ? [-1248, 0] : [0, -1248],
      );
      controller.destroy();
    },
  );

  it('ignores a return callback after a new completion takes priority', () => {
    const { controller, gsap, positions } = harness(undefined, {
      autoComplete: false,
    });
    controller.update(frame(13));
    vi.advanceTimersByTime(15000);
    gsap.to.mock.calls.at(-1)[1].onComplete();
    vi.advanceTimersByTime(1000);
    const obsoleteReturn = gsap.to.mock.calls.at(-1)[1];
    expect(obsoleteReturn.y).toBe(0);
    controller.update(frame(14));
    const before = [...positions];
    obsoleteReturn.onComplete();
    expect(positions).toEqual(before);
    expect(vi.getTimerCount()).toBe(1);
    controller.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('scrolls the existing list in a fixed viewport and waits for each tween before reversing', () => {
    const { controller, gsap, viewportHeights, render } = harness(undefined, {
      autoComplete: false,
    });
    controller.update(frame(13));
    gsap.set.mockClear();
    vi.advanceTimersByTime(15000);
    expect(render).toHaveBeenCalledTimes(1);
    expect(gsap.set).not.toHaveBeenCalled();
    expect(viewportHeights).toEqual([480]);
    expect(vi.getTimerCount()).toBe(0);
    const outbound = gsap.to.mock.calls[0][1];
    expect(outbound).toMatchObject({ y: -768, ease: 'none' });
    outbound.onComplete();
    vi.advanceTimersByTime(999);
    expect(gsap.to).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    const inbound = gsap.to.mock.calls[1][1];
    expect(inbound).toMatchObject({
      y: 0,
      duration: outbound.duration,
      ease: 'none',
    });
    expect(viewportHeights).toEqual([480]);
    expect(render).toHaveBeenCalledTimes(1);
    inbound.onComplete();
    expect(vi.getTimerCount()).toBe(1);
    controller.destroy();
  });

  it.each(['suspend', 'destroy', 'reduce'])(
    'cancels a pending return callback on %s',
    (mode) => {
      const { controller, gsap, positions } = harness(undefined, {
        autoComplete: false,
      });
      controller.update(frame(13));
      vi.advanceTimersByTime(15000);
      gsap.to.mock.calls.at(-1)[1].onComplete();
      vi.advanceTimersByTime(1000);
      const stale = gsap.to.mock.calls.at(-1)[1].onComplete;
      if (mode === 'reduce') controller.setReducedMotion(true);
      else controller[mode]();
      const before = [...positions];
      const timers = vi.getTimerCount();
      stale();
      expect(positions).toEqual(before);
      expect(vi.getTimerCount()).toBe(timers);
      controller.destroy();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('cancels the old review schedule when direction or interval changes', () => {
    const { controller, positions } = harness();
    controller.update(frame(13));
    vi.advanceTimersByTime(14000);
    controller.configure({
      receiptDirection: 'up',
      receiptReviewInterval: 5,
    });
    expect(positions.at(-1)).toBe(-768);
    vi.advanceTimersByTime(1000);
    expect(positions.at(-1)).toBe(-768);
    vi.advanceTimersByTime(4000);
    expect(positions.at(-1)).toBe(0);
    controller.configure({ receiptReview: 'off' });
    expect(positions.at(-1)).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    controller.destroy();
  });

  it('uses measured row heights for compact pages and single-item feed in both directions', () => {
    let heights = [70, 96, 70];
    let direction = 'down';
    const { controller, positions, viewportHeights } = harness(() => ({
      pages: receiptPageLayout(heights, 240, direction),
      totalHeight: heights.reduce((sum, height) => sum + height, 0),
      feedHeight: direction === 'up' ? heights.at(-1) : heights[0],
    }));
    controller.update(frame(3));
    expect(viewportHeights.at(-1)).toBe(236);
    expect(vi.getTimerCount()).toBe(0);
    heights = [70, ...heights];
    controller.update(frame(4));
    expect(positions.slice(-2)).toEqual([-70, 0]);
    vi.advanceTimersByTime(15000);
    expect(positions.at(-1)).toBe(-70);
    expect(viewportHeights.at(-1)).toBe(236);
    direction = 'up';
    controller.configure({ receiptDirection: direction });
    expect(positions.at(-1)).toBe(-70);
    expect(viewportHeights.at(-1)).toBe(236);
    heights.push(96);
    controller.update(frame(5));
    expect(positions.slice(-2)).toEqual([-140, -236]);
    expect(viewportHeights.at(-1)).toBe(166);
    controller.destroy();
  });
});
