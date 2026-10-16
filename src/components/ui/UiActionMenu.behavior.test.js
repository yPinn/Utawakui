import * as Vue from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UiActionMenu from './UiActionMenu.vue';
import UiScrollRegion from './UiScrollRegion.vue';
import UiSearchBox from './UiSearchBox.vue';
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

const { nextTick } = Vue;

for (const [component, filename] of [
  [UiTooltipSurface, './tooltip/UiTooltipSurface.vue'],
  [UiTooltip, './UiTooltip.vue'],
  [UiSearchBox, './UiSearchBox.vue'],
  [UiScrollRegion, './UiScrollRegion.vue'],
  [UiActionMenu, './UiActionMenu.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const action = (id, label, extra = {}) => ({
  kind: 'action',
  id,
  label,
  value: id,
  ...extra,
});

const actions = (...items) => ({
  kind: 'actions',
  groups: [{ id: 'main', items }],
  emptyText: '沒有可用操作',
});

let body;
let listeners;
let animationFrames;
let focusOrigin;

beforeEach(() => {
  body = hostNode('body');
  listeners = new Map();
  animationFrames = [];
  focusOrigin = hostNode('button');
  focusOrigin.isConnected = true;
  vi.stubGlobal('document', {
    activeElement: focusOrigin,
    body,
    documentElement: hostNode('html'),
    querySelector: (selector) => (selector === 'body' ? body : null),
  });
  vi.stubGlobal('window', {
    innerWidth: 800,
    innerHeight: 600,
    addEventListener: vi.fn((name, handler) => listeners.set(name, handler)),
    removeEventListener: vi.fn((name) => listeners.delete(name)),
    requestAnimationFrame: vi.fn((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    }),
    cancelAnimationFrame: vi.fn(),
    getComputedStyle: vi.fn((element) => ({
      direction: element?.props?.dir || 'ltr',
      fontSize: '16px',
      getPropertyValue: (name) =>
        ({
          '--ui-floating-viewport-inset': '8px',
          '--ui-space-1': '4px',
          '--ui-space-2': '8px',
          '--ui-floating-row-min-height': '32px',
          '--ui-border-width': '1px',
        })[name] ?? '',
    })),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mountMenu(props = {}) {
  const mounted = mount(UiActionMenu, {
    open: true,
    anchor: { kind: 'point', x: 24, y: 24 },
    ariaLabel: '曲目操作',
    content: actions(
      action('rename', '重新命名'),
      action('export', '匯出設定'),
    ),
    ...props,
  });
  await nextTick();
  animationFrames.splice(0).forEach((callback) => callback());
  await nextTick();
  return mounted;
}

function menuItems() {
  return findAll(body, (node) => node.props.role === 'menuitem');
}

function keyEvent(key, overrides = {}) {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  };
}

describe('UiActionMenu behavior', () => {
  it('forwards the accessible name, applies semantic size, and focuses the first item', async () => {
    const mounted = await mountMenu({ size: 'sm' });
    const menu = findAll(body, (node) => node.props.role === 'menu')[0];
    const items = menuItems();

    expect(menu.props['aria-label']).toBe('曲目操作');
    expect(menu.props.style.width).toBe('184px');
    expect(items[0].props.tabindex).toBe(0);
    expect(items[0].focus).toHaveBeenCalled();
    expect(items[1].props.tabindex).toBe(-1);
    mounted.app.unmount();
  });

  it('uses roving focus and keeps disabled actions focusable but inert', async () => {
    const onSelect = vi.fn();
    const mounted = await mountMenu({
      content: actions(
        action('rename', '重新命名'),
        action('busy', '目前無法使用', {
          disabled: true,
          disabledReason: '處理中',
        }),
        action('export', '匯出設定'),
      ),
      onSelect,
    });
    const items = menuItems();

    trigger(items[0], 'onKeydown', keyEvent('ArrowDown'));
    await nextTick();
    expect(items[1].props['aria-disabled']).toBe('true');
    expect(items[1].focus).toHaveBeenCalled();

    trigger(items[1], 'onClick', { detail: 1 });
    expect(onSelect).not.toHaveBeenCalled();

    trigger(items[1], 'onKeydown', keyEvent('匯'));
    await nextTick();
    expect(items[2].focus).toHaveBeenCalled();
    mounted.app.unmount();
  });

  it('supports Home, End, and native Tab departure with focus return', async () => {
    const onClose = vi.fn();
    const mounted = await mountMenu({
      content: actions(
        action('first', '第一項'),
        action('middle', '第二項'),
        action('last', '最後一項'),
      ),
      onClose,
    });
    const items = menuItems();

    trigger(items[0], 'onKeydown', keyEvent('End'));
    await nextTick();
    expect(items[2].focus).toHaveBeenCalled();

    trigger(items[2], 'onKeydown', keyEvent('Home'));
    await nextTick();
    expect(items[0].focus).toHaveBeenCalledTimes(2);

    const tab = keyEvent('Tab');
    trigger(items[0], 'onKeydown', tab);
    expect(tab.preventDefault).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    expect(focusOrigin.focus).toHaveBeenCalledOnce();
    mounted.app.unmount();
  });

  it('keeps focus on a filter while arrows update its active descendant and Escape clears before closing', async () => {
    const onClose = vi.fn();
    const mounted = await mountMenu({
      onClose,
      content: actions({
        kind: 'submenu',
        id: 'playlist',
        label: '加入播放清單',
        size: 'lg',
        content: {
          kind: 'filterable-actions',
          search: {
            label: '搜尋播放清單',
            placeholder: '搜尋播放清單',
          },
          pinnedItems: [action('create', '建立新播放清單')],
          groups: [
            {
              id: 'destinations',
              items: [
                action('live', '演出曲目'),
                action('practice', '練習清單'),
              ],
            },
          ],
          emptyText: '沒有可加入的播放清單',
          noResultsText: '找不到播放清單',
        },
      }),
    });
    const opener = menuItems()[0];

    trigger(opener, 'onKeydown', keyEvent('ArrowRight'));
    await nextTick();
    animationFrames.splice(0).forEach((callback) => callback());
    await nextTick();

    const input = findAll(body, (node) => node.type === 'input')[0];
    const controlledItems = findAll(
      body,
      (node) => node.props.id === input.props['aria-controls'],
    )[0];
    expect(input.focus).toHaveBeenCalled();
    expect(input.props['aria-controls']).toMatch(/child-items/u);
    expect(controlledItems).toBeDefined();
    expect(input.props['aria-activedescendant']).toMatch(/create/u);
    expect(
      findAll(
        controlledItems,
        (node) => node.props.id === input.props['aria-activedescendant'],
      ),
    ).toHaveLength(1);

    trigger(input, 'onKeydown', keyEvent('ArrowDown'));
    await nextTick();
    expect(input.props['aria-activedescendant']).toMatch(/live/u);
    expect(
      findAll(
        controlledItems,
        (node) => node.props.id === input.props['aria-activedescendant'],
      ),
    ).toHaveLength(1);

    trigger(input, 'onInput', { target: { value: '練習' } });
    await nextTick();
    expect(menuItems().map(textContent)).toEqual([
      '加入播放清單',
      '建立新播放清單',
      '練習清單',
    ]);

    const clearEscape = keyEvent('Escape');
    trigger(input, 'onKeydown', clearEscape);
    await nextTick();
    expect(clearEscape.preventDefault).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(menuItems().map(textContent)).toEqual([
      '加入播放清單',
      '建立新播放清單',
      '演出曲目',
      '練習清單',
    ]);

    trigger(input, 'onKeydown', keyEvent('Escape'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(opener.focus).toHaveBeenCalledOnce();
    expect(focusOrigin.focus).toHaveBeenCalledOnce();
    mounted.app.unmount();
  });

  it('opens and returns from a submenu with direction-aware arrow keys', async () => {
    const mounted = await mountMenu({
      dir: 'rtl',
      content: actions({
        id: 'playlist',
        kind: 'submenu',
        label: '加入播放清單',
        content: actions(action('live', '演出曲目')),
      }),
    });
    const opener = menuItems()[0];

    trigger(opener, 'onKeydown', keyEvent('ArrowLeft'));
    await nextTick();
    animationFrames.splice(0).forEach((callback) => callback());
    await nextTick();

    const child = menuItems()[1];
    expect(child.focus).toHaveBeenCalled();
    trigger(child, 'onKeydown', keyEvent('ArrowRight'));
    await nextTick();
    expect(opener.focus).toHaveBeenCalled();
    expect(findAll(body, (node) => node.props.role === 'menu')).toHaveLength(1);
    mounted.app.unmount();
  });

  it('focuses an empty menu root and preserves the recipe empty message', async () => {
    const mounted = await mountMenu({
      content: { kind: 'actions', groups: [], emptyText: '目前沒有可用操作' },
    });
    const menu = findAll(body, (node) => node.props.role === 'menu')[0];

    expect(menu.props.tabindex).toBe(-1);
    expect(menu.focus).toHaveBeenCalled();
    expect(textContent(menu)).toContain('目前沒有可用操作');
    mounted.app.unmount();
  });

  it('does not leave an orphan separator when a filtered result set is empty', async () => {
    const mounted = await mountMenu({
      content: {
        kind: 'filterable-actions',
        search: { label: '搜尋目的地', placeholder: '搜尋目的地' },
        pinnedItems: [action('create', '建立新播放清單')],
        groups: [
          {
            id: 'destinations',
            items: [action('live', '演出曲目')],
          },
        ],
        emptyText: '沒有可加入的播放清單',
        noResultsText: '找不到播放清單',
      },
    });
    const input = findAll(body, (node) => node.type === 'input')[0];
    const controlledItems = findAll(
      body,
      (node) => node.props.id === input.props['aria-controls'],
    )[0];

    expect(input.props['aria-controls']).toMatch(/root-items/u);
    expect(controlledItems).toBeDefined();
    expect(
      findAll(
        controlledItems,
        (node) => node.props.id === input.props['aria-activedescendant'],
      ),
    ).toHaveLength(1);

    trigger(input, 'onInput', { target: { value: '不存在' } });
    await nextTick();

    expect(textContent(body)).toContain('找不到播放清單');
    expect(
      findAll(body, (node) =>
        String(node.props.class ?? '').includes('ui-action-menu__separator'),
      ),
    ).toHaveLength(0);
    mounted.app.unmount();
  });

  it('allows only one transient floating surface to hold the shared gate', async () => {
    const onFirstClose = vi.fn();
    const first = await mountMenu({ onClose: onFirstClose });
    const second = await mountMenu();

    expect(onFirstClose).toHaveBeenCalledOnce();
    second.app.unmount();
    first.app.unmount();
  });

  it('emits the caller payload, requests controlled close, and restores the opener', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const payload = { action: 'rename', trackId: 'track-1' };
    const item = action('rename', '重新命名', { value: payload });
    const mounted = await mountMenu({
      content: actions(item),
      onSelect,
      onClose,
    });

    trigger(menuItems()[0], 'onClick', { detail: 1 });

    expect(onSelect).toHaveBeenCalledWith(payload, item);
    expect(onClose).toHaveBeenCalledOnce();
    expect(focusOrigin.focus).toHaveBeenCalledOnce();
    mounted.app.unmount();
  });

  it('dismisses outside pointer, contextmenu, scroll, and resize without stealing focus', async () => {
    const onClose = vi.fn();
    const mounted = await mountMenu({ onClose });
    const outside = hostNode('section');
    focusOrigin.focus.mockClear();

    listeners.get('pointerdown')({ target: outside });
    listeners.get('contextmenu')({ target: outside });
    listeners.get('scroll')({ target: outside });
    listeners.get('resize')();

    expect(onClose).toHaveBeenCalledTimes(4);
    expect(focusOrigin.focus).not.toHaveBeenCalled();
    mounted.app.unmount();
  });
});
