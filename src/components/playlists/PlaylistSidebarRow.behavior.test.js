import { describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import PlaylistSidebarRow from './PlaylistSidebarRow.vue';

vi.stubGlobal('requestAnimationFrame', (callback) => {
  callback();
  return 1;
});
vi.stubGlobal('cancelAnimationFrame', vi.fn());
vi.stubGlobal('document', { fonts: undefined });

for (const [component, filename] of [
  [PlaylistSidebarRow, './PlaylistSidebarRow.vue'],
  [UiCollageThumb, '../ui/UiCollageThumb.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const playlist = {
  id: 'playlist-one',
  kind: 'playlist',
  name: '夜間歌單',
};

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
});
