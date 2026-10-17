import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { getOutputWorkbenchData } from '../../constants/outputTemplates.js';
import { captureSizeForKind } from '../../constants/outputCaptureSizes.js';
import ObsPreviewCaption from './ObsPreviewCaption.vue';
import ObsTemplatePreviewStage from './ObsTemplatePreviewStage.vue';
import ObsWidgetCapturePreview from './ObsWidgetCapturePreview.vue';

const render = (component, props) =>
  renderToString(createSSRApp({ render: () => h(component, props) }));

describe('Output canvas size captions', () => {
  it('renders an inline caption inside a selectable canvas without introducing another control', async () => {
    const html = await render(ObsPreviewCaption, {
      label: '中',
      width: 480,
      height: 540,
      selected: true,
    });
    expect(html).toContain('obs-preview-caption--selected');
    expect(html).toContain('480 × 540');
    expect(html).toMatch(/^<span/);
    expect(html).not.toMatch(/<(?:button|input|p)\b/);
  });

  it.each(getOutputWorkbenchData().templates)(
    'shows the actual default capture dimensions for gallery $id',
    async (preset) => {
      const html = await render(ObsTemplatePreviewStage, { preset });
      const size = captureSizeForKind(preset.kind, null, preset.id);
      expect(html).toContain(`${size.width} × ${size.height}`);
      expect(html.indexOf('obs-preview-caption')).toBeLessThan(
        html.indexOf('obs-template-mockup__canvas'),
      );
    },
  );

  it('keeps each selectable widget resolution above its own artboard', async () => {
    const html = await render(ObsWidgetCapturePreview, {
      selectedSize: 'medium',
      supportedSizes: ['small', 'medium', 'large'],
    });
    const options = html.split('<button').slice(1);
    expect(options).toHaveLength(3);
    for (const [i, height] of [270, 540, 810].entries()) {
      expect(options[i]).toContain(`480 × ${height}`);
      expect(options[i].indexOf('obs-preview-caption')).toBeLessThan(
        options[i].indexOf('obs-widget-capture-preview__frame'),
      );
      expect(options[i]).toContain(`aria-pressed="${i === 1}"`);
    }
  });
});
