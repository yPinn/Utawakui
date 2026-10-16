import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const appSource = readSource('../App.vue');
const settingsPageSource = readSource('../pages/SettingsPage.vue');
const settingsViewSource = readSource('../views/SettingsView.vue');
const folderLayoutSource = readSource(
  '../components/layout/AppFolderLayout.vue',
);
const registrySource = readSource('../utils/rendererSurfaceRegistry.js');
const tokenSource = readSource('./tokens.css');
const settingsBlockSource = readSource(
  '../components/settings/SettingsBlock.vue',
);
const settingsActionRowSource = readSource(
  '../components/settings/SettingsActionRow.vue',
);
const settingsFeatureGateRowSource = readSource(
  '../components/settings/SettingsFeatureGateRow.vue',
);
const libraryStorageSettingsRowSource = readSource(
  '../components/settings/LibraryStorageSettingsRow.vue',
);

const settingsRenderGraphPaths = [
  '../components/separation/SeparationPresetControl.vue',
  '../components/settings/CaptureDeviceModal.vue',
  '../components/settings/FfmpegSourceModal.vue',
  '../components/settings/LibraryStorageSettingsRow.vue',
  '../components/settings/SettingsActionRow.vue',
  '../components/settings/SettingsBlock.vue',
  '../components/settings/SettingsFeatureGateRow.vue',
  '../components/settings/VirtualCableGuideModal.vue',
  '../pages/SettingsPage.vue',
  '../views/SettingsView.vue',
];

const legacySettingsTokens = [
  '--ui-font-weight-heavy',
  '--ui-font-weight-strong',
  '--ui-line-height-headline',
  '--ui-motion-fast',
  '--ui-radius',
  '--ui-separation-mode-min-width',
  '--ui-settings-column-gap',
  '--ui-settings-column-min-width',
  '--ui-settings-row-copy-gap',
];

const retiredSettingsDeclarations = [
  '--ui-separation-mode-min-width',
  '--ui-settings-checkbox-size',
  '--ui-settings-column-gap',
  '--ui-settings-column-header-gap',
  '--ui-settings-column-min-width',
  '--ui-settings-row-copy-gap',
];

describe('Settings Folder surface cutover', () => {
  it('removes the utility shell and composes Settings through the Folder owner', () => {
    expect(
      existsSync(
        new URL('../components/layout/AppUtilityPage.vue', import.meta.url),
      ),
    ).toBe(false);
    expect(appSource).not.toContain('AppUtilityPage');
    expect(appSource).toContain('<AppSurfaceBoundary surface-id="app-folder">');
    expect(appSource).toContain('<AppFolderLayout');
    expect(appSource).toContain('settings: SettingsPage');
    expect(settingsPageSource).toContain(
      '<AppSurfaceBoundary surface-id="settings">',
    );
    expect(settingsPageSource).toContain('<AppFolderPage mode="workspace"');
  });

  it('registers Settings and its local overlay host under app-folder', () => {
    expect(registrySource).toMatch(
      /settings:\s*createSurfaceDefinition\(\{(?=[^}]*entryOwner:\s*'src\/pages\/SettingsPage\.vue')(?=[^}]*overlayHostId:\s*'settings-overlay')(?=[^}]*parentSurfaceId:\s*'app-folder')(?=[^}]*system:\s*'v2')[^}]*\}\)/su,
    );
    expect(registrySource).toMatch(
      /'settings-overlay':\s*createSurfaceDefinition\(\{(?=[^}]*parentSurfaceId:\s*'settings')(?=[^}]*system:\s*'v2')[^}]*\}\)/su,
    );
    expect(registrySource).not.toContain("'app-utility':");
    expect(registrySource).not.toContain("'app-utility-overlay':");
  });

  it('uses the shared neutral Folder material in dark and light themes', () => {
    expect(folderLayoutSource).toContain('data-active-material');
    expect(folderLayoutSource).toContain(
      'data-folder-material="destination.material"',
    );
    expect(folderLayoutSource).toMatch(
      /\.app-folder-layout\[data-active-material='neutral'\]\s*\{[^}]*--ui-folder-layout-background:\s*var\(--ui-color-folder-neutral\);/su,
    );
    expect(folderLayoutSource).toMatch(
      /\.app-folder-layout__destination\[data-folder-material='neutral'\]\s*\{[^}]*--ui-folder-tab-material:\s*var\(--ui-color-folder-neutral\);[^}]*--ui-folder-tab-foreground:\s*var\(--ui-color-folder-neutral-foreground\);/su,
    );
    expect(tokenSource).toContain(
      '--ui-color-folder-neutral: var(--ui-palette-neutral-800);',
    );
    expect(tokenSource).toContain(
      '--ui-color-folder-neutral: var(--ui-palette-neutral-300);',
    );
  });

  it('keeps the Folder header fixed and Settings as the only body scroll owner', () => {
    expect(settingsPageSource).toContain('<template #header>');
    expect(settingsPageSource).toContain('<UiPageHeader title="設定"');
    expect(settingsViewSource.match(/<UiScrollRegion/gu)).toHaveLength(1);
    expect(settingsViewSource).toContain('class="settings-view__scroll"');
    expect(settingsViewSource).toContain(
      'viewport-class="settings-view__viewport"',
    );
  });

  it('reflows Settings content from the Folder container instead of the viewport', () => {
    const responsiveSources = [
      settingsViewSource,
      settingsBlockSource,
      settingsActionRowSource,
      settingsFeatureGateRowSource,
      libraryStorageSettingsRowSource,
    ];

    for (const source of responsiveSources) {
      expect(source).not.toMatch(/@media\s*\(max-width:/u);
      expect(source).toContain('@container app-folder-layout');
    }

    expect(settingsViewSource).toContain(
      '@container app-folder-layout (max-width: 42rem)',
    );
    expect(settingsBlockSource).toContain(
      '@container app-folder-layout (max-width: 42.5rem)',
    );
    expect(settingsActionRowSource).toContain(
      '@container app-folder-layout (max-width: 56.25rem)',
    );
    expect(settingsActionRowSource).toContain(
      '@container app-folder-layout (max-width: 42.5rem)',
    );
    expect(settingsFeatureGateRowSource).toContain(
      '@container app-folder-layout (max-width: 42.5rem)',
    );
    expect(libraryStorageSettingsRowSource).toContain(
      '@container app-folder-layout (max-width: 35rem)',
    );
  });

  it('rejects T1-only names across the complete Settings render graph', () => {
    for (const path of settingsRenderGraphPaths) {
      const source = readSource(path);
      for (const token of legacySettingsTokens) {
        expect(source, `${path}: ${token}`).not.toContain(`var(${token})`);
      }
    }

    for (const token of retiredSettingsDeclarations) {
      expect(tokenSource, token).not.toMatch(new RegExp(`${token}\\s*:`, 'u'));
    }
  });

  it('preserves Settings categories, feature blocks, actions, and modal flows', () => {
    expect(settingsViewSource).toMatch(
      /\.settings-view\s*\{(?=[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\))[^}]*\}/su,
    );
    for (const component of [
      'SettingsBlock',
      'SettingsActionRow',
      'SettingsFeatureGateRow',
      'UiTabs',
      'AudioOutputSettingsBlock',
      'ObsIntegrationSettingsBlock',
      'CaptureDeviceModal',
      'FfmpegSourceModal',
      'FeedbackReportModal',
      'ObsSessionExportModal',
    ]) {
      expect(settingsViewSource, component).toContain(`<${component}`);
    }
    expect(settingsViewSource).toContain('v-for="gate in group.gates"');
  });
});
