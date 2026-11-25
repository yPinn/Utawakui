import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('gsap', () => ({
  gsap: {
    registerPlugin: vi.fn(),
    matchMedia: vi.fn(),
    fromTo: vi.fn(),
    quickTo: vi.fn(),
    utils: {
      toArray: (elements) => elements,
      clamp: (min, max, value) => Math.min(max, Math.max(min, value)),
    },
  },
}));

vi.mock('gsap/CustomEase', () => ({ CustomEase: {} }));
vi.mock('gsap/ScrollTrigger', () => ({
  ScrollTrigger: { batch: vi.fn(), update: vi.fn() },
}));

let motion;

beforeAll(async () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', { body: {} });
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }));
  try {
    motion = await import('./motion.js');
  } finally {
    vi.unstubAllGlobals();
  }
});

afterEach(() => vi.clearAllMocks());

it('passes the ancestor viewport element to each scoped animation setup', () => {
  const viewport = {};
  const section = { closest: vi.fn(() => viewport) };
  const setup = vi.fn();
  const add = vi.fn((_query, initialize) => initialize());
  const revert = vi.fn();
  motion.gsap.matchMedia.mockReturnValue({ add, revert });

  const cleanup = motion.useSectionMotion(section, setup);

  expect(motion.gsap.matchMedia).toHaveBeenCalledWith(section);
  expect(add).toHaveBeenCalledWith(motion.MEDIA.full, expect.any(Function));
  expect(setup).toHaveBeenCalledWith(viewport);
  cleanup();
  expect(revert).toHaveBeenCalledOnce();
});

it('keeps reveal targets visible until their shared scroller triggers entry', () => {
  const viewport = {};
  const targets = [{}];
  motion.reveal(viewport, targets, { autoAlpha: 1, y: 16 });

  const [batch, trigger] = motion.ScrollTrigger.batch.mock.calls[0];
  expect(batch).toEqual(targets);
  expect(trigger).toMatchObject({ scroller: viewport, once: true });
  expect(motion.gsap.fromTo).not.toHaveBeenCalled();

  trigger.onEnter(targets);
  expect(motion.gsap.fromTo).toHaveBeenCalledWith(
    targets,
    { autoAlpha: 1, y: 16 },
    expect.objectContaining({ autoAlpha: 1, y: 0 }),
  );
});

describe('site wheel scrolling', () => {
  function setupWheel() {
    const root = new EventTarget();
    const viewport = { scrollTop: 100, scrollHeight: 1000, clientHeight: 400 };
    const glide = Object.assign(vi.fn(), { tween: { pause: vi.fn() } });
    motion.gsap.quickTo.mockReturnValue(glide);
    let cleanup;
    motion.gsap.matchMedia.mockReturnValue({
      add: (_query, initialize) => (cleanup = initialize()),
      revert: () => cleanup(),
    });
    vi.stubGlobal('window', new EventTarget());
    const stop = motion.useWheelScroll(root, viewport);
    const [position, , { onUpdate }] = motion.gsap.quickTo.mock.calls[0];
    function wheel(deltaY, options = {}) {
      const event = new Event('wheel', { cancelable: true });
      Object.assign(event, { deltaX: 0, deltaY, deltaMode: 0, ...options });
      root.dispatchEvent(event);
      return event.defaultPrevented;
    }
    return { root, viewport, glide, position, onUpdate, stop, wheel };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('accumulates wheel ticks and reverses from the rendered scroll position', () => {
    const { viewport, glide, position, onUpdate, stop, wheel } = setupWheel();
    expect(wheel(80)).toBe(true);
    expect(glide).toHaveBeenLastCalledWith(180, 100);
    position.top = 130;
    onUpdate();
    expect(viewport.scrollTop).toBe(130);
    expect(motion.ScrollTrigger.update).toHaveBeenCalledOnce();
    expect(wheel(80)).toBe(true);
    expect(glide).toHaveBeenLastCalledWith(260, 130);
    expect(wheel(-80)).toBe(true);
    expect(glide).toHaveBeenLastCalledWith(50, 130);
    stop();
    expect(wheel(80)).toBe(false);
  });

  it('lets scrollbar, keyboard and modified input take over', () => {
    const { root, viewport, glide, position, onUpdate, stop, wheel } =
      setupWheel();
    expect(wheel(900)).toBe(true);
    expect(glide).toHaveBeenLastCalledWith(600, 100);
    root.dispatchEvent(new Event('pointerdown'));
    expect(glide.tween.pause).toHaveBeenCalledOnce();
    viewport.scrollTop = 250;
    expect(wheel(80)).toBe(true);
    expect(glide).toHaveBeenLastCalledWith(330, 250);
    window.dispatchEvent(new Event('keydown'));
    expect(glide.tween.pause).toHaveBeenCalledTimes(2);
    expect(wheel(80, { ctrlKey: true })).toBe(false);
    expect(wheel(20, { deltaX: 90 })).toBe(false);
    expect(wheel(80)).toBe(true);
    viewport.scrollTop = 400;
    position.top = 290;
    onUpdate();
    expect(viewport.scrollTop).toBe(400);
    stop();
  });
});
