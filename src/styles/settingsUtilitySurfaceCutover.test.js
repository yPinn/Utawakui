import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const appSource = readSource('../App.vue');
const utilityPagePath = new URL(
  '../components/layout/AppUtilityPage.vue',
  import.meta.url,
);
const legacyUtilityFramePath = new URL(
  '../components/layout/AppUtilityFrame.vue',
  import.meta.url,
);
const utilityPageSource = readFileSync(
  existsSync(utilityPagePath) ? utilityPagePath : legacyUtilityFramePath,
  'utf8',
);
const settingsViewSource = readSource('../views/SettingsView.vue');
const registrySource = readSource('../utils/rendererSurfaceRegistry.js');
const tokenSource = readSource('./tokens.css');

const settingsRenderGraphPaths = [
  '../components/separation/SeparationPresetControl.vue',
  '../components/settings/CaptureDeviceModal.vue',
  '../components/settings/FfmpegSourceModal.vue',
  '../components/settings/LibraryStorageSettingsRow.vue',
  '../components/settings/SettingsActionRow.vue',
  '../components/settings/SettingsBlock.vue',
  '../components/settings/SettingsFeatureGateRow.vue',
  '../components/settings/VirtualCableGuideModal.vue',
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

describe('Settings Utility Token v2 surface cutover', () => {
  it('uses the final AppUtilityPage name without a compatibility file', () => {
    expect(existsSync(utilityPagePath)).toBe(true);
    expect(existsSync(legacyUtilityFramePath)).toBe(false);
    expect(appSource).toContain(
      "import AppUtilityPage from './components/layout/AppUtilityPage.vue'",
    );
    expect(appSource).toContain('<AppUtilityPage');
    expect(appSource).not.toContain('AppUtilityFrame');
  });

  it('registers app-utility and its local overlay host as one v2 surface', () => {
    expect(registrySource).toMatch(
      /'app-utility':\s*createSurfaceDefinition\(\{(?=[^}]*overlayHostId:\s*'app-utility-overlay')(?=[^}]*system:\s*'v2')[^}]*\}\)/su,
    );
    expect(registrySource).toMatch(
      /'app-utility-overlay':\s*createSurfaceDefinition\(\{(?=[^}]*parentSurfaceId:\s*'app-utility')(?=[^}]*system:\s*'v2')[^}]*\}\)/su,
    );
    expect(utilityPageSource).toContain("provideUiOverlayHost('app-utility')");
    expect(utilityPageSource).toContain(
      "registeredOverlayHostAttributes('app-utility')",
    );
  });

  it('keeps the frame fixed and Settings as the only page scroll owner', () => {
    expect(appSource).toContain('<AppUtilityPage');
    expect(utilityPageSource).not.toContain('UiScrollRegion');
    expect(utilityPageSource).toMatch(
      /\.app-utility-page\s*\{(?=[^}]*height:\s*100%)(?=[^}]*min-height:\s*0)(?=[^}]*overflow:\s*hidden)[^}]*\}/su,
    );
    expect(settingsViewSource.match(/<UiScrollRegion/gu)).toHaveLength(1);
    expect(settingsViewSource).toContain('class="settings-view__scroll"');
    expect(settingsViewSource).toContain(
      'viewport-class="settings-view__viewport"',
    );
  });

  it('rejects T1-only names across the complete Settings render graph', () => {
    for (const token of legacySettingsTokens) {
      expect(utilityPageSource, `AppUtilityPage.vue: ${token}`).not.toContain(
        `var(${token})`,
      );
    }

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

  it('keeps page and separation geometry with their actual component owners', () => {
    expect(settingsViewSource).toContain(
      '--settings-view-column-min-width: 22rem',
    );
    expect(settingsViewSource).toContain(
      '--settings-view-column-gap: var(--ui-space-4)',
    );

    const separationSource = readSource(
      '../components/separation/SeparationPresetControl.vue',
    );
    expect(separationSource).toContain(
      '--separation-preset-mode-min-width: 8.5rem',
    );
  });

  it('preserves Settings feature blocks, gates, actions, and modal flows', () => {
    for (const component of [
      'SettingsBlock',
      'SettingsActionRow',
      'SettingsFeatureGateRow',
      'AudioOutputSettingsBlock',
      'ObsIntegrationSettingsBlock',
      'CaptureDeviceModal',
      'FfmpegSourceModal',
      'FeedbackReportModal',
      'ObsSessionExportModal',
    ]) {
      expect(settingsViewSource, component).toContain(`<${component}`);
    }
    expect(settingsViewSource).toContain('v-for="gate in featureGateRows"');
  });
});
