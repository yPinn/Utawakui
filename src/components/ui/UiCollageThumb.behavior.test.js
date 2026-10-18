import { createSSRApp, h, nextTick, reactive } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiCollageThumb from './UiCollageThumb.vue';
import Content from './TrackArtworkContent.vue';
import Overlay from './UiArtworkOverlay.vue';
import Loading from './UiArtworkLoading.vue';
import Reveal from './UiArtworkReveal.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';
for (const [component, name] of [
  [UiCollageThumb, 'UiCollageThumb'],
  [Content, 'TrackArtworkContent'],
  [Overlay, 'UiArtworkOverlay'],
  [Loading, 'UiArtworkLoading'],
  [Reveal, 'UiArtworkReveal'],
])
  attachClientRender(component, './' + name + '.vue', import.meta.url, {
    cacheHandlers: name === 'TrackArtworkContent',
  });
const has = (node, name) =>
  String(node.props.class ?? '')
    .split(' ')
    .includes(name);
const images = (root) => findAll(root, (n) => n.type === 'img');
const cells = (root) =>
  findAll(
    root,
    (n) =>
      has(n, 'ui-collage-thumb__cell') &&
      !has(n, 'ui-collage-thumb__cell--empty'),
  );

const PersonGlyph = {
  props: { size: { type: Number, default: 16 } },
  render() {
    return h('svg', { 'data-glyph': 'person', width: this.size });
  },
};

function render(props) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(UiCollageThumb, { size: 136, canCollage: false, ...props }),
    }),
  );
}

describe('UiCollageThumb empty glyph', () => {
  it('keeps the Music glyph as the default no-identity placeholder', async () => {
    const html = await render({});
    expect(html).toContain('ui-collage-thumb__single-empty');
    expect(html).toContain('lucide-music-2');
    expect(html).not.toContain('data-glyph');
  });

  it('lets the caller choose the glyph for its collection type', async () => {
    const html = await render({ emptyIcon: PersonGlyph });
    expect(html).toContain('data-glyph="person"');
    expect(html).toContain('width="54"');
    expect(html).not.toContain('lucide-music-2');
  });

  it('never shows the glyph once there is artwork', async () => {
    const html = await render({
      emptyIcon: PersonGlyph,
      coverUrl:
        'utawakui-media://artist-photo/artist-0123456789abcdef/photo.jpg',
    });
    expect(html).toContain('ui-collage-thumb__custom-image');
    expect(html).not.toContain('data-glyph');
  });
});

describe('UiCollageThumb member artwork fallback', () => {
  it('uses default artwork instead of initials for members without covers', async () => {
    const html = await render({
      canCollage: true,
      tracks: [
        { id: 'member-one', title: '甲' },
        { id: 'member-two', title: '乙' },
      ],
    });

    expect(html.match(/data-track-artwork-kind="fallback"/gu)).toHaveLength(2);
    expect(html).not.toMatch(/>甲<|>乙</u);
  });

  it('uses the same fallback asset for the same track in single and collage modes', async () => {
    const track = { id: 'shared-track', title: '同一首歌' };
    const singleHtml = await render({ canCollage: false, tracks: [track] });
    const collageHtml = await render({
      canCollage: true,
      tracks: [track, { id: 'other-track', title: '其他歌曲' }],
    });
    const fallbackSrc = (html) =>
      html
        .match(
          /<img[^>]*data-track-artwork-kind="fallback"[^>]*src="([^"]+)"|<img[^>]*src="([^"]+)"[^>]*data-track-artwork-kind="fallback"/u,
        )
        ?.slice(1)
        .find(Boolean);

    expect(fallbackSrc(singleHtml)).toBeTruthy();
    expect(fallbackSrc(collageHtml)).toBe(fallbackSrc(singleHtml));
  });
});

