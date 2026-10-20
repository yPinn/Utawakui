import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const appSource = readSource('../App.vue');
const settingsPageSource = readSource('../pages/SettingsPage.vue');
const settingsViewSource = readSource('../views/SettingsView.vue');
const settingsLibrarySectionSource = readSource(
  '../components/settings/SettingsLibrarySection.vue',
);
const settingsAudioSectionSource = readSource(
  '../components/settings/SettingsAudioSection.vue',
);
const settingsApplicationSectionSource = readSource(
  '../components/settings/SettingsApplicationSection.vue',
);
const settingsCapabilitiesSectionSource = readSource(
  '../components/settings/SettingsCapabilitiesSection.vue',
);
const settingsSupportSectionSource = readSource(
  '../components/settings/SettingsSupportSection.vue',
);
const settingsDocumentSource = [
  settingsLibrarySectionSource,
  settingsAudioSectionSource,
  settingsApplicationSectionSource,
  settingsCapabilitiesSectionSource,
  settingsSupportSectionSource,
].join('\n');
const folderLayoutSource = readSource(
  '../components/layout/AppFolderLayout.vue',
);
const registrySource = readSource('../utils/rendererSurfaceRegistry.js');
const tokenSource = readSource('./tokens.css');
const settingsDocumentItemSource = readSource(
  '../components/settings/SettingsDocumentItem.vue',
);
const settingsSectionSource = readSource(
  '../components/settings/SettingsSection.vue',
);
const settingsFeatureGateRowSource = readSource(
  '../components/settings/SettingsFeatureGateRow.vue',
);
const libraryStorageSettingsRowSource = readSource(
  '../components/settings/LibraryStorageSettingsRow.vue',
);

const settingsRenderGraphPaths = [
  '../components/settings/LyricsResearchSettingsBlock.vue',
  '../components/settings/LyricsResearchPreviewTools.vue',
  '../components/settings/LyricsExperimentalQueueSettings.vue',
  '../components/separation/SeparationPresetControl.vue',
  '../components/settings/CaptureDeviceModal.vue',
  '../components/settings/FfmpegSourceModal.vue',
  '../components/settings/LibraryStorageSettingsRow.vue',
  '../components/settings/SettingsApplicationSection.vue',
  '../components/settings/SettingsAudioSection.vue',
  '../components/settings/SettingsCapabilitiesSection.vue',
  '../components/settings/SettingsDocumentItem.vue',
  '../components/settings/SettingsFeatureGateRow.vue',
  '../components/settings/SettingsLibrarySection.vue',
  '../components/settings/SettingsSupportSection.vue',
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
    expect(settingsPageSource).toContain('<AppFolderPage mode="document"');
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

  it('lets the Folder document own the heading, paper boundary, and only page scroll', () => {
    expect(settingsPageSource).toContain('<template #header>');
    expect(settingsPageSource).toContain('<UiPageHeader title="設定"');
    expect(settingsViewSource).not.toContain('<UiScrollLayout');
    expect(settingsViewSource).not.toContain('<UiScrollRegion');
    expect(settingsViewSource).not.toContain('<UiTabs');
    expect(settingsViewSource).not.toContain('role="tabpanel"');
    expect(settingsViewSource).not.toContain('activeSettingsTab');
  });

  it('reflows Settings content from the Folder container instead of the viewport', () => {
    const responsiveSources = [
      settingsViewSource,
      settingsSectionSource,
      settingsDocumentItemSource,
      settingsFeatureGateRowSource,
      libraryStorageSettingsRowSource,
    ];

    for (const source of responsiveSources) {
      expect(source).not.toMatch(/@media\s*\(max-width:/u);
      expect(source).toMatch(
        /@container (app-folder-layout|settings-section)/u,
      );
    }

    expect(settingsViewSource).toContain(
      '@container app-folder-layout (max-width: 56.25rem)',
    );
    expect(settingsCapabilitiesSectionSource).toContain(
      'var(--settings-section-gap',
    );
    expect(settingsSectionSource).toContain(
      '@container settings-section (max-width: 48rem)',
    );
    expect(settingsDocumentItemSource).toContain(
      '@container settings-section (max-width: 32rem)',
    );
    expect(settingsFeatureGateRowSource).toContain(
      '@container settings-section (max-width: 30rem)',
    );
    expect(libraryStorageSettingsRowSource).toContain(
      '@container app-folder-layout (max-width: 35rem)',
    );
  });

  it('keeps default windowed rows compact and delays one-column stacking until the Folder is truly narrow', () => {
    const windowedTier = settingsDocumentItemSource.slice(
      settingsDocumentItemSource.indexOf(
        '@container settings-section (max-width: 48rem)',
      ),
      settingsDocumentItemSource.indexOf(
        '@container settings-section (max-width: 32rem)',
      ),
    );
    const narrowTier = settingsDocumentItemSource.slice(
      settingsDocumentItemSource.indexOf(
        '@container settings-section (max-width: 32rem)',
      ),
    );

    expect(windowedTier).toMatch(
      /\.settings-document-item\s*\{[^}]*gap:\s*var\(--ui-space-3\);/su,
    );
    expect(windowedTier).not.toContain(
      'grid-template-columns: minmax(0, 1fr);',
    );
    expect(settingsSectionSource).toMatch(
      /@container settings-section \(max-width: 48rem\)[\s\S]*--settings-row-padding-block: var\(--ui-space-3\);[\s\S]*--settings-child-padding-block: var\(--ui-space-2\);/u,
    );
    expect(narrowTier).toMatch(
      /\.settings-document-item\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/su,
    );
    expect(narrowTier).toMatch(
      /\.settings-document-item__icon\s*\{[^}]*visibility:\s*hidden;/su,
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

  it('rebuilds Settings as seven functional sections while preserving its actions and modal flows', () => {
    const sectionTitles = ['曲庫與儲存', '音訊輸出', '應用程式', '支援與維護'];
    let previousPosition = -1;
    for (const title of sectionTitles) {
      const position = settingsDocumentSource.indexOf(`title="${title}"`);
      expect(position, title).toBeGreaterThan(previousPosition);
      previousPosition = position;
    }
    for (const title of ['外部來源與歌詞', '本機音訊處理', '公開輸出與 OBS']) {
      expect(settingsCapabilitiesSectionSource).toContain(`title: '${title}'`);
    }
    expect(settingsCapabilitiesSectionSource).not.toContain('title="選用功能"');
    for (const component of [
      'SettingsLibrarySection',
      'SettingsAudioSection',
      'SettingsApplicationSection',
      'SettingsCapabilitiesSection',
      'SettingsSupportSection',
    ]) {
      expect(settingsViewSource, component).toContain(`<${component}`);
    }
    for (const component of [
      'SettingsSection',
      'SettingsDocumentItem',
      'SettingsFeatureGateRow',
      'AudioOutputSettingsBlock',
      'ObsIntegrationSettingsBlock',
      'CaptureDeviceModal',
      'FfmpegSourceModal',
    ]) {
      expect(settingsDocumentSource, component).toContain(`<${component}`);
    }
    for (const component of ['FeedbackReportModal', 'ObsSessionExportModal']) {
      expect(appSource, component).toContain(`<${component}`);
      expect(settingsDocumentSource, component).not.toContain(`<${component}`);
    }
    expect(settingsDocumentSource).not.toContain('<SettingsBlock');
    expect(settingsDocumentSource).not.toContain('<SettingsActionRow');
    expect(settingsDocumentSource).toContain('v-for="gate in group.gates"');
  });
});
