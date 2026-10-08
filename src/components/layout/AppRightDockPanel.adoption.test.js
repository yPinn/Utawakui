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

describe('AppRightDockPanel production adoption', () => {
  it.each([
    ['QueuePanel', queueSource],
    ['TrackContextPanel', contextSource],
    ['PerformanceSessionPanel', sessionSource],
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
    },
  );

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
    expect(queuePreviewSource.match(/<UiTrackRow/gu)).toHaveLength(1);
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
