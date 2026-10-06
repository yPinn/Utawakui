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
    expect(html).toContain('lucide-music2');
    expect(html).not.toContain('data-glyph');
  });

  it('lets the caller choose the glyph for its collection type', async () => {
    const html = await render({ emptyIcon: PersonGlyph });
    expect(html).toContain('data-glyph="person"');
    expect(html).toContain('width="54"');
    expect(html).not.toContain('lucide-music2');
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
