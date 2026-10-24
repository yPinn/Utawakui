import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiTooltip from '../ui/UiTooltip.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
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
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
  [UiTooltip, '../ui/UiTooltip.vue'],
  [UiSearchBox, '../ui/UiSearchBox.vue'],
  [UiActionMenu, '../ui/UiActionMenu.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [TrackActionMenu, './TrackActionMenu.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const queuePanelSource = readFileSync(
  new URL('../queue/QueuePanel.vue', import.meta.url),
  'utf8',
);
const libraryBrowseSource = readFileSync(
  new URL('../library/LibraryBrowseContent.vue', import.meta.url),
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
    addEventListener: (name, handler) => {
      const listeners = windowListeners.get(name) ?? new Set();
      listeners.add(handler);
      windowListeners.set(name, listeners);
    },
    removeEventListener: (name, handler) => {
      windowListeners.get(name)?.delete(handler);
    },
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
      .includes('ui-action-menu'),
  );
}

function buttonByText(label) {
  return menuButtons().find((button) => textContent(button).includes(label));
}

function dispatchWindow(name, event) {
  for (const listener of windowListeners.get(name) ?? []) listener(event);
}

function scrollEvent(target) {
  const path = [];
  let current = target;
  while (current) {
    path.push(current);
    current = current.parent;
  }
  return { target, composedPath: () => path };
}

