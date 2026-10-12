import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('contextual app navigation intents', () => {
  it('routes Library content callers without exposing the legacy Setlist id', () => {
    for (const path of [
      './useAlbumNavigation.js',
      '../components/layout/AppPlaylistSidebar.vue',
    ]) {
      const source = readSource(path);
      expect(source).toContain('openLibraryContent');
      expect(source).not.toContain("setActiveView('setlist')");
    }
  });

  it('separates Lyrics authoring and live-reading intents at their entry points', () => {
    const authoringSource = readSource('../views/StudioLibraryContextView.vue');
    const liveSource = readSource('../components/playback/PlayerBar.vue');

    expect(authoringSource).toContain('openLyricsAuthoring');
    expect(authoringSource).not.toContain("setActiveView('lyrics')");
    expect(liveSource).toContain('openLiveLyrics');
    expect(liveSource).not.toContain("setActiveView('lyrics')");
  });

  it('opens session preparation through a Performance intent', () => {
    const source = readSource('./usePerformanceSessionWorkspace.js');

    expect(source).toContain('openPerformancePreparation');
    expect(source).not.toContain("setActiveView('setlist')");
  });
});
