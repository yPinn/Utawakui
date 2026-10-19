import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrackArtworkContent from '../ui/TrackArtworkContent.vue';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import UiChip from '../ui/UiChip.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiOverflowTooltip from '../ui/UiOverflowTooltip.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiTextButton from '../ui/UiTextButton.vue';
import UiTooltip from '../ui/UiTooltip.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import PerformanceSessionPlanList from './PerformanceSessionPlanList.vue';

for (const [component, filename] of [
  [PerformanceSessionPlanList, './PerformanceSessionPlanList.vue'],
  [TrackArtworkContent, '../ui/TrackArtworkContent.vue'],
  [UiChip, '../ui/UiChip.vue'],
  [UiActionMenu, '../ui/UiActionMenu.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiMarqueeText, '../ui/UiMarqueeText.vue'],
  [UiOverflowTooltip, '../ui/UiOverflowTooltip.vue'],
  [UiScrollLayout, '../ui/UiScrollLayout.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiTextButton, '../ui/UiTextButton.vue'],
  [UiTooltip, '../ui/UiTooltip.vue'],
  [UiTrackRow, '../ui/UiTrackRow.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
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
    cancelAnimationFrame: vi.fn(),
    getComputedStyle: () => ({
      direction: 'ltr',
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
    trackId: 'track-1',
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

const tracks = [
  {
    id: 'track-1',
    title: 'Canonical library title',
    artist: 'Canonical artist',
    album: 'Canonical album',
    duration: 245,
    thumbnailUrl: 'utawakui-media://track/track-1/thumbnail.jpg',
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

describe('PerformanceSessionPlanList', () => {
  it('keeps the direct play action separate from row selection and the settings modal', () => {
    const onPlay = vi.fn();
    const onSelect = vi.fn();
    const mounted = mount(PerformanceSessionPlanList, {
      items: [items[0]],
      tracks,
      onPlay,
      onSelect,
    });
    const stopPropagation = vi.fn();
    trigger(buttonWithText(mounted.root, '播放：First song'), 'onClick', {
      stopPropagation,
    });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(onPlay).toHaveBeenCalledWith('item-1');
    expect(onSelect).not.toHaveBeenCalled();
    mounted.app.unmount();
  });
  it('uses one semantic scrolling ordered list without a duplicated table header', () => {
    const mounted = mount(PerformanceSessionPlanList, {
      items,
      tracks,
      selectedItemId: 'item-2',
    });
    const scroll = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes(
        'performance-session-plan-list__body-scroll',
      ),
    )[0];
    const orderedLists = findAll(mounted.root, (node) => node.type === 'ol');

    expect(scroll).toBeDefined();
    expect(orderedLists).toHaveLength(1);
    expect(textContent(mounted.root)).not.toContain('順序曲目狀態操作');
    mounted.app.unmount();
  });

  it('adapts canonical track information into UiTrackRow while preserving session copy', () => {
    const mounted = mount(PerformanceSessionPlanList, {
      items: [items[0]],
      tracks,
      selectedItemId: 'item-1',
    });
    const row = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '')
        .split(/\s+/u)
        .includes('ui-track'),
    )[0];
    const artwork = findAll(
      row,
      (node) =>
        node.type === 'img' &&
        node.props?.['data-track-artwork-kind'] === 'custom',
    )[0];

    expect(row).toBeDefined();
    expect(String(row.props.class)).toContain('performance-session-plan-entry');
    expect(String(row.props.class)).toContain('ui-track--active');
    expect(textContent(row)).toContain('First song');
    expect(textContent(row)).toContain('Singer A');
    expect(textContent(row)).not.toContain('Canonical library title');
    expect(textContent(row)).not.toContain('Canonical artist');
    expect(artwork.props.src).toBe(
      'utawakui-media://track/track-1/thumbnail.jpg',
    );
    expect(textContent(row)).not.toContain('4:05'); // board prioritizes identity, status and the direct play action
    expect(textContent(row)).toContain('播放：First song');
    mounted.app.unmount();
  });

  it('renders occurrence order and truthful preparation states', () => {
    const mounted = mount(PerformanceSessionPlanList, {
      items,
      tracks,
      selectedItemId: 'item-2',
    });
    const rows = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '')
        .split(/\s+/u)
        .includes('performance-session-plan-entry'),
    );

    expect(rows).toHaveLength(3);
    expect(textContent(mounted.root)).toContain('First song');
    expect(textContent(mounted.root)).not.toContain('已確認');
    expect(textContent(mounted.root)).not.toContain('待確認');
    expect(textContent(mounted.root)).toContain('手動');
    expect(textContent(mounted.root)).toContain('音檔缺少');
    expect(String(rows[1].props.class).includes('ui-track--active')).toBe(true);
    mounted.app.unmount();
  });

  it('uses one compact opener per occurrence and emits its edit intents', async () => {
    const onSelect = vi.fn();
    const onMove = vi.fn();
    const onDuplicate = vi.fn();
    const onRemove = vi.fn();
    const mounted = mount(PerformanceSessionPlanList, {
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
    trigger(buttonWithText(body, '複製待播項目'), 'onClick');

    await openItemMenu(mounted.root, '第 2 首「找歌中的曲目」的更多操作');
    trigger(buttonWithText(body, '從待播移除'), 'onClick');

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
    const mounted = mount(PerformanceSessionPlanList, {
      items,
      selectedItemId: 'item-1',
    });

    await openItemMenu(mounted.root, '第 1 首「First song」的更多操作');
    expect(buttonWithText(body, '上移一位').props['aria-disabled']).toBe(
      'true',
    );
    expect(
      buttonWithText(body, '下移一位').props['aria-disabled'],
    ).toBeUndefined();

    await openItemMenu(mounted.root, '第 3 首「Missing audio」的更多操作');
    expect(buttonWithText(body, '下移一位').props['aria-disabled']).toBe(
      'true',
    );
    mounted.app.unmount();
  });

  it('keeps keyboard reordering without making the row draggable', () => {
    const onMove = vi.fn();
    const mounted = mount(PerformanceSessionPlanList, {
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
