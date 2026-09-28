import { readFileSync } from 'node:fs';
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
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import PlaylistSidebarRow from './PlaylistSidebarRow.vue';

for (const [component, filename] of [
  [PlaylistSidebarRow, './PlaylistSidebarRow.vue'],
  [UiCollageThumb, '../ui/UiCollageThumb.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const playlist = {
  id: 'playlist-one',
  kind: 'playlist',
  name: '夜間歌單',
};
const source = readFileSync(
  new URL('./PlaylistSidebarRow.vue', import.meta.url),
  'utf8',
);

let body;

beforeEach(() => {
  vi.useFakeTimers();
  body = hostNode('body');
  vi.stubGlobal('document', {
    fonts: undefined,
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

describe('PlaylistSidebarRow aligned collection interaction', () => {
  it('uses the shared 40px artwork size inside the 52px sidebar row', () => {
    const mounted = mount(PlaylistSidebarRow, {
      playlist,
      subtitle: '播放清單',
    });
    const row = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes('playlist-sidebar-row'),
    )[0];
    const thumb = findAll(row, (node) =>
      String(node.props?.class ?? '').includes('ui-collage-thumb'),
    )[0];

    expect(thumb.props.style.width).toBe('40px');
    expect(thumb.props.style.height).toBe('40px');
    mounted.app.unmount();
  });

  it('renders a stable ellipsis label without delayed marquee measurement', () => {
    const mounted = mount(PlaylistSidebarRow, {
      playlist,
      subtitle: '播放清單',
    });
    const name = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes('playlist-sidebar-row__name'),
    )[0];

    expect(name.type).toBe('span');
    expect(name.children[0].text).toBe('夜間歌單');
    mounted.app.unmount();
  });

  it('selects on one click and plays on row double-click or artwork click', () => {
    const select = vi.fn();
    const togglePlayback = vi.fn();
    const mounted = mount(PlaylistSidebarRow, {
      playlist,
      subtitle: '播放清單',
      onSelect: select,
      onTogglePlayback: togglePlayback,
    });
    const row = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes('playlist-sidebar-row'),
    )[0];
    const selectButton = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes('playlist-sidebar-row__select'),
    )[0];
    const playButton = findAll(
      mounted.root,
      (node) =>
        node.type === 'button' &&
        String(node.props?.class ?? '').includes('playlist-sidebar-row__play'),
    )[0];
    const selectStop = vi.fn();
    const doubleStop = vi.fn();
    const artworkFirstStop = vi.fn();
    const artworkSecondStop = vi.fn();

    expect(playButton.props['aria-label']).toBeUndefined();
    expect(textContent(playButton)).toContain('播放 夜間歌單');
    expect(row.props.title).toBeUndefined();
    expect(selectButton.props.title).toBeUndefined();
    expect(source).not.toContain('tooltip-placement="end"');

    trigger(selectButton, 'onClick', { stopPropagation: selectStop });
    trigger(selectButton, 'onDblclick', { stopPropagation: doubleStop });
    trigger(playButton, 'onClick', {
      detail: 1,
      stopPropagation: artworkFirstStop,
    });
    trigger(playButton, 'onClick', {
      detail: 2,
      stopPropagation: artworkSecondStop,
    });

    expect(select).toHaveBeenCalledOnce();
    expect(togglePlayback).toHaveBeenCalledTimes(2);
    expect(togglePlayback).toHaveBeenNthCalledWith(1, expect.any(Object));
    expect(togglePlayback).toHaveBeenNthCalledWith(2, expect.any(Object));
    expect(selectStop).toHaveBeenCalledOnce();
    expect(doubleStop).toHaveBeenCalledOnce();
    expect(artworkFirstStop).toHaveBeenCalledOnce();
    expect(artworkSecondStop).toHaveBeenCalledOnce();
    mounted.app.unmount();
  });

  it('binds compact collection information to the whole item and places it on the logical end side', async () => {
    const mounted = mount(PlaylistSidebarRow, {
      playlist: {
        id: 'album-one',
        kind: 'album',
        name: '青見＋Piin',
      },
      subtitle: '專輯・Spotify',
      compact: true,
    });
    const row = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes('playlist-sidebar-row'),
    )[0];

    trigger(row, 'onPointerenter', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(500);
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

    expect(tooltip.props['data-placement']).toBe('end');
    expect(textContent(label)).toBe('青見＋Piin');
    expect(textContent(detail)).toBe('專輯・Spotify');
    mounted.app.unmount();
  });

  it('keeps expanded collection hover silent and owns the top tooltip on the real playback button', async () => {
    const mounted = mount(PlaylistSidebarRow, {
      playlist,
      subtitle: '播放清單',
      compact: false,
    });
    const row = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes('playlist-sidebar-row'),
    )[0];
    const playButton = findAll(
      mounted.root,
      (node) =>
        node.type === 'button' &&
        String(node.props?.class ?? '').includes('playlist-sidebar-row__play'),
    )[0];

    trigger(row, 'onPointerenter', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(500);
    await nextTick();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      0,
    );

    trigger(playButton, 'onFocusin');
    await nextTick();
    const tooltip = findAll(body, (node) => node.props.role === 'tooltip')[0];
    expect(textContent(tooltip)).toBe('播放 夜間歌單');
    expect(tooltip.props['data-placement']).toBe('top');
    mounted.app.unmount();
  });
});
