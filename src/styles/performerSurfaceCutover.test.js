import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const registrySource = readSource('../utils/rendererSurfaceRegistry.js');
const performerAppSource = readSource('../performer/PerformerApp.vue');
const toolbarSource = readSource(
  '../components/performer/PerformerWindowToolbar.vue',
);
const surfaceSource = readSource(
  '../components/performer/PerformerSurface.vue',
);
const trackContextSource = readSource(
  '../components/performer/PerformerTrackContext.vue',
);
const cueStackSource = readSource(
  '../components/performer/PerformerCueStack.vue',
);
const nextTrackSource = readSource(
  '../components/performer/PerformerNextTrack.vue',
);
const syncControlsSource = readSource(
  '../components/performer/PerformerSyncControls.vue',
);
const displayControlsSource = readSource(
  '../components/performer/PerformerDisplayControls.vue',
);
const cueSource = readSource('../components/performer/PerformerLyricCue.vue');
const tokenSource = readSource('./tokens.css');
const performerFeatureSource = readSource('./features/performer.css');
const performerWindowSource = readSource(
  '../../electron/main/performerWindow.js',
);
const performerPageSource = readSource('../../performer-view.html');

const performerConsumerSources = [
  ['PerformerApp.vue', performerAppSource],
  ['PerformerWindowToolbar.vue', toolbarSource],
  ['PerformerSurface.vue', surfaceSource],
  ['PerformerTrackContext.vue', trackContextSource],
  ['PerformerCueStack.vue', cueStackSource],
  ['PerformerNextTrack.vue', nextTrackSource],
  ['PerformerSyncControls.vue', syncControlsSource],
  ['PerformerDisplayControls.vue', displayControlsSource],
  ['PerformerLyricCue.vue', cueSource],
];

const retiredPerformerAliases = [
  '--ui-font-weight-heavy',
  '--ui-font-weight-strong',
  '--ui-titlebar-height',
];

const forbiddenLegacyTokens = retiredPerformerAliases;

describe('Performer renderer Token v2 cutover', () => {
  it('registers Performer and its overlay as one v2 renderer surface', () => {
    expect(registrySource).toMatch(
      /performer:\s*createSurfaceDefinition\(\{(?=[^}]*overlayHostId:\s*'performer-overlay')(?=[^}]*system:\s*'v2')[^}]*\}\)/su,
    );
    expect(registrySource).toMatch(
      /'performer-overlay':\s*createSurfaceDefinition\(\{(?=[^}]*parentSurfaceId:\s*'performer')(?=[^}]*system:\s*'v2')[^}]*\}\)/su,
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
      expect(tokenSource, token).not.toMatch(new RegExp(`${token}\\s*:`, 'u'));
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
      '--ui-performer-cue-current-size-near',
    );
    expect(performerFeatureSource).toContain(
      '--ui-performer-cue-current-size-desk',
    );
    expect(performerFeatureSource).toContain(
      '--ui-performer-cue-current-size-stage',
    );
    expect(performerFeatureSource).toContain('--ui-performer-ruby-font-size');
  });

  it('uses the user-facing prompter name without renaming internal contracts', () => {
    expect(toolbarSource).toContain('<span>提詞器</span>');
    expect(performerWindowSource).toContain("title: 'Utawakui 提詞器'");
    expect(performerPageSource).toContain('<title>Utawakui 提詞器</title>');
    expect(toolbarSource).not.toContain('Performer View');
    expect(performerPageSource).not.toContain('Performer View');
    expect(performerWindowSource).toContain(
      "window.webContents.send('performer-view:snapshot'",
    );
  });

  it('combines explicit reading-distance rhythm with container-height limits', () => {
    for (const token of [
      '--ui-performer-lyrics-max-width-near: 72rem',
      '--ui-performer-lyrics-max-width-desk: 64rem',
      '--ui-performer-lyrics-max-width-stage: 56rem',
      '--ui-performer-cue-gap-comfortable-near: var(--ui-space-4)',
      '--ui-performer-cue-gap-comfortable-desk: var(--ui-space-5)',
      '--ui-performer-cue-gap-comfortable-stage: var(--ui-space-6)',
    ]) {
      expect(performerFeatureSource).toContain(token);
    }
    expect(surfaceSource).toMatch(
      /\.performer-surface\s*\{[^}]*--ui-performer-lyrics-max-width:\s*var\(\s*--ui-performer-lyrics-max-width-desk\s*\);[^}]*--ui-performer-cue-gap-comfortable:\s*var\(\s*--ui-performer-cue-gap-comfortable-desk\s*\);/u,
    );
    expect(surfaceSource).toMatch(
      /\.performer-surface\[data-reading-scale='near'\]\s*\{[^}]*--ui-performer-lyrics-max-width:\s*var\(\s*--ui-performer-lyrics-max-width-near\s*\);[^}]*--ui-performer-cue-gap-comfortable:\s*var\(\s*--ui-performer-cue-gap-comfortable-near\s*\);/u,
    );
    expect(surfaceSource).toMatch(
      /\.performer-surface\[data-reading-scale='stage'\]\s*\{[^}]*--ui-performer-lyrics-max-width:\s*var\(\s*--ui-performer-lyrics-max-width-stage\s*\);[^}]*--ui-performer-cue-gap-comfortable:\s*var\(\s*--ui-performer-cue-gap-comfortable-stage\s*\);/u,
    );
    expect(surfaceSource).toContain(
      '@container performer-surface (min-height: 30rem)',
    );
    expect(surfaceSource).toMatch(
      /@container performer-surface \(min-height: 30rem\)[\s\S]*?\.performer-surface__layout\s*\{[^}]*--ui-performer-cue-gap:\s*var\(--ui-performer-cue-gap-comfortable\);[^}]*gap:\s*var\(--ui-space-5\);[^}]*padding-block:\s*max\(var\(--ui-space-5\),\s*env\(safe-area-inset-top\)\)[^}]*padding-inline:\s*max\(var\(--ui-space-5\),\s*env\(safe-area-inset-left\)\)/u,
    );
    expect(surfaceSource).toMatch(
      /@container performer-surface \(max-height: 24rem\)[\s\S]*?\.performer-surface__layout\s*\{[^}]*--ui-performer-cue-gap:\s*var\(--ui-space-4\);/u,
    );
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
    expect(trackContextSource).toContain('frame.track?.title');
    expect(trackContextSource).toContain('frame.keyLabel');
    expect(trackContextSource).toContain('frame.tempoLabel');
    expect(cueStackSource).toContain('frame.currentLine');
    expect(cueStackSource).toContain('frame.nextLine');
    expect(nextTrackSource).toContain('<footer v-if="track"');
    expect(nextTrackSource).not.toContain('未排定');
    expect(cueSource).toContain('<ruby');
    expect(cueSource).toContain('<rt v-if="segment.reading">');
    expect(cueSource).toContain('reading?.romaji');
    expect(surfaceSource).toContain('container-name: performer-surface');
    expect(syncControlsSource).toContain("$emit('action', 'delay')");
    expect(displayControlsSource).toContain('UiSegmentedControl');
  });
});
