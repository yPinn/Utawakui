import { describe, expect, it, vi } from 'vitest';
import {
  createSetlistCurrentMotionController,
  createSetlistHistoryMotionController,
  setlistHistoryPageOffsets,
} from './setlistMotion.mjs';

function gsapHarness() {
  const timelines = [];
  const gsap = {
    killTweensOf: vi.fn(),
    set: vi.fn(),
    fromTo: vi.fn(() => ({ kill: vi.fn(), pause: vi.fn(), play: vi.fn() })),
    timeline: vi.fn((options = {}) => {
      const callbacks = [];
      const timeline = {
        call: vi.fn(function call(callback, _params, position) {
          callbacks.push({ callback, position });
          return this;
        }),
        fromTo: vi.fn(function fromTo() {
          return this;
        }),
        kill: vi.fn(),
        pause: vi.fn(),
        play: vi.fn(),
        set: vi.fn(function set() {
          return this;
        }),
        to: vi.fn(function to() {
          return this;
        }),
        complete() {
          options.onComplete?.();
        },
        runCalls() {
          for (const { callback } of callbacks) callback();
        },
      };
      timelines.push(timeline);
      return timeline;
    }),
  };
  return { gsap, timelines };
}

function frame(trackId, overrides = {}) {
  return {
    revision: 1,
    visible: true,
    sourceName: 'Tonight',
    current: trackId
      ? { trackId, title: `Song ${trackId}`, artist: 'Singer' }
      : null,
    history: [],
    ...overrides,
  };
}

function historyScene() {
  const listRect = { top: 20 };
  const list = {
    children: Array.from({ length: 10 }, (_, index) => ({
      getBoundingClientRect: () => ({ top: 20 + index * 64 }),
    })),
    getBoundingClientRect: () => listRect,
    scrollHeight: 640,
  };
  return {
    list,
    root: { dataset: {} },
    viewport: { clientHeight: 200 },
  };
}

