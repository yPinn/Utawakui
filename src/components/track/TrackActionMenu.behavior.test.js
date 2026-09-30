import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UiContextMenu from '../ui/UiContextMenu.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import TrackActionMenu from './TrackActionMenu.vue';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, filename] of [
  [UiSearchBox, '../ui/UiSearchBox.vue'],
  [UiContextMenu, '../ui/UiContextMenu.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [TrackActionMenu, './TrackActionMenu.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const queuePanelSource = readFileSync(
  new URL('../queue/QueuePanel.vue', import.meta.url),
  'utf8',
);
const setlistSource = readFileSync(
  new URL('../../views/SetlistView.vue', import.meta.url),
  'utf8',
);
const trackActionMenuSource = readFileSync(
  new URL('./TrackActionMenu.vue', import.meta.url),
  'utf8',
);

let body;
let windowListeners;
let focusOrigin;

beforeEach(() => {
  body = hostNode('body');
  windowListeners = new Map();
  focusOrigin = hostNode('button');
  focusOrigin.isConnected = true;
  vi.stubGlobal('document', {
    activeElement: focusOrigin,
    body,
    documentElement: hostNode('html'),
    querySelector: (selector) => (selector === 'body' ? body : null),
  });
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: (name, handler) => windowListeners.set(name, handler),
    removeEventListener: (name) => windowListeners.delete(name),
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

const track = {
  id: 'track-1',
  title: '夜色',
  artist: '測試歌手',
  sourceType: 'local-file',
};

const playlists = [
  {
    id: 'contains-track',
    name: '已包含',
    kind: 'playlist',
    trackIds: ['track-1'],
  },
  { id: 'night', name: '夜間歌單', kind: 'playlist', trackIds: [] },
  { id: 'work', name: '工作用', kind: 'playlist', trackIds: [] },
  { id: 'album', name: '來源專輯', kind: 'album', trackIds: ['track-1'] },
];

function menuButtons() {
  return findAll(body, (node) => node.type === 'button');
}

function menuSurfaces() {
  return findAll(body, (node) =>
    String(node.props?.class ?? '')
      .split(/\s+/u)
      .includes('ui-context-menu'),
  );
}

function buttonByText(label) {
  return menuButtons().find((button) => textContent(button).includes(label));
}

describe('TrackActionMenu behavior model', () => {
  it('names the menu and restores its origin when Escape closes the stack', () => {
    const onClose = vi.fn();
    const mounted = mount(TrackActionMenu, {
      open: true,
      track,
      playlists,
      onClose,
    });
    const rootMenu = findAll(body, (node) => node.props.role === 'menu')[0];

    expect(rootMenu.props['aria-label']).toBe('曲目操作');
    windowListeners.get('keydown')?.({
      key: 'Escape',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(onClose).toHaveBeenCalledOnce();
    expect(focusOrigin.focus).toHaveBeenCalledOnce();
    mounted.app.unmount();
  });

  it('keeps picker scrolling open and closes only for external scrolling', async () => {
    const onClose = vi.fn();
    const mounted = mount(TrackActionMenu, {
      open: true,
      track,
      playlists,
      onClose,
    });
    trigger(buttonByText('加入播放清單'), 'onMouseenter');
    await nextTick();

    const menus = findAll(body, (node) => node.props.role === 'menu');
    expect(onClose).not.toHaveBeenCalled();
    expect(menus[0].contains(menus[1])).toBe(true);
    windowListeners.get('scroll')?.({ target: menus[1] });
    expect(onClose).not.toHaveBeenCalled();

    windowListeners.get('scroll')?.({ target: hostNode('main') });
    expect(onClose).toHaveBeenCalledOnce();
    mounted.app.unmount();
  });

  it('anchors the submenu surface to its parent row with a token-sized side gap', async () => {
    window.innerWidth = 500;
    const mounted = mount(TrackActionMenu, {
      open: true,
      x: 260,
      y: 32,
      track,
      playlists,
    });
    const rootMenu = menuSurfaces()[0];
    const parentItem = buttonByText('加入播放清單');
    rootMenu.getBoundingClientRect = () => ({
      left: 260,
      top: 32,
      right: 480,
      bottom: 160,
      width: 220,
      height: 128,
    });
    parentItem.getBoundingClientRect = () => ({
      left: 264,
      top: 78,
      right: 476,
      bottom: 110,
      width: 212,
      height: 32,
    });

    trigger(parentItem, 'onMouseenter');
    await nextTick();
    const submenu = menuSurfaces()[1];

    expect(submenu.props.style.left).toBe('36px');
    expect(submenu.props.style.top).toBe('78px');

    const rootMenuViewport = findAll(
      body,
      (node) => node.props.role === 'menu',
    )[0];
    rootMenuViewport.scrollTop = 16;
    parentItem.getBoundingClientRect = () => ({
      left: 264,
      top: 62,
      right: 476,
      bottom: 94,
      width: 212,
      height: 32,
    });
    windowListeners.get('scroll')?.({ target: rootMenuViewport });
    await nextTick();

    expect(submenu.props.style.top).toBe('62px');
    mounted.app.unmount();
  });

  it('shrinks the submenu before overlapping its parent in a narrow viewport', async () => {
    window.innerWidth = 424;
    const mounted = mount(TrackActionMenu, {
      open: true,
      x: 196,
      y: 32,
      track,
      playlists,
    });
    const rootMenu = menuSurfaces()[0];
    const parentItem = buttonByText('加入播放清單');
    rootMenu.getBoundingClientRect = () => ({
      left: 196,
      top: 32,
      right: 416,
      bottom: 160,
      width: 220,
      height: 128,
    });
    parentItem.getBoundingClientRect = () => ({
      left: 200,
      top: 78,
      right: 412,
      bottom: 110,
      width: 212,
      height: 32,
    });

    trigger(parentItem, 'onMouseenter');
    await nextTick();
    const submenu = menuSurfaces()[1];

    expect(submenu.props.style.left).toBe('8px');
    expect(submenu.props.style.width).toBe('184px');
    expect(submenu.props.style.top).toBe('78px');
    mounted.app.unmount();
  });

  it('uses concise labels and switches only the immediate queue command by context', () => {
    const defaultMenu = mount(TrackActionMenu, {
      open: true,
      track,
      playlists,
      canGoToAlbum: true,
    });

    expect(menuButtons().map(textContent)).toEqual(
      expect.arrayContaining([
        '加入佇列',
        '加入播放清單',
        '編輯資訊',
        '前往專輯',
      ]),
    );
    expect(textContent(body)).not.toContain('新增至播放清單');
    defaultMenu.app.unmount();

    body.children = [];
    const queuedMenu = mount(TrackActionMenu, {
      open: true,
      track,
      context: 'queued',
      playlists,
    });
    expect(menuButtons().map(textContent)).toContain('從佇列移除');
    expect(textContent(body)).not.toContain('加入佇列');
    queuedMenu.app.unmount();
  });

  it('opens a searchable destination picker while keeping create visible', async () => {
    const onSelect = vi.fn();
    const mounted = mount(TrackActionMenu, {
      open: true,
      track,
      playlists,
      onSelect,
    });

    trigger(buttonByText('加入播放清單'), 'onMouseenter');
    await nextTick();

    const input = findAll(body, (node) => node.type === 'input')[0];
    expect(input.props).toMatchObject({
      type: 'search',
      placeholder: '搜尋播放清單',
    });
    expect(textContent(body)).toContain('新增歌單');
    expect(textContent(body)).toContain('夜間歌單');
    expect(textContent(body)).toContain('工作用');
    expect(textContent(body)).not.toContain('已包含');
    expect(textContent(body)).not.toContain('來源專輯');

    trigger(input, 'onInput', { target: { value: ' 夜間 ' } });
    await nextTick();
    expect(textContent(body)).toContain('新增歌單');
    expect(textContent(body)).toContain('夜間歌單');
    expect(textContent(body)).not.toContain('工作用');

    trigger(buttonByText('夜間歌單'), 'onClick');
    expect(onSelect).toHaveBeenCalledWith(
      { action: 'add-to-playlist', playlistId: 'night' },
      expect.objectContaining({ label: '夜間歌單' }),
    );
    mounted.app.unmount();
  });

  it('shows a bounded empty result without hiding the create intent', async () => {
    const mounted = mount(TrackActionMenu, {
      open: true,
      track,
      playlists,
    });
    trigger(buttonByText('加入播放清單'), 'onMouseenter');
    await nextTick();

    const input = findAll(body, (node) => node.type === 'input')[0];
    trigger(input, 'onInput', { target: { value: '不存在' } });
    await nextTick();

    expect(textContent(body)).toContain('新增歌單');
    expect(textContent(body)).toContain('找不到播放清單');
    const submenu = findAll(body, (node) => node.props.role === 'menu')[1];
    expect(
      findAll(submenu, (node) => node.props.role === 'separator'),
    ).toHaveLength(1);
    mounted.app.unmount();
  });

  it('uses the shared spacing token between search and menu action groups', () => {
    expect(trackActionMenuSource).toMatch(
      /\.track-action-menu__search\s*\{[^}]*margin-block-end:\s*var\(--ui-space-1\)/s,
    );
    expect(trackActionMenuSource).not.toMatch(
      /\.track-action-menu__(?:search|empty)\s*\{[^}]*(?:margin|gap|padding)[^}]*\b\d+px\b/s,
    );
  });
});

describe('TrackActionMenu ownership', () => {
  it('is shared by Setlist and Right Dock without duplicating destination assembly', () => {
    for (const ownerSource of [setlistSource, queuePanelSource]) {
      expect(ownerSource).toContain('TrackActionMenu');
      expect(ownerSource).not.toContain('addToPlaylistTargets');
      expect(ownerSource).not.toContain("label: '新增至播放清單'");
      expect(ownerSource).not.toContain('const playlistChildren =');
    }
  });
});
