import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const queueSource = readSource('../queue/QueuePanel.vue');
const contextSource = readSource('../playlists/TrackContextPanel.vue');
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
