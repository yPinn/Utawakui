import { nextTick } from 'vue';
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

function setOverflow(element, { clientWidth, scrollWidth }) {
  element.clientWidth = clientWidth;
  element.scrollWidth = scrollWidth;
  element.clientHeight = 20;
  element.scrollHeight = 20;
}

describe('UiOverflowTooltip', () => {
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
