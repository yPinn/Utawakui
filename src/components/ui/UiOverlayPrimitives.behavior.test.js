import { readFileSync } from 'node:fs';
import { h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UiButton from './UiButton.vue';
import UiPopover from './UiPopover.vue';
import UiTooltip from './UiTooltip.vue';
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

for (const [component, filename] of [
  [UiButton, './UiButton.vue'],
  [UiPopover, './UiPopover.vue'],
  [UiTooltip, './UiTooltip.vue'],
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
  it('opens from hover after its delay, exposes describedby, and closes on Escape', async () => {
    const mounted = mount(
      UiTooltip,
      { text: '重新整理資料', delayMs: 300 },
      {
        trigger: ({ triggerProps }) =>
          h(UiButton, { ...triggerProps }, () => '重新整理'),
      },
    );
    const anchor = findAll(
      mounted.root,
      (node) => node.props.class === 'ui-tooltip__anchor',
    )[0];
    const button = findAll(mounted.root, (node) => node.type === 'button')[0];

    expect(button.props['aria-describedby']).toBeTruthy();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      0,
    );

    trigger(anchor, 'onPointerenter', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(300);
    await nextTick();
    expect(
      textContent(findAll(body, (node) => node.props.role === 'tooltip')[0]),
    ).toBe('重新整理資料');

    trigger(anchor, 'onKeydown', { key: 'Escape', stopPropagation: vi.fn() });
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
    const anchor = findAll(
      mounted.root,
      (node) => node.props.class === 'ui-tooltip__anchor',
    )[0];

    trigger(anchor, 'onPointerenter', { pointerType: 'touch' });
    await vi.runAllTimersAsync();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      0,
    );

    trigger(anchor, 'onFocusin');
    await nextTick();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      1,
    );
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
});

describe('UiPopover', () => {
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
