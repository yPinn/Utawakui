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
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';

let UiOverflowTooltip;
let body;
let resizeObservers;

attachClientRender(
  UiTooltipSurface,
  './tooltip/UiTooltipSurface.vue',
  import.meta.url,
);

beforeAll(async () => {
  UiOverflowTooltip = (await import('./UiOverflowTooltip.vue')).default;
  attachClientRender(
    UiOverflowTooltip,
    './UiOverflowTooltip.vue',
    import.meta.url,
  );
});

beforeEach(() => {
  vi.useFakeTimers();
  body = hostNode('body');
  resizeObservers = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn();
        this.unobserve = vi.fn();
        this.disconnect = vi.fn();
        resizeObservers.push(this);
      }
    },
  );
  vi.stubGlobal('document', {
    body,
    documentElement: hostNode('html'),
    querySelector: (selector) => (selector === 'body' ? body : null),
  });
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getComputedStyle: () => ({
      fontSize: '16px',
      direction: 'ltr',
      getPropertyValue: () => '',
    }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setOverflow(
  element,
  { clientWidth, scrollWidth, clientHeight = 20, scrollHeight = 20 },
) {
  element.clientWidth = clientWidth;
  element.scrollWidth = scrollWidth;
  element.clientHeight = clientHeight;
  element.scrollHeight = scrollHeight;
}

describe('UiOverflowTooltip', () => {
  it('supports a partial non-DOM window without resize listener methods', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    vi.stubGlobal('window', {});
    const mounted = mount(UiOverflowTooltip, { text: '完整文字' });
    expect(() => mounted.app.unmount()).not.toThrow();
  });
  it('does not treat a zero-sized hidden area as clipped text', async () => {
    const mounted = mount(UiOverflowTooltip, {
      text: '尚未配置寬度',
      tabindex: 0,
    });
    const root = findAll(mounted.root, (n) => n.type === 'span')[0];
    setOverflow(root, {
      clientWidth: 0,
      scrollWidth: 200,
      clientHeight: 0,
      scrollHeight: 20,
    });
    trigger(root, 'onFocusin', { currentTarget: root });
    await nextTick();
    expect(findAll(body, (n) => n.props.role === 'tooltip')).toHaveLength(0);
    expect(root.props['aria-describedby'] ?? undefined).toBeUndefined();
    mounted.app.unmount();
  });

  it('remeasures a focused root on resize, closes when it fits and reopens when clipped', async () => {
    const mounted = mount(UiOverflowTooltip, { text: '長文字', tabindex: 0 });
    const root = findAll(mounted.root, (n) => n.type === 'span')[0];
    setOverflow(root, { clientWidth: 50, scrollWidth: 200 });
    trigger(root, 'onFocusin', { currentTarget: root });
    await nextTick();
    expect(findAll(body, (n) => n.props.role === 'tooltip')).toHaveLength(1);
    expect(resizeObservers).toHaveLength(1);
    setOverflow(root, { clientWidth: 220, scrollWidth: 220 });
    resizeObservers[0].callback();
    await nextTick();
    expect(findAll(body, (n) => n.props.role === 'tooltip')).toHaveLength(0);
    expect(root.props['aria-describedby'] ?? undefined).toBeUndefined();
    setOverflow(root, { clientWidth: 50, scrollWidth: 200 });
    resizeObservers[0].callback();
    await nextTick();
    expect(findAll(body, (n) => n.props.role === 'tooltip')).toHaveLength(1);
    mounted.app.unmount();
    expect(resizeObservers[0].disconnect).toHaveBeenCalled();
  });

  it('updates live text after render without requiring a new hover or focus event', async () => {
    const props = reactive({ text: '原本很長的內容', tabindex: 0 });
    const mounted = mount(UiOverflowTooltip, props);
    const root = findAll(mounted.root, (n) => n.type === 'span')[0];
    setOverflow(root, { clientWidth: 50, scrollWidth: 200 });
    trigger(root, 'onFocusin', { currentTarget: root });
    await nextTick();
    props.text = '改成另一份長內容';
    await nextTick();
    expect(
      textContent(findAll(body, (n) => n.props.role === 'tooltip')[0]),
    ).toBe(props.text);
    setOverflow(root, { clientWidth: 50, scrollWidth: 50 });
    props.text = '短';
    await nextTick();
    await nextTick();
    expect(findAll(body, (n) => n.props.role === 'tooltip')).toHaveLength(0);
    mounted.app.unmount();
  });

  it('detects vertical clipping and preserves numeric zero as real content', async () => {
    const mounted = mount(UiOverflowTooltip, { text: 0, tabindex: 0 });
    const root = findAll(mounted.root, (n) => n.type === 'span')[0];
    setOverflow(root, {
      clientWidth: 80,
      scrollWidth: 80,
      clientHeight: 20,
      scrollHeight: 40,
    });
    trigger(root, 'onFocusin', { currentTarget: root });
    await nextTick();
    expect(
      textContent(findAll(body, (n) => n.props.role === 'tooltip')[0]),
    ).toBe('0');
    mounted.app.unmount();
  });

  it('refreshes after fonts settle while an initially fitting label remains hovered', async () => {
    let fontsReady;
    document.fonts = {
      ready: new Promise((resolve) => {
        fontsReady = resolve;
      }),
    };
    const mounted = mount(UiOverflowTooltip, { text: '字型載入後的長文字' });
    const root = findAll(mounted.root, (n) => n.type === 'span')[0];
    setOverflow(root, { clientWidth: 80, scrollWidth: 80 });
    trigger(root, 'onPointerenter', {
      currentTarget: root,
      pointerType: 'mouse',
    });
    setOverflow(root, { clientWidth: 80, scrollWidth: 240 });
    fontsReady();
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);
    expect(findAll(body, (n) => n.props.role === 'tooltip')).toHaveLength(1);
    mounted.app.unmount();
  });

  it('rebinds observation when the semantic root changes', async () => {
    const props = reactive({ as: 'h4', text: '標題' });
    const mounted = mount(UiOverflowTooltip, props);
    const heading = findAll(mounted.root, (n) => n.type === 'h4')[0];
    props.as = 'p';
    await nextTick();
    const paragraph = findAll(mounted.root, (n) => n.type === 'p')[0];
    expect(resizeObservers[0].unobserve).toHaveBeenCalledWith(heading);
    expect(resizeObservers[0].observe).toHaveBeenCalledWith(paragraph);
    mounted.app.unmount();
  });

  it('uses and removes the window resize fallback when ResizeObserver is unavailable', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const mounted = mount(UiOverflowTooltip, { text: '尺寸變化', tabindex: 0 });
    const root = findAll(mounted.root, (n) => n.type === 'span')[0];
    setOverflow(root, { clientWidth: 80, scrollWidth: 240 });
    trigger(root, 'onFocusin', { currentTarget: root });
    await nextTick();
    const resize = window.addEventListener.mock.calls.find(
      ([name]) => name === 'resize',
    )[1];
    setOverflow(root, { clientWidth: 80, scrollWidth: 80 });
    resize();
    await nextTick();
    expect(findAll(body, (n) => n.props.role === 'tooltip')).toHaveLength(0);
    mounted.app.unmount();
    expect(window.removeEventListener).toHaveBeenCalledWith('resize', resize);
  });

  it('does not publish a tooltip for empty text even with clipping geometry', async () => {
    const mounted = mount(UiOverflowTooltip, { text: '', tabindex: 0 });
    const root = findAll(mounted.root, (n) => n.type === 'span')[0];
    setOverflow(root, { clientWidth: 80, scrollWidth: 240 });
    trigger(root, 'onFocusin', { currentTarget: root });
    await nextTick();
    expect(findAll(body, (n) => n.props.role === 'tooltip')).toHaveLength(0);
    mounted.app.unmount();
  });

  it('keeps the requested semantic root and stays silent when text fits', async () => {
    const mounted = mount(
      UiOverflowTooltip,
      { as: 'h4', text: '完整顯示', class: 'identity-title' },
      { default: () => '完整顯示' },
    );
    const heading = findAll(mounted.root, (node) => node.type === 'h4')[0];
    setOverflow(heading, { clientWidth: 120, scrollWidth: 120 });

    trigger(heading, 'onPointerenter', {
      currentTarget: heading,
      pointerType: 'mouse',
    });
    await vi.runAllTimersAsync();

    expect(String(heading.props.class)).toContain('identity-title');
    expect(heading.props.title).toBeUndefined();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      0,
    );
    mounted.app.unmount();
  });

  it('opens the shared tooltip only after detecting overflow and supports focus and Escape', async () => {
    const mounted = mount(
      UiOverflowTooltip,
      {
        text: '很長而被截斷的曲目名稱',
        placement: 'end',
        tabindex: 0,
      },
      { default: () => '很長而被截斷的曲目名稱' },
    );
    const text = findAll(mounted.root, (node) => node.type === 'span')[0];
    setOverflow(text, { clientWidth: 80, scrollWidth: 240 });

    trigger(text, 'onPointerenter', {
      currentTarget: text,
      pointerType: 'mouse',
    });
    await vi.advanceTimersByTimeAsync(500);
    await nextTick();
    let tooltip = findAll(body, (node) => node.props.role === 'tooltip')[0];
    expect(textContent(tooltip)).toBe('很長而被截斷的曲目名稱');
    expect(tooltip.props['data-placement']).toBe('end');

    trigger(text, 'onKeydown', {
      key: 'Escape',
      stopPropagation: vi.fn(),
    });
    await nextTick();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      0,
    );

    trigger(text, 'onFocusin', { currentTarget: text });
    await nextTick();
    tooltip = findAll(body, (node) => node.props.role === 'tooltip')[0];
    expect(textContent(tooltip)).toBe('很長而被截斷的曲目名稱');
    mounted.app.unmount();
  });
});
