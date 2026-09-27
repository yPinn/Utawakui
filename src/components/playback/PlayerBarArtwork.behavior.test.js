import { describe, expect, it, vi } from 'vitest';
import PlayerBarArtwork from './PlayerBarArtwork.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, filename] of [
  [PlayerBarArtwork, './PlayerBarArtwork.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const track = {
  id: 'track-1',
  title: '測試歌曲',
  artist: '測試歌手',
  thumbnailUrl: 'utawakui-media://track/track-1/thumbnail.jpg',
};

describe('PlayerBar artwork context action', () => {
  it('exposes a labelled native toggle button and emits activate when context is available', () => {
    const onActivate = vi.fn();
    const { app, root } = mount(PlayerBarArtwork, {
      track,
      expandable: true,
      expanded: false,
      controls: 'studio-library-inspector-content',
      onActivate,
    });
    const buttons = findAll(root, (node) => node.type === 'button');
    const artwork = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('ui-track-thumb'),
    )[0];

    expect(buttons).toHaveLength(1);
    expect(artwork.props.style.width).toBe('48px');
    expect(artwork.props.style.height).toBe('48px');
    expect(buttons[0].props.type).toBe('button');
    expect(buttons[0].props['aria-label']).toBe('展開目前歌曲資料');
    expect(buttons[0].props['aria-expanded']).toBe(false);
    expect(buttons[0].props['aria-controls']).toBe(
      'studio-library-inspector-content',
    );
    trigger(buttons[0], 'onClick');
    expect(onActivate).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('announces the collapse action when the context is already expanded', () => {
    const { app, root } = mount(PlayerBarArtwork, {
      track,
      expandable: true,
      expanded: true,
      controls: 'studio-library-inspector-content',
    });
    const button = findAll(root, (node) => node.type === 'button')[0];

    expect(button.props['aria-label']).toBe('摺疊目前歌曲資料');
    expect(button.props['aria-expanded']).toBe(true);
    expect(button.props['aria-controls']).toBe(
      'studio-library-inspector-content',
    );
    app.unmount();
  });

  it('keeps artwork decorative and non-interactive without a context consumer', () => {
    const onActivate = vi.fn();
    const { app, root } = mount(PlayerBarArtwork, {
      track,
      expandable: false,
      onActivate,
    });

    expect(findAll(root, (node) => node.type === 'button')).toHaveLength(0);
    expect(onActivate).not.toHaveBeenCalled();
    app.unmount();
  });
});
