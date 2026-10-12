import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const queueSource = readSource('../queue/QueuePanel.vue');
const contextSource = readSource('../playback/context/TrackContextPanel.vue');
const queuePreviewSource = readSource(
  '../playback/context/TrackQueuePreview.vue',
);
const preparationSource = readSource('../preparation/PreparationDockPanel.vue');
const importSource = readSource('../import/ImportDockContent.vue');
const separationSource = readSource('../separation/SeparationDockContent.vue');

describe('AppRightDockPanel production adoption', () => {
  it.each([
    ['QueuePanel', queueSource, '../layout/AppRightDockPanel.vue'],
    ['TrackContextPanel', contextSource, '../../layout/AppRightDockPanel.vue'],
    [
      'PreparationDockPanel',
      preparationSource,
      '../layout/AppRightDockPanel.vue',
    ],
  ])(
    '%s delegates shared Dock geometry and scrolling to the compound',
    (_, source, importPath) => {
      expect(source).toContain(
        `import AppRightDockPanel from '${importPath}';`,
      );
      expect(source).toContain('<AppRightDockPanel');
      expect(source).not.toContain('AppRightDockHeader');
      expect(source).not.toContain('UiScrollRegion');
      expect(source).not.toContain('--ui-right-dock-');
      expect(source).not.toContain('hasScrolled');
      expect(source).not.toContain('updateScrollState');
      expect(source).not.toContain('chrome--scrolled');
    },
  );

  it.each([
    ['QueuePanel', queueSource, '摺疊播放佇列'],
    ['TrackContextPanel', contextSource, '摺疊播放資訊'],
    ['PreparationDockPanel', preparationSource, '摺疊曲目準備'],
  ])('%s forwards the shared Dock collapse contract', (_, source, label) => {
    expect(source).toContain(`collapse-label="${label}"`);
    expect(source).toContain('@collapse="emit(\'collapse\')"');
    expect(source).not.toContain('close-label=');
  });

  it('uses feature-owned playback sections below the media Hero', () => {
    expect(contextSource).toContain(
      "import AppRightDockSection from '../../layout/AppRightDockSection.vue';",
    );
    expect(contextSource).not.toContain('TrackContextBlock');
    expect(contextSource).not.toContain('useStudioLibraryInspectorWidth');
    expect(contextSource).toContain(
      "import TrackContextHero from './TrackContextHero.vue';",
    );
    expect(contextSource).toMatch(
      /<TrackContextHero[\s\S]*?:track="currentTrack"/u,
    );
    expect(contextSource).toContain('<TrackLyricsPreview');
    expect(contextSource).toContain('<TrackArtistPreview');
    expect(contextSource).toContain('<TrackQueuePreview');
    expect(contextSource).not.toContain('<UiTrackRow');
    expect(queuePreviewSource).not.toContain('<UiTrackRow');
    expect(queuePreviewSource.match(/<QueueTrackButton/gu)).toHaveLength(1);
    expect(contextSource).not.toMatch(/:tracks="\[currentTrack\]"/u);
  });

  it('uses shared sections for the import groups without a local separator recipe', () => {
    expect(importSource).toContain(
      "import AppRightDockSection from '../layout/AppRightDockSection.vue';",
    );
    expect(importSource.match(/<AppRightDockSection/gu)).toHaveLength(2);
    expect(importSource).toContain('heading="本機音訊"');
    expect(importSource).toContain('heading="外部來源"');
    expect(importSource).toContain('divided');
    expect(importSource).not.toContain('UiSeparator');
  });

  it('keeps Import and Separation content free of nested Dock shells', () => {
    for (const source of [importSource, separationSource]) {
      expect(source).not.toContain('AppRightDockPanel');
      expect(source).not.toContain('AppRightDockHeader');
      expect(source).not.toContain('UiScrollRegion');
    }
  });
});
