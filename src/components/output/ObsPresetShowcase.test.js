import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  fileURLToPath(new URL('./ObsTemplateGallery.vue', import.meta.url)),
  'utf8',
);
const splitLayoutSource = readFileSync(
  fileURLToPath(new URL('./ObsOutputSplitLayout.vue', import.meta.url)),
  'utf8',
);
const tabsSource = readFileSync(
  fileURLToPath(new URL('./ObsOutputTabs.vue', import.meta.url)),
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
  fileURLToPath(new URL('./ObsSlotWorkbench.vue', import.meta.url)),
  'utf8',
);
const settingsSource = readFileSync(
  fileURLToPath(new URL('./ObsOutputSettings.vue', import.meta.url)),
  'utf8',
);
const settingsViewSource = readFileSync(
  fileURLToPath(new URL('../../views/SettingsView.vue', import.meta.url)),
  'utf8',
);

function compactWhitespace(source) {
  return source.replace(/\s+/g, ' ');
}

describe('OBS output workspace layout contract', () => {
  it('keeps gallery sizing token-driven and responsive to its own column width', () => {
    const compactComponentSource = compactWhitespace(componentSource);
    const compactSplitLayoutSource = compactWhitespace(splitLayoutSource);

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
    expect(compactSplitLayoutSource).toMatch(
      /minmax\(\s*var\(--ui-output-gallery-column-min\),\s*1fr\s*\)/,
    );
    expect(compactSplitLayoutSource).toContain(
      'var(--ui-output-gallery-detail-width)',
    );
    expect(compactSplitLayoutSource).not.toMatch(
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
    expect(tabsSource).toContain('role="tablist"');
    expect(componentSource).toContain('ObsOutputTabs');
    expect(componentSource).toContain('activeGroup.templates');
    expect(componentSource).not.toContain('v-for="preset in group.templates"');
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

  it('separates workbench preview and URL copy from runtime settings', () => {
    expect(workbenchSource).toContain('ObsOverlayPreview');
    expect(splitLayoutSource).toContain(
      'var(--ui-output-workbench-inspector-width)',
    );
    expect(workbenchSource.match(/<select/g)).toHaveLength(1);
    expect(workbenchSource).toContain("key: 'fontFamily'");
    expect(workbenchSource).toContain("key: 'fontScale'");
    expect(workbenchSource).toContain("key: 'fontWeight'");
    expect(workbenchSource).toContain("key: 'alignment'");
    expect(workbenchSource).toContain("key: 'surface'");
    expect(settingsSource).toContain('type="text"');
    expect(settingsSource).toContain('inputmode="numeric"');
    expect(settingsSource).toContain('text-align: right');
    expect(settingsSource).toContain('@change="commitSettings()"');
    expect(settingsSource).toContain(
      '@keydown.enter.prevent="commitSettings()"',
    );
    expect(settingsSource).not.toContain('type="number"');
    expect(settingsSource).not.toContain('step="1"');
    expect(settingsSource).not.toContain(':icon="Check"');
    expect(settingsSource).toContain('type="checkbox"');
    expect(settingsSource).toContain('服務可用');
    expect(settingsSource).toContain('Browser Source 已連線');
    expect(settingsSource).toContain('等待 Browser Source 連線');
    expect(settingsSource).not.toContain('OBS 已連線');
    expect(settingsSource).not.toContain('等待 OBS Browser Source 連線');
    expect(settingsSource).toContain('Port 被占用');
    expect(settingsSource).toContain('SettingsBlock');
    expect(settingsSource).toContain('SettingsActionRow');
    expect(settingsSource).toContain('UiHint');
    expect(settingsSource).not.toContain('obs-output-settings__row');
    expect(settingsSource).toContain('var(--ui-settings-column-min-width)');
    expect(settingsViewSource).toContain('var(--ui-settings-column-min-width)');
    expect(settingsSource).toContain('var(--ui-settings-checkbox-size)');
    expect(tokenSource).toContain('--ui-settings-column-min-width: 22rem');
    expect(tokenSource).toContain('--ui-settings-checkbox-size:');
    expect(settingsSource).toContain('可用 Port');
    expect(tokenSource).toContain('--ui-output-port-input-width: 4.75rem');
    expect(tokenSource).toContain('--ui-output-settings-command-button-width:');
    expect(settingsSource).toContain('obs-output-settings__command');
    expect(settingsSource).not.toContain('v-model="copyKind"');
    expect(settingsSource).not.toContain('title="OBS URL"');
    expect(settingsSource).not.toContain('copyObsUrl');
    expect(settingsSource).not.toContain('目前模板 URL');
    expect(settingsSource).not.toContain('檢查 Port');
    expect(settingsSource).not.toContain("emit('suggestPorts')");
    expect(previewSource).toContain('Browser Source 即時預覽');
    expect(previewSource).toContain('Browser Source URL');
    expect(previewSource).not.toContain('OBS Overlay 即時預覽');
  });
});
