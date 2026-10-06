import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiTrackRow from './UiTrackRow.vue';

function render(props, slots) {
  return renderToString(
    createSSRApp({ render: () => h(UiTrackRow, props, slots) }),
  );
}

describe('UiTrackRow artist lane', () => {
  it('keeps the plain artist text when no caller content is provided', async () => {
    const html = await render({
      track: { id: 'a', title: '夜に駆ける', artist: 'YOASOBI' },
    });
    expect(html).toMatch(/class="ui-track__artist"[^>]*>(<!--\[-->)?YOASOBI/u);
  });

  it('lets the caller replace only the artist lane content', async () => {
    const html = await render(
      { track: { id: 'a', title: '夜に駆ける', artist: 'YOASOBI' } },
      { artist: () => h('button', { class: 'caller-artist' }, 'YOASOBI') },
    );
    expect(html).toMatch(/class="ui-track__artist"[^>]*>.*caller-artist/su);
    expect(html).toContain('ui-track__title');
  });

  it('renders no artist lane without an artist', async () => {
    const html = await render(
      { track: { id: 'a', title: '無演出者' } },
      { artist: () => h('button', { class: 'caller-artist' }) },
    );
    expect(html).not.toContain('ui-track__artist');
    expect(html).not.toContain('caller-artist');
  });
});
