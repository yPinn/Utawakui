import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import UiChip from '../ui/UiChip.vue';
import UiContextMenu from '../ui/UiContextMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import SessionPlanList from './SessionPlanList.vue';

for (const [component, filename] of [
  [SessionPlanList, './SessionPlanList.vue'],
  [UiChip, '../ui/UiChip.vue'],
  [UiContextMenu, '../ui/UiContextMenu.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

let body;

beforeEach(() => {
  body = hostNode('body');
  vi.stubGlobal('document', {
    activeElement: hostNode('button'),
    body,
    documentElement: hostNode('html'),
    querySelector: (selector) => (selector === 'body' ? body : null),
  });
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestAnimationFrame: (callback) => callback(),
    getComputedStyle: () => ({
      fontSize: '16px',
      getPropertyValue: () => '',
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const items = [
  {
    itemId: 'item-1',
    mode: 'library-track',
    displayTitle: 'First song',
    displayArtist: 'Singer A',
    status: 'ready',
    verification: 'verified',
  },
  {
    itemId: 'item-2',
    mode: 'manual',
    displayTitle: '找歌中的曲目',
    displayArtist: '',
    status: 'manual',
    verification: 'verified',
  },
  {
    itemId: 'item-3',
    mode: 'library-track',
    displayTitle: 'Missing audio',
    displayArtist: 'Singer C',
    status: 'unavailable',
    verification: 'unreviewed',
  },
];

function button(root, label) {
  return findAll(
    root,
    (node) => node.type === 'button' && node.props['aria-label'] === label,
  )[0];
}

function buttonWithText(root, label) {
  return findAll(root, (node) => node.type === 'button').find((node) =>
    textContent(node).includes(label),
  );
}

async function openItemMenu(root, label) {
  const opener = buttonWithText(root, label);
  trigger(opener, 'onClick', {
    currentTarget: opener,
    stopPropagation: vi.fn(),
  });
  await nextTick();
  return opener;
}

describe('SessionPlanList', () => {
  it('renders occurrence order and truthful preparation states', () => {
    const mounted = mount(SessionPlanList, {
      items,
      selectedItemId: 'item-2',
    });
    const rows = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '')
        .split(/\s+/u)
        .includes('session-plan-row'),
    );

    expect(rows).toHaveLength(3);
    expect(textContent(mounted.root)).toContain('First song');
    expect(textContent(mounted.root)).not.toContain('已確認');
    expect(textContent(mounted.root)).not.toContain('待確認');
    expect(textContent(mounted.root)).toContain('手動');
    expect(textContent(mounted.root)).toContain('音檔缺少');
    expect(
      String(rows[1].props.class).includes('session-plan-row--selected'),
    ).toBe(true);
    mounted.app.unmount();
  });

  it('uses one compact opener per occurrence and emits its edit intents', async () => {
    const onSelect = vi.fn();
    const onMove = vi.fn();
    const onDuplicate = vi.fn();
    const onRemove = vi.fn();
    const mounted = mount(SessionPlanList, {
      items,
      selectedItemId: 'item-1',
      onSelect,
      onMove,
      onDuplicate,
      onRemove,
    });

    trigger(button(mounted.root, '檢查第 2 首：找歌中的曲目'), 'onClick');
    await openItemMenu(mounted.root, '第 2 首「找歌中的曲目」的更多操作');
    trigger(buttonWithText(body, '下移一位'), 'onClick');

    await openItemMenu(mounted.root, '第 2 首「找歌中的曲目」的更多操作');
    trigger(buttonWithText(body, '複製待唱項目'), 'onClick');

    await openItemMenu(mounted.root, '第 2 首「找歌中的曲目」的更多操作');
    trigger(buttonWithText(body, '從待唱移除'), 'onClick');

    expect(onSelect).toHaveBeenCalledWith('item-2');
    expect(onMove).toHaveBeenCalledWith('item-2', 1);
    expect(onDuplicate).toHaveBeenCalledWith('item-2');
    expect(onRemove).toHaveBeenCalledWith('item-2');
    expect(
      findAll(mounted.root, (node) => node.type === 'button').filter((node) =>
        textContent(node).includes('的更多操作'),
      ),
    ).toHaveLength(items.length);
    mounted.app.unmount();
  });

  it('disables impossible boundary moves in the menu', async () => {
    const mounted = mount(SessionPlanList, {
      items,
      selectedItemId: 'item-1',
    });

    await openItemMenu(mounted.root, '第 1 首「First song」的更多操作');
    expect(buttonWithText(body, '上移一位').props.disabled).toBe(true);
    expect(buttonWithText(body, '下移一位').props.disabled).toBe(false);

    await openItemMenu(mounted.root, '第 3 首「Missing audio」的更多操作');
    expect(buttonWithText(body, '下移一位').props.disabled).toBe(true);
    mounted.app.unmount();
  });

  it('keeps keyboard reordering without making the row draggable', () => {
    const onMove = vi.fn();
    const mounted = mount(SessionPlanList, {
      items,
      selectedItemId: 'item-2',
      onMove,
    });
    const middle = button(mounted.root, '檢查第 2 首：找歌中的曲目');
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    trigger(middle, 'onKeydown', {
      altKey: true,
      key: 'ArrowUp',
      preventDefault,
      stopPropagation,
    });

    expect(onMove).toHaveBeenCalledWith('item-2', -1);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(middle.props['aria-keyshortcuts']).toBe('Alt+ArrowUp Alt+ArrowDown');
    expect(
      findAll(mounted.root, (node) => node.props?.draggable === true),
    ).toHaveLength(0);
    mounted.app.unmount();
  });
});
