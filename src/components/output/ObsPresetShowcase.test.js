import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  fileURLToPath(new URL('./ObsTemplateGallery.vue', import.meta.url)),
  'utf8',
);
const tokenSource = readFileSync(
  fileURLToPath(new URL('../../styles/tokens.css', import.meta.url)),
  'utf8',
);
const previewSource = readFileSync(
  fileURLToPath(new URL('./ObsOverlayPreview.vue', import.meta.url)),
  'utf8',
);
const mockupSource = readFileSync(
  fileURLToPath(new URL('./ObsTemplateMockup.vue', import.meta.url)),
  'utf8',
);
const workbenchSource = readFileSync(
  fileURLToPath(new URL('./ObsWorkbenchPanel.vue', import.meta.url)),
  'utf8',
);
const settingsSource = readFileSync(
  fileURLToPath(new URL('./ObsOutputSettings.vue', import.meta.url)),
  'utf8',
);

function compactWhitespace(source) {
  return source.replace(/\s+/g, ' ');
}

describe('OBS output workspace layout contract', () => {
  it('keeps gallery sizing token-driven and responsive to its own column width', () => {
    const compactComponentSource = compactWhitespace(componentSource);

    expect(tokenSource).toContain('--ui-output-gallery-detail-width: clamp(');
    expect(tokenSource).toContain('--ui-output-gallery-detail-width-max');
    expect(tokenSource).toContain('--ui-output-gallery-preview-max-width');
    expect(tokenSource).toContain('--ui-output-workbench-inspector-width');
    expect(tokenSource).toContain('--ui-output-workbench-stage-max-width');
    expect(tokenSource).toContain('--ui-output-gallery-tile-min-width');
    expect(tokenSource).toContain('--ui-output-template-thumb-title-font-size');
    expect(tokenSource).toContain('22vw');
    expect(tokenSource).not.toContain('34cqi');
    expect(tokenSource).toContain('--ui-output-setting-label-width-max');
    expect(componentSource).not.toContain('--ui-font-size-xs');
    expect(componentSource).toContain('container-type: inline-size');
    expect(compactComponentSource).toContain(
      'repeat( auto-fill, minmax(var(--ui-output-gallery-tile-min-width), 1fr) )',
    );
    expect(compactComponentSource).toMatch(
      /minmax\(\s*var\(--ui-output-gallery-column-min\),\s*1fr\s*\)/,
    );
    expect(compactComponentSource).toContain(
      'var(--ui-output-gallery-detail-width)',
    );
    expect(compactComponentSource).not.toMatch(
      /minmax\(\s*var\(--ui-output-gallery-detail-width-min\),\s*var\(--ui-output-gallery-detail-width-max\)\s*\)/,
    );
    expect(mockupSource).toContain(
      'max-inline-size: var(--ui-output-gallery-preview-max-width)',
    );
    expect(mockupSource).toContain('aspect-ratio: 16 / 9');
    expect(componentSource).toContain('@container (width < 48rem)');
    expect(componentSource).toContain("emit('applyPreset'");
    expect(componentSource).not.toContain('startOutput');
    expect(componentSource).toContain('ObsTemplateMockup');
    expect(componentSource).not.toContain('ObsOverlayPreview');
    expect(componentSource).not.toContain('previewUrl');
  });

  it('keeps the real iframe in the workbench preview only', () => {
    expect(previewSource).toContain('<iframe');
    expect(previewSource).not.toContain('srcdoc');
    expect(previewSource).toContain('aspect-ratio: 16 / 9');
    expect(previewSource).toContain(':src="previewUrl"');
    expect(previewSource).toContain(
      'sandbox="allow-scripts allow-same-origin"',
    );
    expect(workbenchSource).toContain('ObsOverlayPreview');
    expect(componentSource).not.toContain('<iframe');
    expect(previewSource).toContain(
      'inline-size: min(100%, var(--ui-output-workbench-stage-max-width))',
    );
    expect(tokenSource).toContain('--ui-output-gallery-detail-width: clamp(');
  });

  it('separates the large workbench stage from runtime settings', () => {
    expect(workbenchSource).toContain('ObsOverlayPreview');
    expect(workbenchSource).toContain(
      'var(--ui-output-workbench-inspector-width)',
    );
    expect(settingsSource).toContain('type="number"');
    expect(settingsSource).toContain('type="checkbox"');
    expect(settingsSource).toContain('服務可用');
    expect(settingsSource).toContain('OBS 已連線');
    expect(settingsSource).toContain('Port 被占用');
  });
});
