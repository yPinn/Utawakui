import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import ObsWidgetCapturePreview from './ObsWidgetCapturePreview.vue';

function renderPreview(props = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(ObsWidgetCapturePreview, {
          inspectionUrl: 'http://127.0.0.1:8700/overlay/now-playing',
          selectedSize: 'medium',
          supportedSizes: ['small', 'medium', 'large'],
          preset: { preview: { title: 'Artwork' } },
          ...props,
        }),
    }),
  );
}

describe('ObsWidgetCapturePreview', () => {
  it('renders small, medium, and large as bottom-aligned vertical stacks', async () => {
    const html = await renderPreview();

    expect(
      html.match(/class="obs-widget-capture-preview__option/g),
    ).toHaveLength(3);
    expect(html).toContain('480 × 270');
    expect(html).toContain('480 × 540');
    expect(html).toContain('480 × 810');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('width="480"');
    expect(html).toContain('height="810"');
  });

  it('keeps all three real capture routes free of demo-state query parameters', async () => {
    const html = await renderPreview();

    expect(html.match(/<iframe/g)).toHaveLength(3);
    expect(html).not.toContain('preview=');
    expect(html).not.toContain('size=');
  });

  it('renders only the sizes supported by the selected template', async () => {
    const html = await renderPreview({
      supportedSizes: ['medium', 'large'],
    });

    expect(
      html.match(/class="obs-widget-capture-preview__option/g),
    ).toHaveLength(2);
    expect(html).not.toContain('480 × 270');
    expect(html).toContain('480 × 540');
    expect(html).toContain('480 × 810');

    const singleSizeHtml = await renderPreview({
      selectedSize: 'large',
      supportedSizes: ['large'],
    });
    expect(
      singleSizeHtml.match(/class="obs-widget-capture-preview__option/g),
    ).toHaveLength(1);
    expect(singleSizeHtml).not.toContain('480 × 270');
    expect(singleSizeHtml).not.toContain('480 × 540');
  });
});
