import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./QueuePanel.vue', import.meta.url),
  'utf8',
);
const rowSource = readFileSync(
  new URL('./QueueTrackButton.vue', import.meta.url),
  'utf8',
);
const sectionSource = readFileSync(
  new URL('./QueueSection.vue', import.meta.url),
  'utf8',
);
const trackRowSource = readFileSync(
  new URL('../ui/UiTrackRow.vue', import.meta.url),
  'utf8',
);

describe('QueuePanel shared Dock content', () => {
  it('is a content layer rather than a floating PlayerBarPanel', () => {
    expect(source).toContain(
      '<section class="queue-panel" aria-label="播放清單">',
    );
    expect(source).toContain(
      "import AppRightDockHeader from '../layout/AppRightDockHeader.vue';",
    );
    expect(source).toContain('<AppRightDockHeader');
    expect(source).toContain('close-label="關閉播放佇列"');
    expect(source).toContain('@close="emit(\'close\')"');
    expect(source).not.toContain('class="queue-panel__header"');
    expect(source).not.toContain('PlayerBarPanel');
    expect(source).not.toContain('position: fixed');
  });

  it('uses the Dock height as one bounded scroll surface', () => {
    expect(source).toMatch(
      /\.queue-panel\s*\{[^}]*min-height:\s*0;[^}]*height:\s*100%;[^}]*flex-direction:\s*column;/su,
    );
    expect(source).toMatch(
      /\.queue-panel__scroll\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1;[^}]*overflow-y:\s*auto;/su,
    );
    expect(source).not.toContain('--ui-queue-panel-max-height');
  });

  it('uses true Queue and Recently Played tabpanels under sticky shared chrome', () => {
    expect(source).toContain("import UiTabs from '../ui/UiTabs.vue';");
    expect(source).toContain("const activeTab = shallowRef('queue');");
    expect(source).toContain('variant="bar"');
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain('queue-panel__chrome--scrolled');
    expect(source).toContain('@scroll="updateScrollState"');
    expect(source).toMatch(
      /\.queue-panel__chrome\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;[^}]*z-index:\s*var\(--ui-z-sticky\);/su,
    );
    expect(source).toMatch(
      /\.queue-panel__chrome--scrolled\s*\{[^}]*backdrop-filter:\s*blur\(var\(--ui-right-dock-sticky-blur\)\);[^}]*box-shadow:\s*var\(--ui-right-dock-sticky-shadow\);/su,
    );
  });

  it('keeps long Queue rows cheap until their pixels are needed', () => {
    expect(rowSource).not.toContain('UiMarqueeText');
    expect(rowSource).toContain('UiTrackRow');
    expect(rowSource).toContain('overflow="ellipsis"');
    expect(sectionSource).toContain('overflow="ellipsis"');
    expect(rowSource).toContain('thumb-loading="lazy"');
    expect(rowSource).toContain('thumb-decoding="async"');
    expect(rowSource).toContain('hide-duration');
    expect(rowSource).toContain('artwork-clickable');
    expect(sectionSource).toContain('content-visibility: auto');
    expect(sectionSource).toContain('contain-intrinsic-block-size');
    expect(sectionSource).toContain('var(--ui-track-row-min-height)');
    expect(sectionSource).not.toContain('--ui-queue-track-thumb-size');
  });

  it('inherits standard Track Row type, radius, focus, and current roles', () => {
    for (const queueSource of [sectionSource, rowSource, trackRowSource]) {
      expect(queueSource).not.toContain('--ui-font-weight-strong');
      expect(queueSource).not.toContain('var(--ui-radius)');
    }
    expect(sectionSource).toMatch(
      /\.queue-section__title\s*\{[^}]*font-weight:\s*var\(--ui-font-weight-semibold\);[^}]*line-height:\s*var\(--ui-line-height-label\);/su,
    );
    expect(trackRowSource).toContain(
      'min-height: var(--ui-track-row-min-height)',
    );
    expect(trackRowSource).toContain('size="var(--ui-track-row-thumb-size)"');
    expect(trackRowSource).toContain('ui-track--interactive');
    expect(trackRowSource).toContain('ui-track--current');
    expect(rowSource).not.toContain('queue-track__select');
    expect(rowSource).not.toContain('queue-track__cover');
  });

  it('separates selection from playback and keeps track metadata non-navigational', () => {
    expect(source).toContain('shallowRef');
    expect(source).toContain('const selectedTrackId = shallowRef(null);');
    expect(source).toContain('@select-track="selectQueueTrack"');
    expect(source).toContain('@activate-track="playCurrentTrack"');
    expect(source).toContain('@activate-track="playQueuedTrack(');
    expect(sectionSource).toContain(':active="track.id === selectedTrackId"');
    expect(sectionSource).toContain("'activateTrack'");
    expect(rowSource).toContain('@dblclick="emit(\'activate\', track)"');
    expect(rowSource).toContain('@artwork-click="emit(\'activate\', track)"');
    expect(rowSource).not.toContain('title-clickable');
    expect(rowSource).not.toContain('titleClick');
    expect(source).not.toContain('jumpFromQueue');
    expect(source).not.toContain('jumpableTrackIds');
    expect(source).not.toContain('albumPlaylistByTrackId');
  });

  it('delegates recent playback activation to the queue-aware feature owner', () => {
    expect(source).toContain(
      "import { useRecentPlaybackActivation } from '../../composables/useRecentPlaybackActivation.js';",
    );
    expect(source).toContain(
      'const { activateRecentEntry } = useRecentPlaybackActivation();',
    );
    expect(source).not.toContain('interruptWithTrack(entry.track)');
  });
});
