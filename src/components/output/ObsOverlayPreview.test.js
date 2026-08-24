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
  it('keeps the Lyrics inspection backdrop outside the real overlay iframe', async () => {
    const html = await renderPreview();

    expect(html).toContain('data-backdrop="checker"');
    expect(html).toContain('preview=1');
    expect(html).not.toContain('backdrop=checker');
    expect(html).toContain('obs-streamer-preview');
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
