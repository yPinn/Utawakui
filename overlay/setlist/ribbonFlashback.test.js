import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRibbonFlashback } from './ribbonFlashback.mjs';

function element() {
  return {
    dataset: {},
    style: {},
    children: [],
    setAttribute() {},
    append(child) {
      this.children.push(child);
    },
  };
}

function setup(prepare = vi.fn(() => 8)) {
  vi.useFakeTimers();
  const root = { ...element(), ownerDocument: { createElement: element } };
  const latest = element();
  const archive = element();
  const motion = createRibbonFlashback({ root, latest, archive, prepare });
  const wash = root.children[0];
  const durations = {
    enter: { cover: [240, 330], reveal: [220, 310] },
    return: { cover: [120, 150], reveal: [140, 170] },
  };
  wash.children.forEach((half, index) => {
    half.children[0].getAnimations = () => [
      {
        finished: new Promise((resolve) => {
          setTimeout(
            resolve,
            durations[wash.dataset.direction][wash.dataset.step][index],
          );
        }),
      },
    ];
  });
  return { motion, root, latest, archive, wash, prepare };
}

const advance = (ms) => vi.advanceTimersByTimeAsync(ms);
afterEach(() => vi.useRealTimers());

describe('Ribbon Setlist flashback', () => {
  it('switches each half while covered, holds the archive for 3 seconds and returns in 320 ms', async () => {
    const { motion, root, latest, archive, wash, prepare } = setup();
    motion.reset({ enabled: true, interval: 15000 });
    await advance(14999);
    expect(prepare).not.toHaveBeenCalled();
    await advance(241);
    expect(root.dataset.flashbackPage).toBe('top-archive');
    await advance(400);
    expect(root.dataset.flashbackPage).toBe('archive');
    expect(latest.inert).toBe(true);
    expect(archive.inert).toBe(false);
    expect(wash.dataset.step).toBeUndefined();
    await advance(2999);
    expect(wash.dataset.direction).toBeUndefined();
    await advance(121);
    expect(root.dataset.flashbackPage).toBe('top-latest');
    await advance(200);
    expect(root.dataset.flashbackPage).toBe('latest');
    expect(latest.inert).toBe(false);
    expect(archive.inert).toBe(true);
    expect(wash.dataset.step).toBeUndefined();
  });

  it('ignores pending work when playback changes mid-wipe or the view is disabled', async () => {
    const { motion, root, wash, prepare } = setup();
    motion.reset({ enabled: true, interval: 15000 });
    await advance(15240);
    expect(root.dataset.flashbackPage).toBe('top-archive');
    motion.reset({ enabled: true, interval: 15000 });
    await advance(14999);
    expect(root.dataset.flashbackPage).toBe('latest');
    expect(wash.dataset.step).toBeUndefined();
    expect(prepare).toHaveBeenCalledTimes(1);
    motion.reset();
    await advance(30000);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('restarts with the new interval and stops a visible review when turned off', async () => {
    const { motion, root, wash, prepare } = setup();
    motion.reset({ enabled: true, interval: 15000 });
    await advance(2000);
    motion.reset({ enabled: true, interval: 5000 });
    await advance(4999);
    expect(prepare).not.toHaveBeenCalled();
    await advance(641);
    expect(root.dataset.flashbackPage).toBe('archive');
    await advance(2999);
    expect(wash.dataset.step).toBeUndefined();
    await advance(321);
    expect(root.dataset.flashbackPage).toBe('latest');
    await advance(5640);
    expect(root.dataset.flashbackPage).toBe('archive');
    motion.reset();
    expect(root.dataset.flashbackPage).toBe('latest');
    await advance(60000);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(wash.dataset.step).toBeUndefined();
  });

  it('pages backwards and wraps without animation when motion is reduced', async () => {
    const prepare = vi.fn((before) =>
      before == null ? 8 : before === 8 ? 1 : null,
    );
    const { motion, root, wash } = setup(prepare);
    motion.reset({ enabled: true, reduced: true, interval: 15000 });
    await advance(15000);
    expect(root.dataset.flashbackPage).toBe('archive');
    expect(wash.dataset.step).toBeUndefined();
    await advance(3000);
    expect(root.dataset.flashbackPage).toBe('latest');
    await advance(15000 + 3000 + 15000);
    expect(prepare.mock.calls).toEqual([[undefined], [8], [1], []]);
    expect(root.dataset.flashbackPage).toBe('archive');
  });
});
