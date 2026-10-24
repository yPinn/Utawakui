import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ObsOverlayPreview from './ObsOverlayPreview.vue';

const componentSource = readFileSync(
  fileURLToPath(new URL('./ObsOverlayPreview.vue', import.meta.url)),
  'utf8',
);

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
  it.each(['lyrics', 'now-playing', 'setlist'])(
    'keeps %s Workbench live and strips demo/sample parameters',
    async (kind) => {
      const html = await renderPreview({
        activeKind: kind,
        previewUrl: `http://127.0.0.1:8700/overlay/${kind}?preview=1&sample=private&template=unknown#private`,
      });
      expect(html).not.toContain('preview=1');
      expect(html).not.toContain('sample=private');
      expect(html).not.toContain('template=unknown');
      expect(html).not.toContain('#private');
    },
  );
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

  it('composes one direct Lyrics iframe with bounded Workbench-only inspection state', async () => {
    const html = await renderPreview();

    expect(html).toContain('data-backdrop="checker"');
    expect(html).toMatch(
      /src="http:\/\/127\.0\.0\.1:8700\/overlay\/lyrics\?workbench=1&amp;lyricsDebug=1&amp;backdrop=transparent&amp;guide=1&amp;reload=\d+"/,
    );
    expect(html).not.toContain('obs-streamer-preview');
    expect(html.match(/<iframe/g)).toHaveLength(1);
    expect(html).not.toContain('/workbench/lyrics');
    expect(html).toContain('obs-overlay-preview__capture-meta');
    expect(html).toContain('obs-preview-caption__resolution');
    expect(html.indexOf('obs-preview-caption')).toBeGreaterThan(
      html.indexOf('obs-overlay-preview__toolbar'),
    );
    expect(html).toContain('固定');
    expect(html).toContain('1920 × 1080');
  });

  it('projects controlled habits into the inspection iframe without exposing a second guide layer', async () => {
    const html = await renderPreview({
      previewBackdrop: 'dark',
      showLyricsGuide: false,
    });

    expect(html).toContain('data-backdrop="dark"');
    expect(html).toContain('backdrop=dark&amp;guide=0');
    expect(html).not.toContain('obs-streamer-preview');
    expect(html).toContain('>顯示人物參考</span>');
    expect(html).toContain('aria-pressed="false"');
  });

  it('keeps icon-only preview actions on the icon button contract', async () => {
    const html = await renderPreview({
      obsUrl: 'http://127.0.0.1:8700/overlay/lyrics',
    });

    expect(html).toContain('class="ui-icon-btn');
    expect(html).toContain('>複製網址</span>');
    expect(html).not.toContain(
      'aria-label="複製目前類型的 Browser Source URL"',
    );
  });

  it('lets the copy button be dragged into streaming software with layer params', async () => {
    const html = await renderPreview({
      obsUrl: 'http://127.0.0.1:8700/overlay/lyrics',
    });

    expect(html).toContain('draggable="true"');
    expect(componentSource).toContain('複製網址，或直接拖進直播軟體');
    expect(componentSource).toContain(
      "setData('text/uri-list', dropUrl.value)",
    );
    expect(componentSource).toContain("effectAllowed = 'copy'");
  });

  it('omits opt-in lyrics diagnostics from the inspection URL in production', async () => {
    vi.stubEnv('DEV', false);
    const html = await renderPreview();

    expect(html).toContain(
      'overlay/lyrics?workbench=1&amp;backdrop=transparent&amp;guide=1&amp;reload=',
    );
    expect(html).not.toContain('lyricsDebug');
  });

  it('leaves the unavailable-runtime fallback transparent and uses the renderer guide', async () => {
    const html = await renderPreview({ previewUrl: null });

    expect(html).toContain('data-backdrop="checker"');
    expect(html).toContain('obs-streamer-preview');
    expect(html).not.toContain('<iframe');
    expect(componentSource).toMatch(
      /\.obs-overlay-preview__fallback\s*\{[^}]*background:\s*transparent;/su,
    );
    expect(componentSource).toMatch(
      /\.obs-overlay-preview__fallback-title\s*\{[^}]*background:\s*var\(--ui-color-overlay-scrim\);/su,
    );
    expect(componentSource).not.toContain(
      ".obs-overlay-preview__frame[data-tone='stage'] .obs-overlay-preview__fallback",
    );
    expect(componentSource).not.toContain(
      ".obs-overlay-preview__frame[data-tone='lyrics'] .obs-overlay-preview__fallback",
    );
  });

  it('delegates widget checker paint to its unscaled renderer frame', async () => {
    const html = await renderPreview({
      activeKind: 'now-playing',
      captureSize: 'small',
      supportedCaptureSizes: ['small'],
      previewUrl: 'http://127.0.0.1:8700/overlay/now-playing',
    });

    expect(html).toContain('backdrop=transparent');
  });

  it('marks widget inspection iframes as Workbench previews but not the OBS URL', async () => {
    const html = await renderPreview({
      activeKind: 'now-playing',
      captureSize: 'small',
      supportedCaptureSizes: ['small'],
      previewUrl: 'http://127.0.0.1:8700/overlay/now-playing',
      obsUrl: 'http://127.0.0.1:8700/overlay/now-playing',
    });

    expect(html).toMatch(/src="[^"]*\/overlay\/now-playing\?workbench=1&amp;/u);
    expect(html).not.toMatch(/href="[^"]*workbench=1/u);
    expect(componentSource).not.toMatch(/dropUrl[^\n]*workbench/u);
  });
  it('matches the Overlay color scheme so dark app chrome cannot force an opaque iframe canvas', () => {
    for (const [source, selector] of [
      [componentSource, 'obs-overlay-preview__iframe'],
      [
        readFileSync(
          new URL('./ObsWidgetCapturePreview.vue', import.meta.url),
          'utf8',
        ),
        'obs-widget-capture-preview__iframe',
      ],
    ]) {
      const rule = source.match(
        new RegExp('\\.' + selector + '\\s*\\{([^}]+)\\}'),
      )?.[1];
      expect(rule).toMatch(/color-scheme:\s*normal;/u);
    }
  });

  it('keeps checker cells in display space outside the transformed capture canvas', () => {
    const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
    const tokens = read('../../styles/features/output.css');
    expect(tokens).toContain('--ui-output-preview-checker-cell: 8px');
    expect(tokens).toContain('var(--ui-output-preview-checker-cell) * 2');
    for (const source of [
      componentSource,
      read('./ObsWidgetCapturePreview.vue'),
      read('./ObsTemplateMockup.base.css'),
    ]) {
      expect(source).toContain('0 0 / var(--ui-output-preview-checker-tile)');
    }
    expect(componentSource).toContain('var(--ui-output-preview-canvas) 25%');
    expect(componentSource).toContain(
      'var(--ui-output-preview-backdrop-dark) 0 50%',
    );
  });
});
