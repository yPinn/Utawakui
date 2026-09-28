import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UiButton from './UiButton.vue';
import UiIconButton from './UiIconButton.vue';
import UiNotificationHost from './UiNotificationHost.vue';
import UiNotice from './UiNotice.vue';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';

for (const [component, filename] of [
  [UiButton, './UiButton.vue'],
  [UiIconButton, './UiIconButton.vue'],
  [UiNotice, './UiNotice.vue'],
  [UiNotificationHost, './UiNotificationHost.vue'],
  [UiTooltipSurface, './tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

let body;
let visibilityHandler;

beforeEach(() => {
  vi.useFakeTimers();
  body = hostNode('body');
  vi.stubGlobal(
    'Element',
    class UiTestElement {
      static [Symbol.hasInstance](candidate) {
        return candidate?.__uiTestHostNode === true;
      }
    },
  );
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    callback();
    return 0;
  });
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getComputedStyle: () => ({
      animationDelay: '0s',
      animationDuration: '0s',
      fontSize: '16px',
      getPropertyValue: () => '',
      transitionDelay: '0s',
      transitionDuration: '0s',
      transitionProperty: '',
    }),
  });
  vi.stubGlobal('document', {
    body,
    hidden: false,
    querySelector: (selector) => (selector === 'body' ? body : null),
    addEventListener: (name, handler) => {
      if (name === 'visibilitychange') visibilityHandler = handler;
    },
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function notifications() {
  return findAll(body, (node) =>
    String(node.props.class ?? '').includes('ui-notification-host__item'),
  );
}

describe('UiNotificationHost', () => {
  it('animates entry, removal, and queue movement from its bottom shelf', () => {
    const source = readFileSync(
      new URL('./UiNotificationHost.vue', import.meta.url),
      'utf8',
    );
    const activeTokens = readFileSync(
      new URL('../../styles/tokens.css', import.meta.url),
      'utf8',
    );
    const candidateTokens = readFileSync(
      new URL('../../styles/tokens-v2.css', import.meta.url),
      'utf8',
    );

    expect(source).toContain('<TransitionGroup');
    expect(source).toContain('name="ui-notification"');
    expect(source).toContain('appear');
    expect(source).toContain('.ui-notification-enter-active');
    expect(source).toContain('.ui-notification-leave-active');
    expect(source).toMatch(
      /\.ui-notification-leave-active\s*\{[\s\S]*?position: absolute;/u,
    );
    expect(source).toContain('.ui-notification-move');
    expect(source).toContain('.ui-notification-enter-from');
    expect(source).toContain('.ui-notification-leave-to');
    expect(source).toContain(
      '--ui-notification-motion-y: var(--ui-notification-motion-offset);',
    );
    expect(source).toMatch(
      /data-ui-motion='reduced'[\s\S]*?--ui-notification-motion-y: 0;[\s\S]*?opacity: 1;[\s\S]*?transition: none;/u,
    );
    expect(source).toMatch(
      /prefers-reduced-motion: reduce[\s\S]*?--ui-notification-motion-y: 0;[\s\S]*?opacity: 1;[\s\S]*?transition: none;/u,
    );
    for (const tokens of [activeTokens, candidateTokens]) {
      expect(tokens).toContain(
        '--ui-notification-motion-offset: var(--ui-space-4);',
      );
    }
  });

  it('anchors bottom-end above persistent player-bar chrome', () => {
    const source = readFileSync(
      new URL('./UiNotificationHost.vue', import.meta.url),
      'utf8',
    );
    const activeTokens = readFileSync(
      new URL('../../styles/tokens.css', import.meta.url),
      'utf8',
    );
    const candidateTokens = readFileSync(
      new URL('../../styles/tokens-v2.css', import.meta.url),
      'utf8',
    );

    expect(source).toContain(
      'inset-block-end: var(--ui-notification-block-end-offset);',
    );
    expect(source).not.toContain(
      'inset-block-start: var(--ui-notification-safe-inset);',
    );
    for (const tokens of [activeTokens, candidateTokens]) {
      expect(tokens).toMatch(
        /--ui-notification-block-end-offset:\s*calc\([\s\S]*?--ui-player-bar-height[\s\S]*?--ui-notification-safe-inset[\s\S]*?\);/u,
      );
    }
  });

  it('derives the swipe threshold from a shared component token', () => {
    const source = readFileSync(
      new URL('./UiNotificationHost.vue', import.meta.url),
      'utf8',
    );

    expect(source).toContain(
      "customLengthPixels('--ui-notification-swipe-dismiss-distance', 4.5)",
    );
    expect(source).not.toContain('SWIPE_DISMISS_DISTANCE');
  });

  it('renders a bounded caller-controlled queue and keeps lifecycle explicit', async () => {
    mount(UiNotificationHost, {
      maxVisible: 2,
      items: [
        { id: 'one', lifecycle: 'persistent', title: '第一筆' },
        { id: 'two', lifecycle: 'progress', title: '第二筆' },
        { id: 'three', lifecycle: 'transient', title: '第三筆' },
      ],
    });
    await nextTick();

    expect(notifications()).toHaveLength(2);
    expect(
      notifications().map((node) => node.props['data-notification-id']),
    ).toEqual(['one', 'two']);
  });

  it('times out only transient items and pauses while hovered', async () => {
    const onDismiss = vi.fn();
    mount(UiNotificationHost, {
      items: [
        {
          id: 'saved',
          lifecycle: 'transient',
          durationMs: 1000,
          title: '已儲存',
        },
        { id: 'error', lifecycle: 'persistent', title: '需要處理' },
      ],
      onDismiss,
    });
    await nextTick();
    const transient = notifications()[0];

    await vi.advanceTimersByTimeAsync(500);
    trigger(transient, 'onPointerenter');
    await vi.advanceTimersByTimeAsync(1000);
    expect(onDismiss).not.toHaveBeenCalled();

    trigger(transient, 'onPointerleave');
    await vi.advanceTimersByTimeAsync(500);
    expect(onDismiss).toHaveBeenCalledWith({ id: 'saved', reason: 'timeout' });
    expect(onDismiss).not.toHaveBeenCalledWith({
      id: 'error',
      reason: 'timeout',
    });
  });

  it('uses explicit announcements and emits action without dismissing', async () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    mount(UiNotificationHost, {
      items: [
        {
          id: 'retry',
          lifecycle: 'persistent',
          announcement: 'urgent',
          tone: 'danger',
          title: '載入失敗',
          actionLabel: '重試',
          dismissible: true,
        },
      ],
      onAction,
      onDismiss,
    });
    await nextTick();
    const item = notifications()[0];
    const buttons = findAll(item, (node) => node.type === 'button');
    const notice = findAll(item, (node) =>
      String(node.props.class ?? '')
        .split(' ')
        .includes('ui-notice'),
    )[0];

    expect(item.props.role).toBe('alert');
    expect(item.props['aria-live']).toBe('assertive');
    expect(notice.props.role).toBe('presentation');
    expect(notice.props['aria-live']).toBe('off');
    trigger(
      buttons.find((button) => textContent(button).includes('重試')),
      'onClick',
    );
    expect(onAction).toHaveBeenCalledWith('retry');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('keeps manual and touch swipe dismissal explicit', async () => {
    const onDismiss = vi.fn();
    mount(UiNotificationHost, {
      items: [
        {
          id: 'dismissible',
          lifecycle: 'transient',
          durationMs: 6000,
          title: '可關閉通知',
          dismissible: true,
        },
      ],
      onDismiss,
    });
    await nextTick();
    const item = notifications()[0];
    const close = findAll(
      item,
      (node) => node.type === 'button' && textContent(node) === '關閉通知',
    )[0];

    trigger(close, 'onClick');
    expect(onDismiss).toHaveBeenCalledWith({
      id: 'dismissible',
      reason: 'manual',
    });

    onDismiss.mockClear();
    trigger(item, 'onPointerdown', {
      pointerType: 'touch',
      pointerId: 7,
      clientX: 20,
      currentTarget: { setPointerCapture: vi.fn() },
    });
    trigger(item, 'onPointermove', {
      pointerId: 7,
      clientX: 100,
    });
    await nextTick();
    expect(item.props.style['--ui-notification-drag-x']).toBe('80px');
    trigger(item, 'onPointerup', { pointerId: 7 });
    await nextTick();
    expect(onDismiss).toHaveBeenCalledWith({
      id: 'dismissible',
      reason: 'swipe',
    });
    expect(item.props.style['--ui-notification-drag-x']).toBe('0px');
  });

  it('pauses transient timers while the document is hidden', async () => {
    const onDismiss = vi.fn();
    mount(UiNotificationHost, {
      items: [
        {
          id: 'hidden',
          lifecycle: 'transient',
          durationMs: 1000,
          title: '完成',
        },
      ],
      onDismiss,
    });
    await nextTick();
    await vi.advanceTimersByTimeAsync(400);
    document.hidden = true;
    visibilityHandler();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onDismiss).not.toHaveBeenCalled();

    document.hidden = false;
    visibilityHandler();
    await vi.advanceTimersByTimeAsync(600);
    expect(onDismiss).toHaveBeenCalledWith({ id: 'hidden', reason: 'timeout' });
  });
});
