import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const queueSource = readSource('../queue/QueuePanel.vue');
const contextSource = readSource('../playlists/TrackContextPanel.vue');
const queuePreviewSource = readSource('../playlists/TrackQueuePreview.vue');
const sessionSource = readSource(
  '../performance-session/PerformanceSessionPanel.vue',
);
const separationQueueSource = readSource(
  '../separation/SeparationQueuePanel.vue',
);

describe('AppRightDockPanel production adoption', () => {
  it.each([
    ['QueuePanel', queueSource],
    ['TrackContextPanel', contextSource],
    ['PerformanceSessionPanel', sessionSource],
    ['SeparationQueuePanel', separationQueueSource],
  ])(
    '%s delegates shared Dock geometry and scrolling to the compound',
    (_, source) => {
      expect(source).toContain(
        "import AppRightDockPanel from '../layout/AppRightDockPanel.vue';",
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
    ['PerformanceSessionPanel', sessionSource, '摺疊場次'],
    ['SeparationQueuePanel', separationQueueSource, '摺疊伴奏處理'],
  ])('%s forwards the shared Dock collapse contract', (_, source, label) => {
    expect(source).toContain(`collapse-label="${label}"`);
    expect(source).toContain('@collapse="emit(\'collapse\')"');
    expect(source).not.toContain('close-label=');
  });

  it('uses feature-owned playback sections below the media Hero', () => {
    expect(contextSource).toContain(
      "import AppRightDockSection from '../layout/AppRightDockSection.vue';",
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

  it('uses shared sections for the session groups without a local separator recipe', () => {
    expect(sessionSource).toContain(
      "import AppRightDockSection from '../layout/AppRightDockSection.vue';",
    );
    expect(sessionSource.match(/<AppRightDockSection/gu)).toHaveLength(2);
    expect(sessionSource).toContain('heading="待唱安排"');
    expect(sessionSource).toContain(
      ':heading="`目前選取的${selectedCollectionKindLabel}`"',
    );
    expect(sessionSource).toContain('divided');
    expect(sessionSource).not.toContain('UiSeparator');
    expect(sessionSource).not.toContain('<section');
  });
});
