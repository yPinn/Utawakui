import { readFileSync } from 'node:fs';
import { h, nextTick, shallowRef } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RefreshCw } from '../../icons/index.js';
import UiButton from './UiButton.vue';
import UiIconButton from './UiIconButton.vue';
import UiPopover from './UiPopover.vue';
import UiScrollRegion from './UiScrollRegion.vue';
import UiTooltip from './UiTooltip.vue';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';

const popoverSource = readFileSync(
  new URL('./UiPopover.vue', import.meta.url),
  'utf8',
);
const iconButtonSource = readFileSync(
  new URL('./UiIconButton.vue', import.meta.url),
  'utf8',
);
const tooltipSurfaceSource = readFileSync(
  new URL('./tooltip/UiTooltipSurface.vue', import.meta.url),
  'utf8',
);

for (const [component, filename] of [
  [UiButton, './UiButton.vue'],
  [UiIconButton, './UiIconButton.vue'],
  [UiPopover, './UiPopover.vue'],
  [UiScrollRegion, './UiScrollRegion.vue'],
  [UiTooltip, './UiTooltip.vue'],
  [UiTooltipSurface, './tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

let body;
let documentListeners;
let windowListeners;

beforeEach(() => {
  vi.useFakeTimers();
  body = hostNode('body');
  documentListeners = new Map();
  windowListeners = new Map();
  vi.stubGlobal('document', {
    activeElement: null,
    body,
    documentElement: hostNode('html'),
    hidden: false,
    querySelector: (selector) => (selector === 'body' ? body : null),
    addEventListener: (name, handler) => documentListeners.set(name, handler),
    removeEventListener: (name) => documentListeners.delete(name),
  });
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: (name, handler) => windowListeners.set(name, handler),
    removeEventListener: (name) => windowListeners.delete(name),
    requestAnimationFrame: (callback) => callback(),
    cancelAnimationFrame: vi.fn(),
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

describe('UiTooltip', () => {
  it('sizes to its content before applying the shared maximum and viewport clamp', () => {
    expect(tooltipSurfaceSource).toMatch(
      /\.ui-tooltip\s*\{[^}]*inline-size:\s*max-content;[^}]*max-inline-size:\s*min\(/su,
    );
    expect(tooltipSurfaceSource).toMatch(
      /\.ui-tooltip\s*\{[^}]*box-sizing:\s*border-box;/su,
    );
  });

  it('opens from hover after its delay, exposes describedby, and closes on Escape', async () => {
    const mounted = mount(
      UiTooltip,
      { text: '重新整理資料', delayMs: 300 },
      {
        trigger: ({ triggerProps }) =>
          h(UiButton, { ...triggerProps }, () => '重新整理'),
      },
    );
    const button = findAll(mounted.root, (node) => node.type === 'button')[0];

    expect(button.props['aria-describedby']).toBeTruthy();
    expect(button.props.onPointerenter).toBeTypeOf('function');
    expect(
      findAll(
        mounted.root,
        (node) => node.props.class === 'ui-tooltip__anchor',
      ),
    ).toHaveLength(0);
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      0,
    );

    trigger(button, 'onPointerenter', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(300);
    await nextTick();
    expect(
      textContent(findAll(body, (node) => node.props.role === 'tooltip')[0]),
    ).toBe('重新整理資料');

    trigger(button, 'onKeydown', {
      key: 'Escape',
      stopPropagation: vi.fn(),
    });
    await nextTick();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      0,
    );
  });

  it('opens immediately for keyboard focus and ignores touch hover', async () => {
    const mounted = mount(
      UiTooltip,
      { text: '快捷說明' },
      {
        trigger: ({ triggerProps }) => h('button', triggerProps, '開啟'),
      },
    );
    const button = findAll(mounted.root, (node) => node.type === 'button')[0];

    trigger(button, 'onPointerenter', { pointerType: 'touch' });
    await vi.runAllTimersAsync();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      0,
    );

    trigger(button, 'onFocusin');
    await nextTick();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      1,
    );
  });

  it('renders optional collection detail as a separate secondary line', async () => {
    const mounted = mount(
      UiTooltip,
      {
        text: '青見＋Piin',
        detail: '專輯・Spotify',
        placement: 'end',
      },
      {
        trigger: ({ triggerProps }) => h('button', triggerProps, '青見＋Piin'),
      },
    );
    const button = findAll(mounted.root, (node) => node.type === 'button')[0];

    trigger(button, 'onFocusin');
    await nextTick();

    const tooltip = findAll(body, (node) => node.props.role === 'tooltip')[0];
    const label = findAll(
      tooltip,
      (node) => node.props.class === 'ui-tooltip__label',
    )[0];
    const detail = findAll(
      tooltip,
      (node) => node.props.class === 'ui-tooltip__detail',
    )[0];
    expect(textContent(label)).toBe('青見＋Piin');
    expect(textContent(detail)).toBe('專輯・Spotify');
    mounted.app.unmount();
  });

  it('does not publish a dangling description when disabled', () => {
    const mounted = mount(
      UiTooltip,
      { text: '不顯示', disabled: true },
      {
        trigger: ({ triggerProps }) => h('button', triggerProps, '停用說明'),
      },
    );
    const button = findAll(mounted.root, (node) => node.type === 'button')[0];

    expect(button.props['aria-describedby']).toBeUndefined();
  });

  it('closes an open tooltip when its interaction owner becomes disabled', async () => {
    const disabled = shallowRef(false);
    const mounted = mount({
      setup: () => () =>
        h(
          UiTooltip,
          { text: '集合資訊', disabled: disabled.value },
          {
            trigger: ({ triggerProps }) =>
              h('button', triggerProps, '集合資訊'),
          },
        ),
    });
    const button = findAll(mounted.root, (node) => node.type === 'button')[0];

    trigger(button, 'onFocusin');
    await nextTick();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      1,
    );

    disabled.value = true;
    await nextTick();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      0,
    );
    mounted.app.unmount();
  });
});

