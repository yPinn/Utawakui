import { nextTick, reactive } from 'vue';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import Surface from './tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';
let Marquee, body, observers, frames, sequence;
attachClientRender(Surface, './tooltip/UiTooltipSurface.vue', import.meta.url);
beforeAll(async () => {
  Marquee = (await import('./UiMarqueeText.vue')).default;
  attachClientRender(Marquee, './UiMarqueeText.vue', import.meta.url);
});
beforeEach(() => {
  vi.useFakeTimers();
  body = hostNode('body');
  observers = [];
  frames = new Map();
  sequence = 0;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb) => {
      frames.set(++sequence, cb);
      return sequence;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id) => frames.delete(id)),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb) {
        this.cb = cb;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        observers.push(this);
      }
    },
  );
  vi.stubGlobal('document', {
    body,
    // Hints exist only while motion is reduced; tests opt out per case.
    documentElement: Object.assign(hostNode('html'), {
      dataset: { uiMotion: 'reduced' },
    }),
    querySelector: (s) => (s === 'body' ? body : null),
  });
  const computedStyle = (e) => ({
    paddingRight: e.paddingRight ?? '0px',
    fontSize: '16px',
    direction: 'ltr',
    getPropertyValue: () => '',
  });
  vi.stubGlobal('getComputedStyle', computedStyle);
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getComputedStyle: computedStyle,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const flush = async () => {
  await nextTick();
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((cb) => cb());
  await nextTick();
};
function specimen(props = { text: '非常長的曲目名稱', tabindex: 0 }) {
  const m = mount(Marquee, props),
    root = findAll(m.root, (n) => n.type === 'span')[0];
  root.clientWidth = 100;
  root.clientHeight = 20;
  const text = () => root.children.find((n) => n.type === 'span');
  text().scrollWidth = 180;
  return { ...m, root, text };
}
const overflow = (root) =>
  String(root.props.class).includes('ui-marquee--overflow');
