import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import TrackArtworkContent from './TrackArtworkContent.vue';
import UiTrackThumb from './UiTrackThumb.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';

attachClientRender(UiTrackThumb, './UiTrackThumb.vue', import.meta.url);
attachClientRender(
  TrackArtworkContent,
  './TrackArtworkContent.vue',
  import.meta.url,
);

const images = (root) => findAll(root, (node) => node.type === 'img');

describe('UiTrackThumb artwork fallback', () => {
  it('uses a stable default artwork asset when a track has no cover', () => {
    const track = { id: 'track-without-cover', title: '沒有封面的歌' };
    const first = mount(UiTrackThumb, { track, size: 40 });
    const second = mount(UiTrackThumb, { track, size: 64 });

    expect(images(first.root)).toHaveLength(1);
    expect(images(first.root)[0].props['data-track-artwork-kind']).toBe(
      'fallback',
    );
    expect(images(first.root)[0].props.src).toBe(
      images(second.root)[0].props.src,
    );
    expect(textContent(first.root)).not.toContain('沒');

    first.app.unmount();
    second.app.unmount();
  });

  it('falls from a failed custom cover to default artwork, then to the initial', async () => {
    const { app, root } = mount(UiTrackThumb, {
      track: {
        id: 'broken-cover',
        title: '錯誤封面',
        thumbnailUrl: '/missing-custom-cover.jpg',
      },
      size: 40,
      loading: 'lazy',
      decoding: 'async',
    });

    const customImage = images(root)[0];
    expect(customImage.props.src).toBe('/missing-custom-cover.jpg');
    expect(customImage.props['data-track-artwork-kind']).toBe('custom');
    expect(customImage.props.loading).toBe('lazy');
    expect(customImage.props.decoding).toBe('async');

    trigger(customImage, 'onError');
    await nextTick();

    const fallbackImage = images(root)[0];
    expect(fallbackImage.props.src).not.toBe('/missing-custom-cover.jpg');
    expect(fallbackImage.props['data-track-artwork-kind']).toBe('fallback');
    expect(fallbackImage.props.loading).toBe('lazy');
    expect(fallbackImage.props.decoding).toBe('async');
    expect(textContent(root)).not.toContain('錯');

    trigger(fallbackImage, 'onError');
    await nextTick();

    expect(images(root)).toHaveLength(0);
    expect(textContent(root)).toContain('錯');
    app.unmount();
  });
});