describe('Setlist GSAP motion', () => {
  it('calculates row-aligned history pages without skipping content', () => {
    expect(
      setlistHistoryPageOffsets({
        contentHeight: 640,
        viewportHeight: 200,
        rowOffsets: [0, 64, 128, 192, 256, 320, 384, 448, 512, 576],
      }),
    ).toEqual([0, 128, 256, 384, 440]);
  });

  it('keeps the first frame static, then sequences exit, commit, and entrance', () => {
    const current = {};
    const root = { dataset: {} };
    const commitFrame = vi.fn();
    const { gsap, timelines } = gsapHarness();
    const motion = createSetlistCurrentMotionController({
      commitFrame,
      current,
      gsap,
      root,
    });

    motion.update(frame('a'));
    expect(commitFrame).toHaveBeenCalledOnce();
    expect(timelines).toHaveLength(0);

    motion.update(frame('b'));
    expect(root.dataset.currentMotion).toBe('switching');
    expect(timelines).toHaveLength(1);
    expect(timelines[0].to).toHaveBeenCalledWith(
      current,
      {
        autoAlpha: 0,
        duration: 0.16,
        ease: 'power2.in',
        y: -6,
      },
      0,
    );
    expect(timelines[0].call).toHaveBeenCalledWith(
      expect.any(Function),
      null,
      0.16,
    );
    expect(timelines[0].fromTo).toHaveBeenCalledWith(
      current,
      { autoAlpha: 0, y: 8 },
      expect.objectContaining({
        autoAlpha: 1,
        duration: 0.26,
        ease: 'power3.out',
        immediateRender: false,
        y: 0,
      }),
      0.16,
    );

    timelines[0].runCalls();
    expect(commitFrame).toHaveBeenLastCalledWith(frame('b'));
  });

  it('interrupts an obsolete handoff and commits only the latest pending song', () => {
    const commitFrame = vi.fn();
    const { gsap, timelines } = gsapHarness();
    const motion = createSetlistCurrentMotionController({
      commitFrame,
      current: {},
      gsap,
      root: { dataset: {} },
    });

    motion.update(frame('a'));
    motion.update(frame('b'));
    motion.update(frame('c'));

    expect(timelines[0].kill).toHaveBeenCalledOnce();
    timelines[1].runCalls();
    expect(commitFrame).toHaveBeenCalledTimes(2);
    expect(commitFrame).toHaveBeenLastCalledWith(frame('c'));
  });

  it('keeps the newest same-song snapshot before and after the handoff point', () => {
    const commitFrame = vi.fn();
    const { gsap, timelines } = gsapHarness();
    const motion = createSetlistCurrentMotionController({
      commitFrame,
      current: {},
      gsap,
      root: { dataset: {} },
    });
    const pendingUpdate = frame('b', { revision: 2 });
    const presentedUpdate = frame('b', { revision: 3 });

    motion.update(frame('a'));
    motion.update(frame('b'));
    motion.update(pendingUpdate);
    timelines[0].runCalls();
    expect(commitFrame).toHaveBeenLastCalledWith(pendingUpdate);

    motion.update(presentedUpdate);
    expect(commitFrame).toHaveBeenLastCalledWith(presentedUpdate);
    expect(timelines).toHaveLength(1);
  });

  it('uses fade-only current handoff when reduced motion is requested', () => {
    const { gsap, timelines } = gsapHarness();
    const motion = createSetlistCurrentMotionController({
      commitFrame: vi.fn(),
      current: {},
      gsap,
      root: { dataset: {} },
    });

    motion.setReducedMotion(true);
    motion.update(frame('a'));
    motion.update(frame('b'));

    const exitVars = timelines[0].to.mock.calls[0][1];
    const [fromVars, toVars] = timelines[0].fromTo.mock.calls[0].slice(1, 3);
    expect(exitVars).not.toHaveProperty('y');
    expect(fromVars).not.toHaveProperty('y');
    expect(toVars).not.toHaveProperty('y');
  });

  it('cycles overflowing history by readable pages and fades before reset', () => {
    const elements = historyScene();
    const { gsap, timelines } = gsapHarness();
    const motion = createSetlistHistoryMotionController({
      ...elements,
      gsap,
    });

    motion.refresh();

    expect(elements.root.dataset.historyOverflow).toBe('true');
    expect(timelines).toHaveLength(1);
    expect(gsap.timeline).toHaveBeenCalledWith(
      expect.objectContaining({ repeat: -1 }),
    );
    expect(timelines[0].to).toHaveBeenCalledWith(
      elements.list,
      {
        duration: 0.45,
        ease: 'power2.inOut',
        y: -128,
      },
      '+=4',
    );
    expect(timelines[0].to).toHaveBeenCalledWith(
      elements.list,
      { autoAlpha: 0, duration: 0.16, ease: 'power1.in' },
      '+=4',
    );
    expect(timelines[0].set).toHaveBeenCalledWith(elements.list, { y: 0 }, '>');
  });

  it('reveals an advanced last row at the bottom before resuming the full cycle', () => {
    const elements = historyScene();
    const newestRow = elements.list.children.at(-1);
    const { gsap, timelines } = gsapHarness();
    const motion = createSetlistHistoryMotionController({
      ...elements,
      gsap,
    });

    motion.refresh({ revealLatest: true });

    expect(timelines[0].set).toHaveBeenCalledWith(
      elements.list,
      { autoAlpha: 1, y: -440 },
      0,
    );
    expect(timelines[0].fromTo).toHaveBeenCalledWith(
      newestRow,
      { autoAlpha: 0, x: -6 },
      expect.objectContaining({ autoAlpha: 1, duration: 0.28, x: 0 }),
      0,
    );
  });

  it('reveals only the new row when the complete history still fits', () => {
    const list = {
      children: Array.from({ length: 3 }, (_, index) => ({
        getBoundingClientRect: () => ({ top: 20 + index * 56 }),
      })),
      getBoundingClientRect: () => ({ top: 20 }),
      scrollHeight: 180,
    };
    const elements = {
      list,
      root: { dataset: {} },
      viewport: { clientHeight: 200 },
    };
    const newestRow = list.children.at(-1);
    const { gsap, timelines } = gsapHarness();
    const motion = createSetlistHistoryMotionController({
      ...elements,
      gsap,
    });

    motion.refresh({ revealLatest: true });

    expect(elements.root.dataset.historyOverflow).toBe('false');
    expect(timelines).toHaveLength(0);
    expect(gsap.fromTo).toHaveBeenCalledWith(
      newestRow,
      { autoAlpha: 0, x: -6 },
      expect.objectContaining({ autoAlpha: 1, duration: 0.28, x: 0 }),
    );

    const rowEntrance = gsap.fromTo.mock.results[0].value;
    motion.suspend();
    motion.resume();
    expect(rowEntrance.pause).toHaveBeenCalledOnce();
    expect(rowEntrance.play).toHaveBeenCalledOnce();
  });

  it('uses opacity tweening and hidden position changes for reduced history motion', () => {
    const elements = historyScene();
    const { gsap, timelines } = gsapHarness();
    const motion = createSetlistHistoryMotionController({
      ...elements,
      gsap,
    });

    motion.setReducedMotion(true);
    motion.refresh();

    expect(timelines[0].to.mock.calls.some(([, vars]) => 'y' in vars)).toBe(
      false,
    );
    expect(timelines[0].set.mock.calls.some(([, vars]) => 'y' in vars)).toBe(
      true,
    );

    motion.refresh({ force: true, revealLatest: true });
    const reducedReveal = timelines[1];
    expect(reducedReveal.set).toHaveBeenCalledWith(
      elements.list,
      { autoAlpha: 0, y: -440 },
      0,
    );
    const [, revealFrom, revealTo] = reducedReveal.fromTo.mock.calls[0];
    expect(revealFrom).not.toHaveProperty('x');
    expect(revealTo).not.toHaveProperty('x');
  });

  it('pauses hidden work, cleans up timelines, and degrades without GSAP', () => {
    const elements = historyScene();
    const { gsap, timelines } = gsapHarness();
    const motion = createSetlistHistoryMotionController({
      ...elements,
      gsap,
    });

    motion.refresh();
    motion.suspend();
    motion.resume();
    motion.destroy();

    expect(timelines[0].pause).toHaveBeenCalledOnce();
    expect(timelines[0].play).toHaveBeenCalledOnce();
    expect(timelines[0].kill).toHaveBeenCalledOnce();

    const staticMotion = createSetlistHistoryMotionController({
      ...historyScene(),
      gsap: null,
    });
    expect(() => staticMotion.refresh()).not.toThrow();
  });
});