const tips = () => findAll(body, (n) => n.props.role === 'tooltip');
describe('UiMarqueeText measured overflow lifecycle', () => {
  it('keeps the one-pixel rounding tolerance and empty content silent', async () => {
    const m = specimen({ text: '' });
    m.text().scrollWidth = 101;
    await flush();
    expect(overflow(m.root)).toBe(false);
    m.text().scrollWidth = 102;
    observers[0].cb();
    await flush();
    expect(overflow(m.root)).toBe(true);
    trigger(m.root, 'onFocusin', { currentTarget: m.root });
    await nextTick();
    expect(tips()).toHaveLength(0);
    m.app.unmount();
  });
  it('opens after resize while hovered without a new enter and closes after pointer exit', async () => {
    const m = specimen();
    m.text().scrollWidth = 90;
    await flush();
    trigger(m.root, 'onPointerenter', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(550);
    expect(tips()).toHaveLength(0);
    m.text().scrollWidth = 180;
    observers[0].cb();
    await flush();
    await vi.advanceTimersByTimeAsync(500);
    expect(tips()).toHaveLength(1);
    trigger(m.root, 'onPointerleave');
    await vi.advanceTimersByTimeAsync(100);
    expect(tips()).toHaveLength(0);
    m.app.unmount();
  });
  it('stays silent for fit text and hidden zero-size roots, then recovers', async () => {
    const m = specimen();
    m.root.clientWidth = 0;
    m.root.clientHeight = 0;
    await flush();
    expect(overflow(m.root)).toBe(false);
    m.root.clientWidth = 100;
    m.root.clientHeight = 20;
    observers[0].cb();
    await flush();
    expect(overflow(m.root)).toBe(true);
    m.text().scrollWidth = 100;
    observers[0].cb();
    await flush();
    expect(overflow(m.root)).toBe(false);
    expect(m.root.props.style['--ui-marquee-distance']).toBe('0px');
    m.app.unmount();
  });
  it('uses actual rendered padding, including reduced motion with no trailing padding', async () => {
    const m = specimen();
    await flush();
    m.text().scrollWidth = 110;
    m.text().paddingRight = '0px';
    observers[0].cb();
    await flush();
    expect(overflow(m.root)).toBe(true);
    expect(m.root.props.style['--ui-marquee-distance']).toBe('10px');
    m.text().paddingRight = '24px';
    m.text().scrollWidth = 134;
    observers[0].cb();
    await flush();
    expect(m.root.props.style['--ui-marquee-distance']).toBe('10px');
    m.app.unmount();
  });
  it('keeps distance stable across repeated padded measurements and width recovery', async () => {
    const m = specimen();
    await flush();
    m.text().paddingRight = '16px';
    m.text().scrollWidth = 196;
    for (let i = 0; i < 3; i++) {
      observers[0].cb();
      await flush();
      expect(m.root.props.style['--ui-marquee-distance']).toBe('80px');
    }
    m.root.clientWidth = 200;
    observers[0].cb();
    await flush();
    expect(overflow(m.root)).toBe(false);
    m.text().paddingRight = '0px';
    m.text().scrollWidth = 180;
    m.root.clientWidth = 100;
    observers[0].cb();
    await flush();
    expect(overflow(m.root)).toBe(true);
    m.app.unmount();
  });
  it('maintains focus/hover hints across content updates and fit/overflow recovery', async () => {
    const props = reactive({ text: '原始長內容', tabindex: 0 });
    const m = specimen(props);
    await flush();
    trigger(m.root, 'onFocusin', { currentTarget: m.root });
    await nextTick();
    expect(tips()).toHaveLength(1);
    const previous = m.text();
    props.text = '換成另一份長內容';
    await nextTick();
    m.text().scrollWidth = 180;
    await flush();
    expect(m.text() === previous).toBe(false);
    expect(textContent(tips()[0])).toBe(props.text);
    trigger(m.root, 'onPointerenter', { pointerType: 'mouse' });
    trigger(m.root, 'onPointerleave');
    await vi.advanceTimersByTimeAsync(150);
    expect(tips()).toHaveLength(1);
    props.text = '短';
    await nextTick();
    m.text().scrollWidth = 30;
    await flush();
    expect(tips()).toHaveLength(0);
    expect(m.root.props['aria-describedby'] ?? undefined).toBeUndefined();
    props.text = '重新溢位的內容';
    await nextTick();
    m.text().scrollWidth = 180;
    await flush();
    expect(tips()).toHaveLength(1);
    trigger(m.root, 'onKeydown', { key: 'Escape', stopPropagation: vi.fn() });
    await vi.advanceTimersByTimeAsync(600);
    expect(tips()).toHaveLength(0);
    m.app.unmount();
  });
  it('stays silent while the marquee moves, so long and short titles match', async () => {
    document.documentElement.dataset.uiMotion = undefined;
    const m = specimen();
    await flush();
    expect(overflow(m.root)).toBe(true);
    trigger(m.root, 'onPointerenter', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(1000);
    trigger(m.root, 'onFocusin', { currentTarget: m.root });
    await nextTick();
    expect(tips()).toHaveLength(0);
    expect(m.root.props['aria-describedby'] ?? undefined).toBeUndefined();
    m.app.unmount();
  });
  it('follows the OS reduced-motion preference as well as the root flag', async () => {
    document.documentElement.dataset.uiMotion = undefined;
    window.matchMedia = vi.fn((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
    }));
    const m = specimen();
    await flush();
    trigger(m.root, 'onPointerenter', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(500);
    expect(textContent(tips()[0])).toBe('非常長的曲目名稱');
    m.app.unmount();
  });
  it('delays pointer hints, ignores touch, supports numeric zero and tooltip opt-out', async () => {
    const props = reactive({ text: 0, tooltipEnabled: true });
    const m = specimen(props);
    await flush();
    trigger(m.root, 'onPointerenter', { pointerType: 'touch' });
    await vi.advanceTimersByTimeAsync(550);
    expect(tips()).toHaveLength(0);
    trigger(m.root, 'onPointerenter', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(499);
    expect(tips()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(textContent(tips()[0])).toBe('0');
    props.tooltipEnabled = false;
    await nextTick();
    expect(tips()).toHaveLength(0);
    expect(overflow(m.root)).toBe(true);
    m.app.unmount();
  });
  it('refreshes on fonts ready but schedules no work after unmount', async () => {
    let ready;
    document.fonts = { ready: new Promise((resolve) => (ready = resolve)) };
    const m = specimen();
    m.text().scrollWidth = 90;
    await flush();
    ready();
    await Promise.resolve();
    m.text().scrollWidth = 180;
    await flush();
    expect(overflow(m.root)).toBe(true);
    m.app.unmount();
    expect(frames.size).toBe(0);
    expect(observers[0].disconnect).toHaveBeenCalled();
    let late;
    document.fonts = { ready: new Promise((resolve) => (late = resolve)) };
    const n = specimen();
    n.app.unmount();
    const calls = requestAnimationFrame.mock.calls.length;
    late();
    await Promise.resolve();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(calls);
  });
  it('coalesces resize frames and removes fallback listeners', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const m = specimen();
    await flush();
    const resize = window.addEventListener.mock.calls.find(
      ([name]) => name === 'resize',
    )?.[1];
    expect(resize).toBeTypeOf('function');
    resize();
    resize();
    expect(frames.size).toBe(1);
    m.app.unmount();
    expect(frames.size).toBe(0);
    expect(window.removeEventListener).toHaveBeenCalledWith('resize', resize);
  });
});
