import { readFileSync } from 'node:fs';
import { createSSRApp, nextTick, reactive } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UiButton from './UiButton.vue';
import UiIconButton from './UiIconButton.vue';
import UiNotificationHost from './UiNotificationHost.vue';
import UiNotice from './UiNotice.vue';
import UiProgress from './UiProgress.vue';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import AppNotificationHost from '../layout/AppNotificationHost.vue';
import { useAppNotifications } from '../../composables/useAppNotifications.js';
import {
  useAppRightDockWidth,
  RIGHT_DOCK_WIDTH_MAX,
  RIGHT_DOCK_WIDTH_MIN,
} from '../../composables/useAppRightDockWidth.js';
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
  [UiProgress, './UiProgress.vue'],
  [UiNotificationHost, './UiNotificationHost.vue'],
  [UiTooltipSurface, './tooltip/UiTooltipSurface.vue'],
  [AppNotificationHost, '../layout/AppNotificationHost.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

let body;
let visibilityHandler;

beforeEach(() => {
  useAppRightDockWidth().setWidth(RIGHT_DOCK_WIDTH_MAX);
  const notifications = useAppNotifications();
  for (const { id } of notifications.items.value) notifications.dismiss(id);
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
  it('separates the stationary list item from its horizontally moving card', async () => {
    mount(UiNotificationHost, {
      items: [{ id: 'stable', title: '連續拖曳', dismissible: true }],
    });
    await nextTick();
    const item = notifications()[0];
    const cards = findAll(item, (node) =>
      String(node.props.class ?? '')
        .split(' ')
        .includes('ui-notification-host__card'),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].parent).toBe(item);
    const source = readFileSync(
      new URL('./UiNotificationHost.vue', import.meta.url),
      'utf8',
    );
    const outer = source.match(
      /\.ui-notification-host__item\s*\{([^}]+)\}/u,
    )[1];
    expect(outer).not.toContain('--ui-notification-drag-x');
    expect(outer).toContain('overflow: clip');
  });

  it('captures the stationary item at press so a fast first move cannot lose the release', async () => {
    const setPointerCapture = vi.fn();
    mount(UiNotificationHost, {
      items: [{ id: 'fast', title: '快速拖曳', dismissible: true }],
    });
    await nextTick();
    trigger(notifications()[0], 'onPointerdown', {
      pointerType: 'mouse',
      pointerId: 3,
      clientX: 0,
      clientY: 0,
      currentTarget: { setPointerCapture },
    });
    expect(setPointerCapture).toHaveBeenCalledExactlyOnceWith(3);
  });

  it.each([272, 280, 416])(
    'uses a dead zone and a release boundary tied to the %ipx card',
    async (width) => {
      const onDismiss = vi.fn();
      mount(UiNotificationHost, {
        inlineSize: width,
        items: [{ id: 'boundary', title: '拖曳範圍', dismissible: true }],
        onDismiss,
      });
      await nextTick();
      const item = notifications()[0];
      const event = {
        pointerType: 'mouse',
        pointerId: 1,
        button: 0,
        clientX: 0,
        clientY: 0,
      };
      const offset = () => item.props.style['--ui-notification-drag-x'];
      trigger(item, 'onPointerdown', event);
      trigger(item, 'onPointermove', { ...event, clientX: 11 });
      await nextTick();
      expect(offset()).toBe('0px');
      trigger(item, 'onPointermove', { ...event, clientX: 13 });
      await nextTick();
      expect(offset()).toBe('1px');
      const boundary = Math.max(72, width * 0.35);
      trigger(item, 'onPointermove', {
        ...event,
        clientX: 12 + boundary - 0.01,
      });
      trigger(item, 'onPointerup', { ...event, clientX: 12 + boundary - 0.01 });
      await nextTick();
      expect(onDismiss).not.toHaveBeenCalled();
      expect(offset()).toBe('0px');
      trigger(item, 'onPointerdown', event);
      trigger(item, 'onPointermove', { ...event, clientX: 12 + boundary });
      expect(onDismiss).not.toHaveBeenCalled();
      trigger(item, 'onPointerup', {
        ...event,
        clientX: 12 + boundary,
        preventDefault: vi.fn(),
      });
      expect(onDismiss).toHaveBeenCalledWith({
        id: 'boundary',
        reason: 'swipe',
      });
    },
  );

  it('bounds an excessive drag and lets a crossed boundary be undone before release', async () => {
    const onDismiss = vi.fn();
    mount(UiNotificationHost, {
      inlineSize: 280,
      items: [{ id: 'bounds', title: '範圍', dismissible: true }],
      onDismiss,
    });
    await nextTick();
    const item = notifications()[0];
    const event = {
      pointerType: 'touch',
      pointerId: 1,
      clientX: 0,
      clientY: 0,
    };
    trigger(item, 'onPointerdown', event);
    trigger(item, 'onPointermove', { ...event, clientX: -1000 });
    await nextTick();
    expect(item.props.style['--ui-notification-drag-x']).toBe('-280px');
    expect(onDismiss).not.toHaveBeenCalled();
    trigger(item, 'onPointermove', { ...event, clientX: -20 });
    trigger(item, 'onPointerup', { ...event, clientX: -20 });
    await nextTick();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(item.props.style['--ui-notification-drag-x']).toBe('0px');
  });

  it('requires horizontal intent rather than activating on a slightly diagonal gesture', async () => {
    const onDismiss = vi.fn();
    mount(UiNotificationHost, {
      inlineSize: 280,
      items: [{ id: 'diagonal', title: '斜向', dismissible: true }],
      onDismiss,
    });
    await nextTick();
    const item = notifications()[0];
    const event = {
      pointerType: 'touch',
      pointerId: 2,
      clientX: 0,
      clientY: 0,
    };
    trigger(item, 'onPointerdown', event);
    trigger(item, 'onPointermove', { ...event, clientX: 100, clientY: 80 });
    await nextTick();
    expect(item.props.style['--ui-notification-drag-x']).toBe('0px');
    trigger(item, 'onPointerup', { ...event, clientX: 100, clientY: 80 });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('renders purpose-controlled confirmation and progress without a registered overlay', async () => {
    const html = await renderToString(
      createSSRApp(UiNotificationHost, {
        items: [
          {
            id: 'confirmed',
            title: '請確認',
            variant: 'confirmation',
            dismissible: true,
            tone: 'warning',
          },
          {
            id: 'work',
            title: '準備中',
            lifecycle: 'progress',
            progress: 45,
            dismissible: true,
            actionLabel: '查看進度',
            actionDisabled: true,
          },
        ],
      }),
    );
    expect(html).toContain('知道了');
    expect(html).toContain('45%');
    expect(html).toContain('查看進度');
    expect(html).toContain('disabled');
    expect(html).not.toContain('ui-notification-host__close');
    expect(html).not.toContain('隱藏');
  });
  it.each([
    ['transient', 'result', 'success'],
    ['persistent', 'recovery', 'danger'],
    ['progress', 'progress', 'info'],
  ])(
    'does not add a dismissal footer to %s notifications',
    async (lifecycle, variant, tone) => {
      const onDismiss = vi.fn();
      mount(UiNotificationHost, {
        items: [
          { id: 'purpose', title: '通知', lifecycle, tone, dismissible: true },
        ],
        onDismiss,
      });
      await nextTick();
      const item = notifications()[0];
      expect(item.props['data-notification-variant']).toBe(variant);
      expect(findAll(item, (node) => node.type === 'button')).toHaveLength(0);
      expect(
        findAll(item, (node) =>
          String(node.props.class ?? '').includes('ui-notice__actions'),
        ),
      ).toHaveLength(0);
      expect(item.props.tabindex).toBe(0);
      trigger(item, 'onKeydown', { key: 'Escape', stopPropagation: vi.fn() });
      expect(onDismiss).toHaveBeenCalledWith({
        id: 'purpose',
        reason: 'manual',
      });
    },
  );

  it('shows only the recovery action and uses confirmation semantics independently of tone', async () => {
    const onDismiss = vi.fn();
    mount(UiNotificationHost, {
      items: [
        {
          id: 'retry-only',
          title: '未完成',
          tone: 'danger',
          actionLabel: '重試',
          dismissible: true,
        },
        {
          id: 'confirm',
          title: '請確認',
          variant: 'confirmation',
          tone: 'success',
          lifecycle: 'transient',
          dismissible: true,
        },
      ],
      onDismiss,
    });
    await nextTick();
    const [recovery, confirmation] = notifications();
    expect(
      findAll(recovery, (node) => node.type === 'button').map(textContent),
    ).toEqual(['重試']);
    const button = findAll(confirmation, (node) => node.type === 'button')[0];
    expect(textContent(button)).toBe('知道了');
    await vi.advanceTimersByTimeAsync(20000);
    expect(onDismiss).not.toHaveBeenCalled();
    trigger(button, 'onClick');
    expect(onDismiss).toHaveBeenCalledWith({ id: 'confirm', reason: 'manual' });
  });

  it('keeps an Escape target while its only recovery action is disabled', async () => {
    const onDismiss = vi.fn();
    mount(UiNotificationHost, {
      items: [
        {
          id: 'disabled-retry',
          title: '正在重試',
          actionLabel: '重試',
          actionDisabled: true,
          dismissible: true,
        },
      ],
      onDismiss,
    });
    await nextTick();
    const item = notifications()[0];
    expect(item.props.tabindex).toBe(0);
    const event = { key: 'Escape', stopPropagation: vi.fn() };
    trigger(item, 'onKeydown', event);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledWith({
      id: 'disabled-retry',
      reason: 'manual',
    });
  });

  it('keeps explicitly requested dismissal and recovery together in the footer without an icon close lane', async () => {
    const onDismiss = vi.fn();
    const onAction = vi.fn();
    mount(UiNotificationHost, {
      items: [
        {
          id: 'footer',
          title: '讀取失敗',
          lifecycle: 'persistent',
          dismissible: true,
          dismissLabel: '關閉',
          actionLabel: '重試',
        },
      ],
      onDismiss,
      onAction,
    });
    await nextTick();
    const footer = findAll(body, (node) =>
      String(node.props.class ?? '').includes('ui-notice__actions'),
    )[0];
    expect(footer).toBeDefined();
    const buttons = findAll(footer, (node) => node.type === 'button');
    expect(buttons.map(textContent)).toEqual(['關閉', '重試']);
    trigger(buttons[1], 'onClick');
    expect(onAction).toHaveBeenCalledWith('footer');
    expect(onDismiss).not.toHaveBeenCalled();
    trigger(buttons[0], 'onClick');
    expect(onDismiss).toHaveBeenCalledWith({ id: 'footer', reason: 'manual' });
    expect(
      findAll(body, (node) =>
        String(node.props.class ?? '').includes('ui-notification-host__close'),
      ),
    ).toEqual([]);
  });

  it('hides progress without cancelling it and does not time out persistent records', async () => {
    const onDismiss = vi.fn();
    mount(UiNotificationHost, {
      items: [
        {
          id: 'work',
          title: '正在準備',
          lifecycle: 'progress',
          dismissible: true,
          dismissLabel: '隱藏',
        },
      ],
      onDismiss,
    });
    await nextTick();
    await vi.advanceTimersByTimeAsync(20000);
    expect(onDismiss).not.toHaveBeenCalled();
    const hide = findAll(
      body,
      (node) => node.type === 'button' && textContent(node) === '隱藏',
    )[0];
    expect(hide).toBeDefined();
    trigger(hide, 'onClick');
    expect(onDismiss).toHaveBeenCalledWith({ id: 'work', reason: 'manual' });
  });

  it.each(['mouse', 'touch', 'pen'])(
    'dismisses a persistent record by horizontal %s drag and suppresses its trailing click',
    async (pointerType) => {
      const onDismiss = vi.fn();
      mount(UiNotificationHost, {
        items: [
          {
            id: 'drag',
            title: '待處理',
            lifecycle: 'persistent',
            dismissible: true,
          },
        ],
        onDismiss,
      });
      await nextTick();
      const item = notifications()[0];
      const event = {
        pointerType,
        pointerId: 4,
        button: 0,
        clientX: 100,
        clientY: 50,
        currentTarget: {
          setPointerCapture: vi.fn(),
          releasePointerCapture: vi.fn(),
        },
      };
      trigger(item, 'onPointerdown', event);
      trigger(item, 'onPointermove', { ...event, clientX: -60 });
      trigger(item, 'onPointerup', {
        ...event,
        clientX: -60,
        preventDefault: vi.fn(),
      });
      expect(onDismiss).toHaveBeenCalledWith({ id: 'drag', reason: 'swipe' });
      const click = {
        detail: 1,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      trigger(item, 'onClickCapture', click);
      expect(click.stopPropagation).toHaveBeenCalledOnce();
    },
  );

  it('leaves buttons, secondary pointers and vertical gestures alone', async () => {
    const onDismiss = vi.fn();
    mount(UiNotificationHost, {
      items: [
        {
          id: 'guard',
          title: '完成',
          lifecycle: 'transient',
          durationMs: 1000,
          dismissible: true,
        },
      ],
      onDismiss,
    });
    await nextTick();
    const item = notifications()[0];
    const base = {
      pointerType: 'touch',
      pointerId: 5,
      clientX: 0,
      clientY: 0,
      currentTarget: { setPointerCapture: vi.fn() },
    };
    for (const extra of [
      { target: { closest: () => ({}) } },
      { isPrimary: false },
      { pointerType: 'mouse', button: 2 },
    ]) {
      trigger(item, 'onPointerdown', { ...base, ...extra });
      trigger(item, 'onPointermove', { ...base, clientX: 100 });
      trigger(item, 'onPointerup', base);
    }
    trigger(item, 'onPointerdown', base);
    trigger(item, 'onPointermove', { ...base, clientX: 4, clientY: 30 });
    trigger(item, 'onPointermove', { ...base, clientX: 100, clientY: 35 });
    trigger(item, 'onPointerup', base);
    expect(onDismiss).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onDismiss).toHaveBeenCalledWith({ id: 'guard', reason: 'timeout' });
  });

  it('shares the Dock shell edges instead of a separate notification inset', () => {
    const tokens = readFileSync(
      new URL('../../styles/tokens.css', import.meta.url),
      'utf8',
    );
    expect(tokens).toContain(
      '--ui-notification-safe-inset: var(--ui-shell-edge-inset-inline);',
    );
    expect(tokens).toMatch(
      /--ui-notification-block-end-offset:\s*calc\(\s*var\(--ui-player-bar-height\)\s*\+\s*var\(--ui-shell-content-inset-block\)\s*\)/u,
    );
  });

  it('restores a short drag after lost capture while retaining the hover pause', async () => {
    const onDismiss = vi.fn();
    mount(UiNotificationHost, {
      items: [
        {
          id: 'capture',
          title: '完成',
          lifecycle: 'transient',
          durationMs: 1000,
          dismissible: true,
        },
      ],
      onDismiss,
    });
    await nextTick();
    const item = notifications()[0];
    await vi.advanceTimersByTimeAsync(400);
    trigger(item, 'onPointerenter');
    const event = {
      pointerType: 'mouse',
      pointerId: 9,
      clientX: 0,
      clientY: 0,
    };
    trigger(item, 'onPointerdown', event);
    trigger(item, 'onPointermove', { ...event, clientX: 30 });
    trigger(item, 'onLostpointercapture', event);
    await nextTick();
    expect(item.props.style['--ui-notification-drag-x']).toBe('0px');
    await vi.advanceTimersByTimeAsync(2000);
    expect(onDismiss).not.toHaveBeenCalled();
    trigger(item, 'onPointerleave');
    await vi.advanceTimersByTimeAsync(599);
    expect(onDismiss).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onDismiss).toHaveBeenCalledWith({
      id: 'capture',
      reason: 'timeout',
    });
  });

  it('keeps the remaining deadline through same-id content/tone updates and filters empty entries', async () => {
    const dismiss = vi.fn();
    const props = reactive({
      items: [
        null,
        { id: 'empty', message: '' },
        {
          id: 'content',
          title: '完成',
          lifecycle: 'transient',
          durationMs: 1000,
        },
      ],
      onDismiss: dismiss,
    });
    const { app } = mount(UiNotificationHost, props);
    await nextTick();
    expect(notifications()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(600);
    props.items[2].title = '更新後的長內容'.repeat(20);
    props.items[2].tone = 'warning';
    await nextTick();
    await vi.advanceTimersByTimeAsync(399);
    expect(dismiss).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(dismiss).toHaveBeenCalledExactlyOnceWith({
      id: 'content',
      reason: 'timeout',
    });
    app.unmount();
  });

  it('keeps focus pause after cancelling a touch swipe', async () => {
    const dismiss = vi.fn();
    const { app } = mount(UiNotificationHost, {
      items: [
        {
          id: 'swipe',
          title: '完成',
          lifecycle: 'transient',
          durationMs: 1000,
          dismissible: true,
        },
      ],
      onDismiss: dismiss,
    });
    await nextTick();
    const article = notifications()[0];
    trigger(article, 'onFocusin');
    trigger(article, 'onPointerdown', {
      pointerType: 'touch',
      pointerId: 9,
      clientX: 20,
    });
    trigger(article, 'onPointermove', { pointerId: 9, clientX: 40 });
    trigger(article, 'onPointercancel', { pointerId: 9 });
    await nextTick();
    expect(article.props.style['--ui-notification-drag-x']).toBe('0px');
    await vi.advanceTimersByTimeAsync(2000);
    expect(dismiss).not.toHaveBeenCalled();
    trigger(article, 'onFocusout', {
      currentTarget: { contains: () => false },
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(dismiss).toHaveBeenCalledExactlyOnceWith({
      id: 'swipe',
      reason: 'timeout',
    });
    app.unmount();
  });

  it('preserves overlapping pointer/focus pauses when duration or lifecycle changes', async () => {
    const dismiss = vi.fn();
    const props = reactive({
      items: [
        {
          id: 'update',
          title: '處理中',
          lifecycle: 'progress',
          durationMs: 1000,
        },
      ],
      onDismiss: dismiss,
    });
    const { app } = mount(UiNotificationHost, props);
    await nextTick();
    const article = notifications()[0];
    trigger(article, 'onPointerenter');
    trigger(article, 'onFocusin');
    props.items[0].lifecycle = 'transient';
    props.items[0].durationMs = 2000;
    await nextTick();
    await vi.advanceTimersByTimeAsync(3000);
    expect(dismiss).not.toHaveBeenCalled();
    trigger(article, 'onPointerleave');
    await vi.advanceTimersByTimeAsync(3000);
    expect(dismiss).not.toHaveBeenCalled();
    trigger(article, 'onFocusout', {
      currentTarget: { contains: () => false },
    });
    await vi.advanceTimersByTimeAsync(1999);
    expect(dismiss).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(dismiss).toHaveBeenCalledExactlyOnceWith({
      id: 'update',
      reason: 'timeout',
    });
    app.unmount();
  });

  it('does not rearm a dismissed timeout on pointer leave, and cleans up after removal/unmount', async () => {
    const dismiss = vi.fn();
    const props = reactive({
      items: [
        {
          id: 'once',
          title: '完成',
          lifecycle: 'transient',
          durationMs: 1000,
          dismissible: true,
          dismissLabel: '關閉',
        },
      ],
      onDismiss: dismiss,
    });
    const { app } = mount(UiNotificationHost, props);
    await nextTick();
    const article = notifications()[0];
    trigger(article, 'onPointerenter');
    trigger(findAll(article, (node) => node.type === 'button')[0], 'onClick');
    trigger(article, 'onPointerleave');
    await vi.advanceTimersByTimeAsync(3000);
    expect(dismiss).toHaveBeenCalledOnce();
    props.items = [];
    await nextTick();
    props.items = [
      {
        id: 'once',
        title: '再次完成',
        lifecycle: 'transient',
        durationMs: 1000,
      },
    ];
    await nextTick();
    await vi.advanceTimersByTimeAsync(1000);
    expect(dismiss).toHaveBeenCalledTimes(2);
    app.unmount();
    await vi.advanceTimersByTimeAsync(5000);
    expect(dismiss).toHaveBeenCalledTimes(2);
  });

  it('forwards actionDisabled and recovers without consuming the notification', async () => {
    const action = vi.fn();
    const props = reactive({
      items: [
        {
          id: 'retry',
          title: '等待',
          actionLabel: '重試',
          actionDisabled: true,
        },
      ],
      onAction: action,
    });
    const { app } = mount(UiNotificationHost, props);
    await nextTick();
    const button = findAll(
      notifications()[0],
      (node) => node.type === 'button',
    )[0];
    expect(button.props.disabled).toBe(true);
    trigger(button, 'onClick');
    expect(action).not.toHaveBeenCalled();
    props.items[0].actionDisabled = false;
    await nextTick();
    trigger(button, 'onClick');
    expect(action).toHaveBeenCalledExactlyOnceWith('retry');
    expect(notifications()).toHaveLength(1);
    app.unmount();
  });
  it('resumes the remaining timeout after a modal interrupts a visible result', async () => {
    const { shallowRef, h } = await import('vue');
    const suspended = shallowRef(false);
    const dismiss = vi.fn();
    const { app } = mount({
      render: () =>
        h(UiNotificationHost, {
          items: [
            {
              id: 'result',
              title: '完成',
              lifecycle: 'transient',
              durationMs: 1000,
            },
          ],
          suspended: suspended.value,
          onDismiss: dismiss,
        }),
    });
    await nextTick();
    await vi.advanceTimersByTimeAsync(600);
    suspended.value = true;
    await nextTick();
    await vi.advanceTimersByTimeAsync(10000);
    expect(dismiss).not.toHaveBeenCalled();
    suspended.value = false;
    await nextTick();
    await vi.advanceTimersByTimeAsync(399);
    expect(dismiss).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(dismiss).toHaveBeenCalledOnce();
    app.unmount();
  });
  it('puts an important failure ahead of a full progress shelf', async () => {
    const owner = useAppNotifications();
    const { app } = mount(AppNotificationHost);
    for (let index = 0; index < 3; index += 1)
      owner.notify({
        key: `task-${index}`,
        title: `處理 ${index}`,
        lifecycle: 'progress',
        priority: -1,
      });
    owner.notify({
      key: 'failure',
      title: '元件修復未完成',
      tone: 'danger',
      priority: 1,
    });
    await nextTick();
    expect(notifications()).toHaveLength(3);
    expect(textContent(notifications()[0])).toContain('元件修復未完成');
    app.unmount();
  });
  it('keeps one task through progress and completion, while important results can surface', async () => {
    const owner = useAppNotifications();
    const { app } = mount(AppNotificationHost);
    const id = owner.notify({
      key: 'task',
      title: '下載中',
      tone: 'info',
      lifecycle: 'progress',
      progress: 10,
      priority: -1,
    });
    await nextTick();
    const first = notifications()[0];
    owner.update(id, { progress: 65, message: '下載 65%' });
    await nextTick();
    expect(notifications()[0]).toBe(first);
    expect(
      findAll(first, (node) => node.type === 'progress')[0].props.value,
    ).toBe(65);
    await vi.advanceTimersByTimeAsync(8000);
    expect(owner.items.value).toHaveLength(1);
    owner.update(id, {
      lifecycle: 'transient',
      title: '已完成',
      progress: null,
    });
    await nextTick();
    await vi.advanceTimersByTimeAsync(6000);
    expect(owner.items.value).toHaveLength(0);
    app.unmount();
  });

  it('pauses visibility and timeout while a modal owns the screen', async () => {
    const { shallowRef, h } = await import('vue');
    const suspended = shallowRef(true);
    const items = [
      {
        id: 'result',
        title: '下載已完成',
        lifecycle: 'transient',
        announcement: 'polite',
      },
    ];
    const dismiss = vi.fn();
    const { app } = mount({
      render: () =>
        h(UiNotificationHost, {
          items,
          suspended: suspended.value,
          onDismiss: dismiss,
        }),
    });
    await nextTick();
    await vi.advanceTimersByTimeAsync(10000);
    expect(dismiss).not.toHaveBeenCalled();
    expect(notifications()).toHaveLength(0);
    suspended.value = false;
    await nextTick();
    expect(notifications()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(6000);
    expect(dismiss).toHaveBeenCalledOnce();
    app.unmount();
  });
  it('keeps entry and exit opaque while retaining translation motion', () => {
    const source = readFileSync(
      new URL('./UiNotificationHost.vue', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/opacity:\s*0\s*;/u);
    expect(source).not.toMatch(/opacity\s+var\(--ui-motion/u);
    expect(source).toContain(
      '--ui-notification-motion-y: var(--ui-notification-motion-offset)',
    );
  });

  it('passes live Dock width explicitly into the teleported notification host', async () => {
    const owner = useAppNotifications();
    const { app } = mount(AppNotificationHost);
    owner.notify({ key: 'geometry', title: '錯誤紀錄已清除' });
    await nextTick();
    const host = findAll(
      body,
      (node) => String(node.props.class ?? '') === 'ui-notification-host',
    )[0];
    expect(host.props.style['--ui-notification-preferred-inline-size']).toBe(
      `${RIGHT_DOCK_WIDTH_MAX}px`,
    );
    useAppRightDockWidth().setWidth(RIGHT_DOCK_WIDTH_MIN);
    await nextTick();
    for (const role of ['preferred', 'min', 'max']) {
      expect(host.props.style[`--ui-notification-${role}-inline-size`]).toBe(
        `${RIGHT_DOCK_WIDTH_MIN}px`,
      );
    }
    app.unmount();
  });
  it('backs translucent semantic notices with an opaque surface', () => {
    const source = readFileSync(
      new URL('./UiNotificationHost.vue', import.meta.url),
      'utf8',
    );
    expect(source).toMatch(
      /\.ui-notification-host__card\s*\{[^}]*background:\s*var\(--ui-color-surface-raised\);/su,
    );
  });
  it('keeps shell notifications across page changes and wires timeout, close, and retry', async () => {
    const { h, shallowRef } = await import('vue');
    const page = shallowRef('settings');
    const owner = useAppNotifications();
    const retry = vi.fn(() => owner.notify({ key: 'export', title: '已匯出' }));
    const { app } = mount({
      render: () => h('div', [h('main', page.value), h(AppNotificationHost)]),
    });
    owner.notify({
      key: 'export',
      title: '匯出失敗',
      tone: 'danger',
      actionLabel: '重試',
      action: retry,
    });
    await nextTick();
    page.value = 'library';
    await nextTick();
    expect(notifications()).toHaveLength(1);
    const retryButton = findAll(
      body,
      (node) => node.type === 'button' && textContent(node).includes('重試'),
    )[0];
    trigger(retryButton, 'onClick');
    await nextTick();
    expect(retry).toHaveBeenCalledOnce();
    expect(textContent(body)).toContain('已匯出');
    await vi.advanceTimersByTimeAsync(6000);
    await nextTick();
    expect(owner.items.value).toEqual([]);
    owner.notify({
      key: 'folder',
      title: '資料夾未開啟',
      tone: 'danger',
      dismissLabel: '關閉',
    });
    await nextTick();
    const close = findAll(
      body,
      (node) => node.type === 'button' && textContent(node) === '關閉',
    )[0];
    trigger(close, 'onClick');
    await nextTick();
    expect(owner.items.value).toEqual([]);
    app.unmount();
  });

  it('does not spend a queued notification timeout before it becomes visible', async () => {
    const owner = useAppNotifications();
    const { app } = mount(AppNotificationHost);
    for (let i = 0; i < 3; i++)
      owner.notify({ key: `failure-${i}`, title: '待處理', tone: 'danger' });
    owner.notify({ key: 'success', title: '已完成' });
    await nextTick();
    await vi.advanceTimersByTimeAsync(7000);
    expect(owner.items.value).toHaveLength(4);
    owner.dismiss(owner.items.value[0].id);
    await nextTick();
    await vi.advanceTimersByTimeAsync(6000);
    expect(owner.items.value.map(({ title }) => title)).toEqual([
      '待處理',
      '待處理',
    ]);
    app.unmount();
  });
  it('does not restart an existing timeout when another notification arrives', async () => {
    const { reactive, h } = await import('vue');
    const state = reactive({
      items: [
        {
          id: 'first',
          title: '已完成',
          lifecycle: 'transient',
          durationMs: 1000,
        },
      ],
    });
    const onDismiss = vi.fn();
    mount({
      render: () => h(UiNotificationHost, { items: state.items, onDismiss }),
    });
    await nextTick();
    await vi.advanceTimersByTimeAsync(700);
    state.items.push({
      id: 'second',
      title: '另一項完成',
      lifecycle: 'transient',
      durationMs: 1000,
    });
    await nextTick();
    await vi.advanceTimersByTimeAsync(300);
    expect(onDismiss).toHaveBeenCalledWith({ id: 'first', reason: 'timeout' });
    expect(onDismiss).not.toHaveBeenCalledWith({
      id: 'second',
      reason: 'timeout',
    });
  });

  it('pauses newly arriving notifications while the document is hidden', async () => {
    const owner = useAppNotifications();
    const { app } = mount(AppNotificationHost);
    document.hidden = true;
    visibilityHandler();
    owner.notify({ key: 'saved-hidden', title: '已完成' });
    await nextTick();
    await vi.advanceTimersByTimeAsync(7000);
    expect(owner.items.value).toHaveLength(1);
    document.hidden = false;
    visibilityHandler();
    await vi.advanceTimersByTimeAsync(6000);
    expect(owner.items.value).toEqual([]);
    app.unmount();
  });
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
      new URL('../../styles/tokens.css', import.meta.url),
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
      new URL('../../styles/tokens.css', import.meta.url),
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
        /--ui-notification-block-end-offset:\s*calc\([\s\S]*?--ui-player-bar-height[\s\S]*?--ui-shell-content-inset-block[\s\S]*?\);/u,
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
          dismissLabel: '關閉',
        },
      ],
      onDismiss,
    });
    await nextTick();
    const item = notifications()[0];
    const close = findAll(
      item,
      (node) => node.type === 'button' && textContent(node) === '關閉',
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
      clientX: 180,
    });
    await nextTick();
    expect(item.props.style['--ui-notification-drag-x']).toBe('148px');
    trigger(item, 'onPointerup', { pointerId: 7 });
    await nextTick();
    expect(onDismiss).toHaveBeenCalledWith({
      id: 'dismissible',
      reason: 'swipe',
    });
    expect(item.props.style['--ui-notification-drag-x']).toBe('148px');
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
