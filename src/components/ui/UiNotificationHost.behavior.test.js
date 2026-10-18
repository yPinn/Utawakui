import { readFileSync } from 'node:fs';
import { nextTick, reactive } from 'vue';
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
      '280px',
    );
    useAppRightDockWidth().setWidth(RIGHT_DOCK_WIDTH_MIN);
    await nextTick();
    for (const role of ['preferred', 'min', 'max']) {
      expect(host.props.style[`--ui-notification-${role}-inline-size`]).toBe(
        '224px',
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
      /\.ui-notification-host__item\s*\{[^}]*background:\s*var\(--ui-color-surface-raised\);/su,
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
    owner.notify({ key: 'folder', title: '資料夾未開啟', tone: 'danger' });
    await nextTick();
    const close = findAll(
      body,
      (node) =>
        node.type === 'button' && textContent(node).includes('關閉通知'),
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
