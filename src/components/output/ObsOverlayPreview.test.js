import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import ObsOverlayPreview from './ObsOverlayPreview.vue';

function renderPreview(props = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(ObsOverlayPreview, {
          preset: { tone: 'stage', preview: { title: 'Live Stage' } },
          activeKind: 'lyrics',
          previewUrl: 'http://127.0.0.1:8700/overlay/lyrics?preview=1',
          ...props,
        }),
    }),
  );
}

describe('ObsOverlayPreview', () => {
  it('uses a fresh inspection URL for every Workbench preview mount', async () => {
    const firstHtml = await renderPreview();
    const secondHtml = await renderPreview();
    const iframeSrc = (html) =>
      html.match(/<iframe[^>]+src="([^"]+)"/)?.[1] ?? null;

    expect(iframeSrc(secondHtml)).not.toBe(iframeSrc(firstHtml));
  });

  it('composes one direct Lyrics iframe above the renderer-owned guide', async () => {
    const html = await renderPreview();

    expect(html).toContain('data-backdrop="checker"');
    expect(html).toMatch(
      /src="http:\/\/127\.0\.0\.1:8700\/overlay\/lyrics\?workbench=1&amp;backdrop=checker&amp;reload=\d+"/,
    );
    expect(html).not.toContain('obs-streamer-preview');
    expect(html.match(/<iframe/g)).toHaveLength(1);
    expect(html).not.toContain('/workbench/lyrics');
  });

  it('keeps the inspection backdrop query for widget capture previews', async () => {
    const html = await renderPreview({
      activeKind: 'artwork',
      captureSize: 'small',
      supportedCaptureSizes: ['small'],
      previewUrl: 'http://127.0.0.1:8700/overlay/artwork',
    });

    expect(html).toContain('backdrop=checker');
  });
});