describe('TrackActionMenu behavior model', () => {
  it('offers explicit local single creation and never offers it for a provider track', () => {
    const local = mount(TrackActionMenu, { open: true, track });
    expect(buttonByText('建立本機單曲')).toBeTruthy();
    local.app.unmount();
    const provider = mount(TrackActionMenu, {
      open: true,
      track: { ...track, sourceType: 'provider' },
    });
    expect(buttonByText('建立本機單曲')).toBeUndefined();
    provider.app.unmount();
  });
  it('lists every verified containing release without replacing the current source', async () => {
    window.Utawakui = {
      getTrackReleases: vi.fn(() =>
        Promise.resolve({
          status: 'ok',
          libraryEpoch: 1,
          releases: [
            { id: 'single', name: 'RASEN Single', type: 'single', revision: 1 },
            { id: 'album', name: 'RASEN Album', type: 'album', revision: 2 },
          ],
        }),
      ),
    };
    const onSelect = vi.fn();
    const mounted = mount(TrackActionMenu, { open: true, track, onSelect });
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    await nextTick();
    trigger(buttonByText('收錄於'), 'onMouseenter');
    await nextTick();
    trigger(buttonByText('RASEN Album'), 'onClick');
    await nextTick();
    expect(onSelect.mock.calls[0][0]).toEqual({
      action: 'go-to-release',
      collectionId: 'album',
    });
    mounted.app.unmount();
  });
  it('offers one editing entry and confines unlinking to the current editor context', async () => {
    let mounted = mount(TrackActionMenu, {
      open: true,
      track: { ...track, sourceType: 'local-file' },
    });
    expect(buttonByText('整理歌曲')).toBeTruthy();
    expect(buttonByText('編輯歌曲')).toBeUndefined();
    expect(buttonByText('解除連結')).toBeUndefined();
    mounted.app.unmount();
    const onSelect = vi.fn();
    mounted = mount(TrackActionMenu, {
      open: true,
      track,
      context: 'editor',
      canUnlinkWork: true,
      onSelect,
    });
    expect(buttonByText('整理歌曲')).toBeUndefined();
    trigger(buttonByText('解除連結'), 'onClick');
    await nextTick();
    expect(onSelect).toHaveBeenCalledWith(
      { action: 'unlink-work' },
      expect.anything(),
    );
    mounted.app.unmount();
  });
  it.each(['local-file', 'provider'])(
    'opens work organization for %s tracks',
    async (sourceType) => {
      const onSelect = vi.fn();
      const mounted = mount(TrackActionMenu, {
        open: true,
        track: { ...track, sourceType },
        onSelect,
      });
      const action = buttonByText('整理歌曲');
      expect(action).toBeTruthy();
      trigger(action, 'onClick');
      await nextTick();
      expect(onSelect).toHaveBeenCalledWith(
        { action: 'work-organization' },
        expect.anything(),
      );
      mounted.app.unmount();
    },
  );
  it.each(['default', 'current', 'queued', 'source', 'recent'])(
    'allows another performance occurrence for an already playing/queued track in %s',
    async (context) => {
      const onSelect = vi.fn();
      const props = {
        open: true,
        track,
        context,
        currentTrackId: track.id,
        queuedTrackIds: [track.id],
        onSelect,
      };
      const mounted = mount(TrackActionMenu, props);
      const action = buttonByText('加入演出待唱');
      expect(action.props['aria-disabled']).not.toBe('true');
      trigger(action, 'onClick', {});
      await nextTick();
      expect(onSelect.mock.calls[0][0]).toEqual({
        action: 'add-to-performance-queue',
      });
      mounted.app.unmount();
    },
  );

  it('disables the performance destination during a save', () => {
    const mounted = mount(TrackActionMenu, {
      open: true,
      track,
      performanceQueueBusy: true,
    });
    expect(buttonByText('加入演出待唱').props['aria-disabled']).toBe('true');
    mounted.app.unmount();
  });
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
    trigger(menuButtons()[0], 'onKeydown', {
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
    dispatchWindow('scroll', scrollEvent(menus[1]));
    expect(onClose).not.toHaveBeenCalled();

    dispatchWindow('scroll', scrollEvent(hostNode('main')));
    expect(onClose).toHaveBeenCalledOnce();
    mounted.app.unmount();
  });

  it('anchors the submenu surface to its parent row with a token-sized side gap', async () => {
    window.innerWidth = 500;
    const mounted = mount(TrackActionMenu, {
      open: true,
      anchor: { kind: 'point', x: 260, y: 32 },
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

    expect(submenu.props.style.left).toBe('12px');
    expect(submenu.props.style.top).toBe('78px');

    const rootMenuViewport = findAll(body, (node) =>
      String(node.props?.class ?? '').includes('ui-action-menu__viewport'),
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
    dispatchWindow('scroll', scrollEvent(rootMenuViewport));
    await nextTick();

    expect(submenu.props.style.top).toBe('62px');
    mounted.app.unmount();
  });

  it('shrinks the submenu before overlapping its parent in a narrow viewport', async () => {
    window.innerWidth = 424;
    const mounted = mount(TrackActionMenu, {
      open: true,
      anchor: { kind: 'point', x: 196, y: 32 },
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
    expect(submenu.props.style.width).toBe('180px');
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
        '加入一般佇列',
        '加入播放清單',
        '整理歌曲',
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
    expect(menuButtons().map(textContent)).toContain('從一般佇列移除');
    expect(textContent(body)).not.toContain('加入一般佇列');
    queuedMenu.app.unmount();
  });

  it('adds the destructive library action only when the owner allows it', () => {
    const defaultMenu = mount(TrackActionMenu, {
      open: true,
      track,
      playlists,
    });
    expect(textContent(body)).not.toContain('刪除曲目');
    defaultMenu.app.unmount();

    body.children = [];
    const libraryMenu = mount(TrackActionMenu, {
      open: true,
      track,
      playlists,
      canDelete: true,
    });
    const deleteButton = buttonByText('刪除曲目');
    expect(deleteButton).toBeDefined();
    expect(deleteButton.props.class).toContain('ui-action-menu__item--danger');
    libraryMenu.app.unmount();
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
    expect(textContent(body)).toContain('建立新播放清單');
    expect(textContent(body)).toContain('夜間歌單');
    expect(textContent(body)).toContain('工作用');
    expect(textContent(body)).not.toContain('已包含');
    expect(textContent(body)).not.toContain('來源專輯');

    trigger(input, 'onInput', { target: { value: ' 夜間 ' } });
    await nextTick();
    expect(textContent(body)).toContain('建立新播放清單');
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

    expect(textContent(body)).toContain('建立新播放清單');
    expect(textContent(body)).toContain('找不到播放清單');
    const submenu = findAll(body, (node) => node.props.role === 'menu')[1];
    expect(
      findAll(submenu, (node) => node.props.role === 'separator'),
    ).toHaveLength(0);
    mounted.app.unmount();
  });

  it('delegates filtering, pinned actions, scrolling, and empty state to the shared recipe', () => {
    expect(trackActionMenuSource).toContain("kind: 'filterable-actions'");
    expect(trackActionMenuSource).not.toContain('UiSearchBox');
    expect(trackActionMenuSource).not.toContain('playlistQuery');
    expect(trackActionMenuSource).not.toContain('submenu-leading');
    expect(trackActionMenuSource).not.toContain('submenu-trailing');
    expect(trackActionMenuSource).not.toContain('<style');
  });
});

describe('TrackActionMenu ownership', () => {
  it('is shared by Library and Right Dock without duplicating destination assembly', () => {
    for (const ownerSource of [libraryBrowseSource, queuePanelSource]) {
      expect(ownerSource).toContain('TrackActionMenu');
      expect(ownerSource).not.toContain('addToPlaylistTargets');
      expect(ownerSource).not.toContain("label: '新增至播放清單'");
      expect(ownerSource).not.toContain('const playlistChildren =');
    }
  });
});
