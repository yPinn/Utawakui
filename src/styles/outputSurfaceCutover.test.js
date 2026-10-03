import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const appSource = readSource('../App.vue');
const viewSource = readSource('../views/OutputView.vue');
const workspaceSource = readSource(
  '../components/output/ObsOutputWorkspace.vue',
);
const splitLayoutSource = readSource(
  '../components/output/ObsOutputSplitLayout.vue',
);
const workbenchSource = readSource('../components/output/ObsSlotWorkbench.vue');
const gallerySource = readSource('../components/output/ObsTemplateGallery.vue');
const settingsSource = readSource('../components/output/ObsOutputSettings.vue');
const tokenV1Source = readSource('./tokens.css');
const outputFeaturePath = new URL('./features/output.css', import.meta.url);
const legacyFeaturePath = new URL(
  './features/output-preview.css',
  import.meta.url,
);
const outputFeatureSource = readFileSync(
  existsSync(outputFeaturePath) ? outputFeaturePath : legacyFeaturePath,
  'utf8',
);
const publicOverlayTokens = readSource('../../overlay/shared/tokens.css');

const outputConsumerPaths = [
  '../components/output/ObsAppearanceControlRow.vue',
  '../components/output/ObsOutputBrief.vue',
  '../components/output/ObsOutputSettings.vue',
  '../components/output/ObsOutputSplitLayout.vue',
  '../components/output/ObsOutputTabs.vue',
  '../components/output/ObsOverlayPreview.vue',
  '../components/output/ObsSlotWorkbench.vue',
  '../components/output/ObsTemplateGallery.vue',
  '../components/output/ObsTemplateMockup.base.css',
  '../components/output/ObsTemplateMockup.cover-player.css',
  '../components/output/ObsTemplateMockup.karaoke.css',
  '../components/output/ObsTemplateMockup.live-stage.css',
  '../components/output/ObsTemplateMockup.now-playing.css',
  '../components/output/ObsTemplateMockup.setlist.css',
  '../components/output/ObsTemplateMockup.thumbnail.css',
  '../components/output/ObsWidgetCapturePreview.vue',
];

const outputSharedComponentPaths = [
  '../components/settings/SettingsActionRow.vue',
  '../components/settings/SettingsBlock.vue',
];

const legacyGenericTokens = [
  '--ui-color-surface-playing',
  '--ui-font-weight-heavy',
  '--ui-font-weight-strong',
  '--ui-motion-ease',
  '--ui-motion-fast',
  '--ui-radius',
  '--ui-settings-checkbox-size',
  '--ui-settings-column-min-width',
];

const legacySharedComponentTokens = [
  '--ui-font-weight-strong',
  '--ui-radius',
  '--ui-settings-block-body-gap',
  '--ui-settings-block-gap',
  '--ui-settings-block-padding',
  '--ui-settings-row-copy-gap',
  '--ui-settings-row-icon-size',
  '--ui-settings-row-min-height',
  '--ui-settings-row-padding-block',
  '--ui-settings-row-padding-inline',
];

const localizedSharedComponentTokens = [
  '--ui-settings-block-body-gap',
  '--ui-settings-block-gap',
  '--ui-settings-block-padding',
  '--ui-settings-row-icon-size',
  '--ui-settings-row-min-height',
  '--ui-settings-row-padding-block',
  '--ui-settings-row-padding-inline',
];

const outputOwnedTokens = [
  '--ui-output-gallery-column-min',
  '--ui-output-gallery-detail-width-min',
  '--ui-output-gallery-detail-width-max',
  '--ui-output-gallery-detail-width',
  '--ui-output-gallery-preview-max-width',
  '--ui-output-gallery-tile-min-width',
  '--ui-output-workbench-inspector-width',
  '--ui-output-workbench-stage-max-width',
  '--ui-output-port-input-width',
  '--ui-output-settings-command-button-width',
  '--ui-output-template-thumb-min-height',
  '--ui-output-template-thumb-title-font-size',
  '--ui-output-template-thumb-caption-font-size',
  '--ui-output-template-thumb-content-width',
  '--ui-output-template-thumb-artwork-size',
  '--ui-output-template-thumb-content-padding',
  '--ui-output-template-thumb-tight-gap',
  '--ui-output-template-thumb-group-gap',
  '--ui-output-setting-label-width-min',
];

