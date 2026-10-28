import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
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
let Marquee, TextButton, Overflow, body, observers, frames, sequence;
attachClientRender(Surface, './tooltip/UiTooltipSurface.vue', import.meta.url);
beforeAll(async () => {
  TextButton = (await import('./UiTextButton.vue')).default;
  attachClientRender(TextButton, './UiTextButton.vue', import.meta.url);
  Overflow = (await import('./UiOverflowTooltip.vue')).default;
  attachClientRender(Overflow, './UiOverflowTooltip.vue', import.meta.url);
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
    // Marquee hints exist only while motion is reduced.
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
const has = (node, name) =>
  String(node.props.class ?? '')
    .split(' ')
    .includes(name);
const tips = () => findAll(body, (n) => n.props.role === 'tooltip');
function specimen(props) {
  const m = mount(TextButton, props),
    button = findAll(m.root, (n) => n.type === 'button')[0];
  const text = () =>
    findAll(
      button,
      (n) =>
        n.type === 'span' &&
        (has(n, 'ui-marquee') || has(n, 'ui-text-btn__text')),
    )[0];
  return { ...m, button, text };
}
function size(m, width = 80, natural = 220) {
  const r = m.text();
  r.clientWidth = width;
  r.clientHeight = 20;
  r.scrollWidth = natural;
  r.scrollHeight = 20;
  const inner = r.children.find((n) => n.type === 'span');
  if (inner) inner.scrollWidth = natural;
  observers.forEach((o) => o.cb());
}
describe('UiTextButton overflow integration', () => {
  it('server-renders bounded static text and its visible accessible-name fallback', async () => {
    const html = await renderToString(
      createSSRApp(TextButton, { text: '曲目名稱', overflow: 'clamp' }),
    );
    expect(html).toContain('ui-text-btn__text--clamp');
    expect(html).toContain('曲目名稱');
    expect(html).not.toContain('aria-label=');
    const empty = await renderToString(createSSRApp(TextButton));
    expect(empty).toContain('ui-marquee');
  });
  it.each(['marquee', 'ellipsis', 'clamp'])(
    '%s connects keyboard hints and descriptions to the actual button through updates',
    async (overflow) => {
      const props = reactive({
        text: '原始長內容',
        overflow,
        'aria-describedby': 'caller-help',
      });
      const m = specimen(props);
      size(m);
      await flush();
      trigger(m.button, 'onFocusin', {
        target: m.button,
        currentTarget: m.button,
      });
      await nextTick();
      expect(tips()).toHaveLength(1);
      expect(m.button.props['aria-describedby']).toContain(tips()[0].props.id);
      expect(m.button.props['aria-describedby']).toContain('caller-help');
      props.text = '另一份長內容';
      await nextTick();
      size(m);
      await flush();
      expect(textContent(tips()[0])).toBe(props.text);
      size(m, 300);
      await flush();
      expect(tips()).toHaveLength(0);
      expect(m.button.props['aria-describedby']).toBe('caller-help');
      size(m);
      await flush();
      expect(tips()).toHaveLength(1);
      trigger(m.button, 'onKeydown', {
        key: 'Escape',
        stopPropagation: vi.fn(),
      });
      await vi.advanceTimersByTimeAsync(600);
      expect(tips()).toHaveLength(0);
      m.app.unmount();
    },
  );
  it.each(['marquee', 'ellipsis', 'clamp'])(
    '%s hover/focus ownership and disabled recovery',
    async (overflow) => {
      const props = reactive({
        text: '足夠長的文字內容',
        overflow,
        disabled: false,
      });
      const m = specimen(props);
      size(m);
      await flush();
      trigger(m.text(), 'onPointerenter', {
        currentTarget: m.text(),
        pointerType: 'mouse',
      });
      await vi.advanceTimersByTimeAsync(500);
      expect(tips()).toHaveLength(1);
      trigger(m.button, 'onFocusin', {
        target: m.button,
        currentTarget: m.button,
      });
      trigger(m.text(), 'onPointerleave');
      await vi.advanceTimersByTimeAsync(120);
      expect(tips()).toHaveLength(1);
      props.disabled = true;
      await nextTick();
      await nextTick();
      expect(tips()).toHaveLength(0);
      expect(m.button.props['aria-describedby'] ?? undefined).toBeUndefined();
      props.disabled = false;
      await nextTick();
      await nextTick();
      trigger(m.button, 'onFocusin', {
        target: m.button,
        currentTarget: m.button,
      });
      await nextTick();
      expect(tips()).toHaveLength(1);
      m.app.unmount();
    },
  );
  it.each([true, 'true'])(
    'blocks aria-disabled=%s activation and preserves caller keyboard handlers',
    (value) => {
      const click = vi.fn(),
        keydown = vi.fn(),
        m = specimen({
          text: '操作',
          'aria-disabled': value,
          onClick: click,
          onKeydown: keydown,
        });
      const event = {
        type: 'click',
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
        stopPropagation: vi.fn(),
      };
      trigger(m.button, 'onClickCapture', event);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      trigger(m.button, 'onClick', event);
      expect(click).not.toHaveBeenCalled();
      const key = {
        type: 'keydown',
        key: 'Enter',
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };
      trigger(m.button, 'onKeydownCapture', key);
      expect(key.preventDefault).toHaveBeenCalledOnce();
      trigger(m.button, 'onKeydown', { key: 'ArrowDown' });
      expect(keydown).toHaveBeenCalledOnce();
      m.app.unmount();
    },
  );
  it('preserves native click.stop, accessible name, numeric zero and mode replacement cleanup', async () => {
    const click = vi.fn(),
      props = reactive({
        text: 0,
        onClick: click,
        ariaLabel: '前往專輯',
        overflow: 'marquee',
      }),
      m = specimen(props);
    expect(textContent(m.button)).toBe('0');
    expect(m.button.props['aria-label']).toBe('前往專輯');
    const e = { stopPropagation: vi.fn() };
    trigger(m.button, 'onClick', e);
    expect(click).toHaveBeenCalledWith(e);
    expect(e.stopPropagation).toHaveBeenCalledOnce();
    props.overflow = 'clamp';
    await nextTick();
    expect(observers[0].disconnect).toHaveBeenCalled();
    size(m);
    await flush();
    trigger(m.button, 'onFocusin', { target: m.button });
    await nextTick();
    expect(tips()).toHaveLength(1);
    m.app.unmount();
  });
});
