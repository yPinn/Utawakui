import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { h, nextTick, reactive } from 'vue';
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
  { cacheHandlers: true },
);

const images = (root) => findAll(root, (node) => node.type === 'img');

describe('UiTrackThumb artwork fallback', () => {
  it('supports title-only and anonymous identities without requiring a track id', async () => {
    for (const track of [{ title: '沒有識別碼' }, {}]) {
      const m = mount(UiTrackThumb, { track, size: 40 });
      expect(images(m.root)[0].props['data-track-artwork-kind']).toBe(
        'fallback',
      );
      trigger(images(m.root)[0], 'onError');
      await nextTick();
      expect(images(m.root)).toHaveLength(0);
      m.app.unmount();
    }
    const html = await renderToString(
      createSSRApp(UiTrackThumb, { track: { title: '標題' }, size: 40 }),
    );
    expect(html).toContain('data-track-artwork-kind="fallback"');
  });
  it('ignores errors from a detached fallback after identity/source recovery', async () => {
    const props = reactive({ track: { id: 'a', title: '原曲目' }, size: 40 });
    const m = mount(UiTrackThumb, props);
    const old = images(m.root)[0];
    props.track = { id: 'b', title: '新曲目', thumbnailUrl: '/new.jpg' };
    await nextTick();
    trigger(old, 'onError');
    await nextTick();
    expect(images(m.root)[0].props.src).toBe('/new.jpg');
    trigger(images(m.root)[0], 'onError');
    await nextTick();
    expect(images(m.root)[0].props['data-track-artwork-kind']).toBe('fallback');
    m.app.unmount();
  });
  it('preserves the empty slot and sizing contract across track removal/restoration', async () => {
    const props = reactive({
      track: undefined,
      size: 40,
      loading: 'lazy',
      decoding: 'async',
    });
    const m = mount(UiTrackThumb, props, {
      default: () => h('span', '無曲目'),
    });
    expect(images(m.root)).toHaveLength(0);
    expect(textContent(m.root)).toContain('無曲目');
    props.track = { id: 'a', title: '曲目', thumbnailUrl: '/a.jpg' };
    await nextTick();
    let image = images(m.root)[0];
    expect(image.props.loading).toBe('lazy');
    expect(image.props.decoding).toBe('async');
    trigger(image, 'onError');
    await nextTick();
    props.track = undefined;
    await nextTick();
    expect(images(m.root)).toHaveLength(0);
    props.track = { id: 'a', title: '曲目', thumbnailUrl: '/a.jpg' };
    props.loading = 'eager';
    props.decoding = 'sync';
    props.size = 'var(--ui-artwork-size-lg)';
    await nextTick();
    image = images(m.root)[0];
    expect(image.props.src).toBe('/a.jpg');
    expect(image.props.loading).toBe('eager');
    expect(image.props.decoding).toBe('sync');
    m.app.unmount();
  });
  it('ignores a detached custom error after the same track switches sources', async () => {
    const props = reactive({
      track: { id: 'same', title: '曲目', thumbnailUrl: '/a.jpg' },
      size: 40,
    });
    const m = mount(UiTrackThumb, props);
    const a = images(m.root)[0];
    props.track.thumbnailUrl = '/b.jpg';
    await nextTick();
    const b = images(m.root)[0];
    trigger(a, 'onError');
    await nextTick();
    expect(images(m.root)[0].props.src).toBe('/b.jpg');
    trigger(b, 'onError');
    await nextTick();
    const fallback = images(m.root)[0];
    expect(fallback.props['data-track-artwork-kind']).toBe('fallback');
    trigger(b, 'onError');
    await nextTick();
    expect(images(m.root)[0].props.src).toBe(fallback.props.src);
    m.app.unmount();
  });
  it('retries an explicitly removed and restored URL without accepting errors from the old attempt', async () => {
    const props = reactive({
      track: { id: 'retry', title: '重試', thumbnailUrl: '/retry.jpg' },
      size: 64,
    });
    const m = mount(UiTrackThumb, props);
    const old = images(m.root)[0];
    trigger(old, 'onError');
    await nextTick();
    props.track.thumbnailUrl = '';
    await nextTick();
    props.track.thumbnailUrl = '/retry.jpg';
    await nextTick();
    expect(images(m.root)[0].props['data-track-artwork-kind']).toBe('custom');
    expect(images(m.root)[0].props.src).toBe('/retry.jpg');
    trigger(old, 'onError');
    await nextTick();
    expect(images(m.root)[0].props['data-track-artwork-kind']).toBe('custom');
    m.app.unmount();
  });
  it('retains known fallback failures until identity changes, while custom sources can recover', async () => {
    const props = reactive({
      track: { id: 'a', title: 'A', thumbnailUrl: '/a.jpg' },
      size: 40,
    });
    const m = mount(UiTrackThumb, props);
    trigger(images(m.root)[0], 'onError');
    await nextTick();
    trigger(images(m.root)[0], 'onError');
    await nextTick();
    expect(images(m.root)).toHaveLength(0);
    props.track.title = 'A revised';
    await nextTick();
    expect(images(m.root)).toHaveLength(0);
    expect(textContent(m.root)).toContain('A');
    props.track.thumbnailUrl = '/b.jpg';
    await nextTick();
    expect(images(m.root)[0].props['data-track-artwork-kind']).toBe('custom');
    trigger(images(m.root)[0], 'onError');
    await nextTick();
    expect(images(m.root)).toHaveLength(0);
    props.track = { id: 'c', title: 'C', thumbnailUrl: '/b.jpg' };
    await nextTick();
    expect(images(m.root)[0].props['data-track-artwork-kind']).toBe('custom');
    trigger(images(m.root)[0], 'onError');
    await nextTick();
    expect(images(m.root)[0].props['data-track-artwork-kind']).toBe('fallback');
    m.app.unmount();
  });
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
