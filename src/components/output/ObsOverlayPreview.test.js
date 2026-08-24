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
  it('uses the isolated Lyrics workbench document for backdrop and guide composition', async () => {
    const html = await renderPreview();

    expect(html).toContain('data-backdrop="checker"');
    expect(html).toContain(
      'src="http://127.0.0.1:8700/workbench/lyrics?backdrop=checker"',
    );
    expect(html).not.toContain('obs-streamer-preview');
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
