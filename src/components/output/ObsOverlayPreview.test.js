import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
      /src="http:\/\/127\.0\.0\.1:8700\/overlay\/lyrics\?workbench=1&amp;lyricsDebug=1&amp;backdrop=checker&amp;reload=\d+"/,
    );
    expect(html).not.toContain('obs-streamer-preview');
    expect(html.match(/<iframe/g)).toHaveLength(1);
    expect(html).not.toContain('/workbench/lyrics');
    expect(html).toContain('class="obs-overlay-preview__capture-meta"');
    expect(html).toContain('固定');
    expect(html).toContain('1920 × 1080');
  });

  it('keeps icon-only preview actions on the icon button contract', async () => {
    const html = await renderPreview({
      obsUrl: 'http://127.0.0.1:8700/overlay/lyrics',
    });

    expect(html).toContain('class="ui-icon-btn');
    expect(html).toContain('>複製 Browser Source URL</span>');
    expect(html).not.toContain(
      'aria-label="複製目前類型的 Browser Source URL"',
    );
  });

  it('omits opt-in lyrics diagnostics from the inspection URL in production', async () => {
    vi.stubEnv('DEV', false);
    const html = await renderPreview();

    expect(html).toContain('overlay/lyrics?workbench=1&amp;backdrop=checker');
    expect(html).not.toContain('lyricsDebug');
  });

  it('keeps the inspection backdrop query for widget capture previews', async () => {
    const html = await renderPreview({
      activeKind: 'now-playing',
      captureSize: 'small',
      supportedCaptureSizes: ['small'],
      previewUrl: 'http://127.0.0.1:8700/overlay/now-playing',
    });

    expect(html).toContain('backdrop=checker');
  });
});
