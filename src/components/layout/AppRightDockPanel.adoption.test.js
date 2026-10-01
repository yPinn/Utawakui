import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const queueSource = readSource('../queue/QueuePanel.vue');
const contextSource = readSource('../playlists/TrackContextPanel.vue');

describe('AppRightDockPanel production adoption', () => {
  it.each([
    ['QueuePanel', queueSource],
    ['TrackContextPanel', contextSource],
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

  it('uses flat shared sections and Track Row for the playback identity', () => {
    expect(contextSource).toContain(
      "import AppRightDockSection from '../layout/AppRightDockSection.vue';",
    );
    expect(contextSource).not.toContain('TrackContextBlock');
    expect(contextSource).not.toContain('useStudioLibraryInspectorWidth');
    expect(contextSource).toMatch(
      /heading="目前播放"[\s\S]*?<UiTrackRow[\s\S]*?:track="currentTrack"/u,
    );
    expect(contextSource).not.toMatch(/:tracks="\[currentTrack\]"/u);
  });
});
