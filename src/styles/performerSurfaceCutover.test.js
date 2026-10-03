import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const registrySource = readSource('../utils/rendererSurfaceRegistry.js');
const performerAppSource = readSource('../performer/PerformerApp.vue');
const toolbarSource = readSource(
  '../components/performer/PerformerWindowToolbar.vue',
);
const stageSource = readSource('../components/performer/PerformerStage.vue');
const cueSource = readSource('../components/performer/PerformerLyricCue.vue');
const tokenV1Source = readSource('./tokens.css');
const performerFeatureSource = readSource('./features/performer.css');
const performerWindowSource = readSource(
  '../../electron/main/performerWindow.js',
);
const legacyManifest = JSON.parse(
  readSource('./token-v1-legacy-manifest.generated.json'),
);

const performerConsumerSources = [
  ['PerformerApp.vue', performerAppSource],
  ['PerformerWindowToolbar.vue', toolbarSource],
  ['PerformerStage.vue', stageSource],
  ['PerformerLyricCue.vue', cueSource],
];

const retiredPerformerAliases = [
  '--ui-font-weight-heavy',
  '--ui-font-weight-strong',
  '--ui-titlebar-height',
];

const forbiddenLegacyTokens = [
  ...new Set([...legacyManifest.legacyTokens, ...retiredPerformerAliases]),
];

describe('Performer renderer Token v2 cutover', () => {
  it('registers Performer and its overlay as one v2 renderer surface', () => {
    expect(registrySource).toMatch(
      /performer:\s*createSurfaceDefinition\(\{(?=[^}]*migrationStatus:\s*'registered-v2')(?=[^}]*overlayHostId:\s*'performer-overlay')(?=[^}]*system:\s*'v2')[^}]*\}\)/su,
    );
    expect(registrySource).toMatch(
      /'performer-overlay':\s*createSurfaceDefinition\(\{(?=[^}]*migrationStatus:\s*'registered-v2')(?=[^}]*parentSurfaceId:\s*'performer')(?=[^}]*system:\s*'v2')[^}]*\}\)/su,
    );
    expect(performerAppSource).toContain("provideUiOverlayHost('performer')");
  });

  it('rejects every T1-only name across the complete Performer render graph', () => {
    for (const [path, source] of performerConsumerSources) {
      for (const token of forbiddenLegacyTokens) {
        expect(source, `${path}: ${token}`).not.toContain(`var(${token})`);
      }
    }

    for (const token of retiredPerformerAliases) {
      expect(tokenV1Source, token).not.toMatch(
        new RegExp(`${token}\\s*:`, 'u'),
      );
    }
  });

  it('uses the formal window titlebar owner without duplicating feature geometry', () => {
    expect(performerAppSource).toContain(
      'grid-template-rows: var(--ui-window-titlebar-block-size) minmax(0, 1fr)',
    );
    expect(toolbarSource).toContain(
      'height: var(--ui-window-titlebar-block-size)',
    );
    expect(performerFeatureSource).not.toContain('--ui-performer-toolbar');
    expect(performerFeatureSource).toContain('--ui-performer-lyrics-max-width');
    expect(performerFeatureSource).toContain(
      '--ui-performer-lyric-current-font-size',
    );
    expect(performerFeatureSource).toContain('--ui-performer-ruby-font-size');
  });

  it('keeps the native substrate synchronized with the v2 canvas palette', () => {
    expect(performerWindowSource).toContain(
      "backgroundColor: initialTheme === 'light' ? '#e8e4dd' : '#191a1e'",
    );
    expect(performerWindowSource).toContain(
      'additionalArguments: [`--ui-theme=${initialTheme}`]',
    );
  });

  it('preserves window controls, stage projection, lyric cues, and reading aid', () => {
    for (const event of [
      "'close'",
      "'minimize'",
      "'toggle-always-on-top'",
      "'toggle-full-screen'",
    ]) {
      expect(toolbarSource).toContain(event);
    }
    for (const projection of [
      'frame.track?.title',
      'frame.keyLabel',
      'frame.tempoLabel',
      'frame.currentLine',
      'frame.nextLine',
      'frame.nextTrack?.title',
    ]) {
      expect(stageSource).toContain(projection);
    }
    expect(cueSource).toContain('<ruby');
    expect(cueSource).toContain('<rt v-if="segment.reading">');
    expect(cueSource).toContain('reading?.romaji');
    expect(cueSource).toContain('@media (max-height: 400px)');
  });
});
