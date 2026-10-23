import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { describe, expect, it } from 'vitest';
import { getOutputWorkbenchData } from '../../constants/outputTemplates.js';
import ObsTemplateGallery from './ObsTemplateGallery.vue';

async function renderGallery(empty = false) {
  const data = getOutputWorkbenchData();
  const preset = data.templates.find((item) => item.id === 'queue-board');
  return renderToString(
    createSSRApp({
      render: () =>
        h(ObsTemplateGallery, {
          presets: empty ? [] : data.templates,
          templateGroups: empty ? [] : data.templateGroups,
          previewScene: data.previewScene,
          activeKind: preset.kind,
          selectedPresetId: preset.id,
        }),
    }),
  );
}

describe('Output Gallery bounded Folder composition', () => {
  it('keeps catalogue tiles to static artwork and title while retaining detail copy', async () => {
    const html = await renderGallery();
    expect(html).not.toContain('obs-template-thumb__meta');
    const tiles = [
      ...html.matchAll(
        /<button[^>]*class="obs-template-thumb[\s\S]*?<\/button>/gu,
      ),
    ];
    expect(tiles).toHaveLength(2);
    expect(tiles[0][0]).toContain('obs-template-thumbnail');
    expect(tiles[0][0]).toContain('obs-template-thumb__name');
    expect(tiles[0][0]).not.toContain('ui-chip');
    const preset = getOutputWorkbenchData().templates.find(
      (item) => item.id === 'queue-board',
    );
    expect(html).toContain(preset.detail);
  });

  it('keeps identity and apply outside the scrolling preview and description', async () => {
    const html = await renderGallery();
    const header = html.indexOf('obs-output-split-layout__side-header');
    const title = html.indexOf('obs-template-gallery__detail-title');
    const scroll = html.indexOf('obs-output-split-layout__side-scroll');
    const preview = html.indexOf('obs-template-preview-stage');
    const copy = html.indexOf('obs-template-gallery__detail-copy');
    const footer = html.indexOf('obs-output-split-layout__side-footer');
    const apply = html.indexOf('套用模板');

    expect(header).toBeGreaterThan(-1);
    expect(title).toBeGreaterThan(header);
    expect(scroll).toBeGreaterThan(title);
    expect(preview).toBeGreaterThan(scroll);
    expect(copy).toBeGreaterThan(preview);
    expect(footer).toBeGreaterThan(copy);
    expect(apply).toBeGreaterThan(footer);
    expect(html).toContain('aria-label="模板展示預覽"');
  });

  it('uses a scroll-safe catalogue and retains the detail geometry for an empty library', async () => {
    const html = await renderGallery();
    expect(html).toContain('ui-scroll-layout__content');
    expect(html).toContain('obs-template-gallery__grid');
    expect(html).toContain('data-scroll-axis="vertical"');

    const empty = await renderGallery(true);
    expect(empty).not.toContain('obs-output-split-layout--no-side');
    expect(empty).toContain('obs-output-split-layout__side-header');
    expect(empty).not.toContain('套用模板');
  });
});