describe('UiIconButton tooltip composition', () => {
  it('keeps the real button as its single root and separates the accessible name from the tooltip', async () => {
    const onClick = vi.fn();
    const mounted = mount(UiIconButton, {
      icon: RefreshCw,
      label: '重新整理',
      title: '重新整理型錄資料',
      tooltipPlacement: 'end',
      class: 'catalogue-refresh',
      'data-control': 'catalogue-refresh',
      'aria-describedby': 'catalogue-help',
      onClick,
    });
    const button = findAll(mounted.root, (node) => node.type === 'button')[0];

    expect(String(button.props.class)).toContain('catalogue-refresh');
    expect(button.props).toMatchObject({
      type: 'button',
      'data-control': 'catalogue-refresh',
    });
    expect(button.props['aria-label']).toBeUndefined();
    expect(button.props.title).toBeUndefined();
    expect(button.props['aria-describedby']).toBe('catalogue-help');
    expect(textContent(button)).toContain('重新整理');
    expect(iconButtonSource).toMatch(/<template>\s*<button\b/u);

    trigger(button, 'onClick');
    expect(onClick).toHaveBeenCalledOnce();

    trigger(button, 'onFocusin');
    await nextTick();
    const tooltip = findAll(body, (node) => node.props.role === 'tooltip')[0];
    expect(textContent(tooltip)).toBe('重新整理型錄資料');
    expect(tooltip.props['data-placement']).toBe('end');
    mounted.app.unmount();
  });

  it('uses the accessible label as fallback tooltip text for disabled buttons', async () => {
    const mounted = mount(UiIconButton, {
      icon: RefreshCw,
      label: '重新整理',
      disabled: true,
    });
    const button = findAll(mounted.root, (node) => node.type === 'button')[0];

    expect(button.props.disabled).toBe(true);
    expect(button.props['aria-label']).toBeUndefined();
    expect(textContent(button)).toContain('重新整理');
    trigger(button, 'onPointerenter', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(500);
    await nextTick();
    expect(
      textContent(findAll(body, (node) => node.props.role === 'tooltip')[0]),
    ).toBe('重新整理');
    mounted.app.unmount();
  });

  it('keeps a caller-owned trailing action phrase intact while the title may wrap', async () => {
    const mounted = mount(UiIconButton, {
      icon: RefreshCw,
      label: 'FAKE LOVE的更多選項',
      title: 'FAKE LOVE',
      tooltipSuffix: '的更多選項',
    });
    const button = findAll(mounted.root, (node) => node.type === 'button')[0];

    trigger(button, 'onFocusin');
    await nextTick();

    const tooltip = findAll(body, (node) => node.props.role === 'tooltip')[0];
    const suffix = findAll(
      tooltip,
      (node) => node.props.class === 'ui-tooltip__no-break',
    )[0];
    expect(textContent(tooltip)).toBe('FAKE LOVE的更多選項');
    expect(textContent(suffix)).toBe('的更多選項');
    expect(tooltipSurfaceSource).toMatch(
      /\.ui-tooltip__no-break\s*\{[^}]*white-space:\s*nowrap;/su,
    );
    mounted.app.unmount();
  });
});

describe('UiPopover', () => {
  it('accepts bounded panel geometry and exposes one labelled vertical scroll body', async () => {
    const panelStyle = {
      minInlineSize: '20rem',
      maxInlineSize: '24rem',
      minBlockSize: '18rem',
      maxBlockSize: '34rem',
    };
    mount(
      UiPopover,
      {
        open: true,
        ariaLabel: '伴奏處理',
        panelStyle,
        scrollAxis: 'vertical',
        scrollAriaLabel: '伴奏處理清單',
      },
      {
        trigger: ({ triggerProps }) => h('button', triggerProps, '伴奏'),
        header: () => '固定操作',
        default: () => h('div', '可捲動項目'),
        footer: () => '固定底部',
      },
    );
    await nextTick();

    const panel = findAll(body, (node) => node.props.role === 'dialog')[0];
    const scrollViewport = findAll(
      body,
      (node) => node.props.class === 'ui-scroll-region__viewport',
    )[0];

    expect(panel.props.style).toMatchObject(panelStyle);
    expect(scrollViewport.props['aria-label']).toBe('伴奏處理清單');
    expect(scrollViewport.props.tabindex).toBe(0);
    expect(popoverSource).toContain(':axis="props.scrollAxis"');
    expect(popoverSource).toContain(
      "validator: (value) => ['vertical', 'horizontal', 'both'].includes(value)",
    );
  });

  it('provides interactive-panel header, body, and end-aligned footer regions', async () => {
    mount(
      UiPopover,
      { open: true, ariaLabel: '外觀快速選項' },
      {
        trigger: ({ triggerProps }) =>
          h('button', triggerProps, '外觀快速選項'),
        header: () => '外觀快速選項',
        default: () => h('p', '選擇要套用的外觀設定。'),
        footer: () => h(UiButton, null, () => '完成'),
      },
    );
    await nextTick();

    const header = findAll(
      body,
      (node) => node.props.class === 'ui-popover__header',
    )[0];
    const content = findAll(
      body,
      (node) => node.props.class === 'ui-popover__body',
    )[0];
    const footer = findAll(
      body,
      (node) => node.props.class === 'ui-popover__footer',
    )[0];

    expect(textContent(header)).toBe('外觀快速選項');
    expect(textContent(content)).toBe('選擇要套用的外觀設定。');
    expect(textContent(footer)).toBe('完成');
    expect(popoverSource).toMatch(
      /\.ui-popover__footer\s*\{[\s\S]*?justify-content:\s*flex-end;/u,
    );
  });

  it('provides trigger ARIA and requests controlled close for Escape', async () => {
    const onClose = vi.fn();
    const onUpdate = vi.fn();
    const mounted = mount(
      UiPopover,
      {
        open: true,
        ariaLabel: '顯示選項',
        onClose,
        'onUpdate:open': onUpdate,
      },
      {
        trigger: ({ triggerProps }) => h('button', triggerProps, '顯示選項'),
        default: () => '非 modal 內容',
      },
    );
    await nextTick();
    const button = findAll(mounted.root, (node) => node.type === 'button')[0];
    const panel = findAll(body, (node) => node.props.role === 'dialog')[0];

    expect(button.props['aria-expanded']).toBe(true);
    expect(button.props['aria-controls']).toBe(panel.props.id);
    expect(panel.props['aria-modal']).toBe('false');

    windowListeners.get('keydown')?.({
      key: 'Escape',
      stopPropagation: vi.fn(),
    });
    await nextTick();
    expect(onUpdate).toHaveBeenCalledWith(false);
    expect(onClose).toHaveBeenCalledWith('escape');
    expect(button.focus).toHaveBeenCalled();
  });

  it('dismisses outside pointer and external scroll while exempting panel scroll', async () => {
    const onClose = vi.fn();
    mount(
      UiPopover,
      { open: true, ariaLabel: '內容面板', onClose },
      {
        trigger: ({ triggerProps }) => h('button', triggerProps, '開啟'),
        default: () => h('div', '面板內容'),
      },
    );
    await nextTick();
    documentListeners.get('pointerdown')?.({ target: hostNode('outside') });
    expect(onClose).toHaveBeenCalledWith('outside-pointer');

    onClose.mockClear();
    windowListeners.get('scroll')?.({ target: hostNode('outside') });
    expect(onClose).toHaveBeenCalledWith('external-scroll');
    expect(popoverSource).toContain('panelRef.value?.contains(event.target)');
  });
});
