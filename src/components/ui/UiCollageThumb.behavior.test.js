import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiCollageThumb from './UiCollageThumb.vue';

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