describe('UiCollageThumb cached image lifecycle', () => {
  it('keeps explicit cover ownership, updates its source and reveals members only when removed', async () => {
    const props = reactive({
      size: 80,
      coverUrl: '/cover-a.jpg',
      tracks: [{ id: 'a', title: '甲', thumbnailUrl: '/a.jpg' }],
    });
    const m = mount(UiCollageThumb, props),
      cover = images(m.root)[0];
    expect(cells(m.root)).toHaveLength(0);
    props.coverUrl = '/cover-b.jpg';
    await nextTick();
    expect(images(m.root)[0] === cover).toBe(true);
    expect(cover.props.src).toBe('/cover-b.jpg');
    trigger(cover, 'onError');
    await nextTick();
    expect(images(m.root)[0] === cover).toBe(true);
    expect(cells(m.root)).toHaveLength(0);
    props.coverUrl = '';
    await nextTick();
    expect(cells(m.root)).toHaveLength(1);
    expect(images(m.root)[0].props.src).toBe('/a.jpg');
    props.coverUrl = '/cover-c.jpg';
    await nextTick();
    expect(cells(m.root)).toHaveLength(0);
    expect(images(m.root)[0].props.src).toBe('/cover-c.jpg');
    m.app.unmount();
  });
  it('isolates member source errors and preserves keyed neighbours through reorder', async () => {
    const props = reactive({
      size: 80,
      tracks: [
        { id: 'a', title: '甲', thumbnailUrl: '/a.jpg' },
        { id: 'b', title: '乙', thumbnailUrl: '/b.jpg' },
      ],
    });
    const m = mount(UiCollageThumb, props),
      first = cells(m.root)[0],
      neighbour = cells(m.root)[1],
      old = images(first)[0],
      good = images(neighbour)[0];
    props.tracks[0].thumbnailUrl = '/new-a.jpg';
    await nextTick();
    trigger(old, 'onError');
    await nextTick();
    expect(images(first)[0].props.src).toBe('/new-a.jpg');
    trigger(images(first)[0], 'onError');
    await nextTick();
    const fallback = images(first)[0];
    trigger(images(first)[0], 'onError');
    await nextTick();
    expect(images(first)).toHaveLength(0);
    expect(textContent(first)).toBe('甲');
    props.tracks.reverse();
    await nextTick();
    expect(cells(m.root)[0] === neighbour).toBe(true);
    expect(images(neighbour)[0] === good).toBe(true);
    expect(cells(m.root)[1] === first).toBe(true);
    props.tracks[1].thumbnailUrl = '';
    await nextTick();
    props.tracks[1].thumbnailUrl = '/new-a.jpg';
    await nextTick();
    expect(images(first)[0].props['data-track-artwork-kind']).toBe('custom');
    trigger(fallback, 'onError');
    await nextTick();
    expect(images(first)[0].props['data-track-artwork-kind']).toBe('custom');
    m.app.unmount();
  });
  it('switches album/grid/empty without leaking failure state or remounting its overlay', async () => {
    const props = reactive({
      size: 80,
      canCollage: false,
      decorative: false,
      tracks: [
        { id: 'a', title: '甲' },
        { id: 'b', title: '乙' },
      ],
    });
    const phase = reactive({ loading: true });
    const m = mount(UiCollageThumb, props, {
      overlay: () =>
        phase.loading
          ? h(Loading, { label: '集合封面載入中' })
          : h(Reveal, () => h('button', '播放')),
    });
    const plane = findAll(m.root, (n) => has(n, 'ui-artwork-overlay'))[0];
    expect(images(m.root)).toHaveLength(1);
    const fallback = images(m.root)[0].props.src;
    trigger(images(m.root)[0], 'onError');
    await nextTick();
    expect(images(m.root)).toHaveLength(0);
    props.canCollage = true;
    phase.loading = false;
    await nextTick();
    expect(images(m.root)).toHaveLength(2);
    expect(images(m.root)[0].props.src).toBe(fallback);
    expect(
      findAll(m.root, (n) => has(n, 'ui-artwork-overlay'))[0] === plane,
    ).toBe(true);
    expect(findAll(m.root, (n) => n.props.role === 'status')).toHaveLength(0);
    expect(findAll(m.root, (n) => has(n, 'ui-artwork-reveal'))).toHaveLength(1);
    props.tracks = [];
    await nextTick();
    expect(images(m.root)).toHaveLength(0);
    expect(
      findAll(m.root, (n) => has(n, 'ui-collage-thumb__cell--empty')),
    ).toHaveLength(4);
    props.canCollage = false;
    await nextTick();
    expect(
      findAll(m.root, (n) => has(n, 'ui-collage-thumb__single-empty')),
    ).toHaveLength(1);
    m.app.unmount();
  });
  it('bounds member display to four and updates a single album source on the same instance', async () => {
    const props = reactive({
      size: 40,
      canCollage: false,
      tracks: [{ id: 'a', title: '甲', thumbnailUrl: '/a.jpg' }],
    });
    const m = mount(UiCollageThumb, props),
      old = images(m.root)[0];
    props.tracks[0].thumbnailUrl = '/b.jpg';
    await nextTick();
    trigger(old, 'onError');
    await nextTick();
    expect(images(m.root)[0].props.src).toBe('/b.jpg');
    props.tracks = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      title: String(i),
    }));
    props.canCollage = true;
    await nextTick();
    expect(cells(m.root)).toHaveLength(4);
    expect(images(m.root)).toHaveLength(4);
    m.app.unmount();
  });
});