describe('Output Token v2 surface cutover', () => {
  it('keeps Output in Folder workspace mode with bounded feature scroll owners', () => {
    expect(appSource).toContain(
      "const documentFolderViews = new Set(['setlist', 'import'])",
    );
    expect(viewSource).toContain('<ObsOutputWorkspace');
    expect(workspaceSource).toMatch(
      /\.obs-output-workspace\s*\{(?=[^}]*height:\s*100%)(?=[^}]*min-height:\s*0)(?=[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\))[^}]*\}/su,
    );
    expect(splitLayoutSource).toContain('<UiScrollRegion');
    expect(workbenchSource).toContain('<UiScrollRegion');
    expect(gallerySource).toContain('<UiScrollRegion');
    expect(settingsSource).toContain('<UiScrollRegion');
  });

  it('moves Output-owned geometry out of the T1 core and into one feature stylesheet', () => {
    expect(existsSync(outputFeaturePath)).toBe(true);
    expect(existsSync(legacyFeaturePath)).toBe(false);
    expect(viewSource).toContain('../styles/features/output.css');

    for (const token of outputOwnedTokens) {
      expect(outputFeatureSource, token).toMatch(
        new RegExp(`${token}\\s*:`, 'u'),
      );
      expect(tokenV1Source, token).not.toMatch(
        new RegExp(`${token}\\s*:`, 'u'),
      );
    }
  });

  it('uses formal v2 semantics for generic Output controls', () => {
    for (const path of outputConsumerPaths) {
      const source = readSource(path);
      for (const token of legacyGenericTokens) {
        expect(source, `${path}: ${token}`).not.toContain(`var(${token})`);
      }
    }

    expect(outputFeatureSource).toContain(
      '--ui-output-preview-stage-fallback:',
    );
    expect(outputFeatureSource).toContain(
      '--ui-output-settings-column-min-width:',
    );
    expect(settingsSource).toContain('var(--ui-checkbox-size)');
    expect(workbenchSource).toContain('var(--ui-font-weight-semibold)');
  });

  it('includes transitive shared compounds in the no-T1 contract', () => {
    for (const path of outputSharedComponentPaths) {
      const source = readSource(path);
      for (const token of legacySharedComponentTokens) {
        expect(source, `${path}: ${token}`).not.toContain(`var(${token})`);
      }
    }

    for (const token of localizedSharedComponentTokens) {
      expect(tokenV1Source, token).not.toMatch(
        new RegExp(`${token}\\s*:`, 'u'),
      );
    }

    expect(readSource(outputSharedComponentPaths[0])).toContain(
      'var(--ui-font-weight-semibold)',
    );
    expect(readSource(outputSharedComponentPaths[0])).toContain(
      'var(--ui-radius-md)',
    );
    expect(readSource(outputSharedComponentPaths[1])).toContain(
      'var(--ui-font-weight-semibold)',
    );
  });

  it('preserves the workbench, gallery, settings, preview, and template anatomy', () => {
    expect(workspaceSource).toContain('<ObsOutputTabs');
    expect(workspaceSource).toContain('<ObsTemplateGallery');
    expect(workspaceSource).toContain('<ObsSlotWorkbench');
    expect(workspaceSource).toContain('<ObsOutputSettings');
    expect(workbenchSource).toContain('<ObsOverlayPreview');
    expect(gallerySource).toContain('<ObsTemplateThumbnail');
    expect(gallerySource).toContain('<ObsTemplatePreviewStage');
    expect(settingsSource).toContain('<ObsSpoutOutputSettings');
  });

  it('keeps public Overlay tokens and runtime outside the control-panel feature layer', () => {
    expect(publicOverlayTokens).toContain('--ovl-');
    expect(publicOverlayTokens).not.toContain('--ui-');
    expect(outputFeatureSource).not.toContain('--ovl-');
    expect(viewSource).not.toContain('overlay/shared');
  });
});
