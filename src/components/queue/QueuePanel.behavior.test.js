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
    expect(trackRowSource).toMatch(
      /\.ui-track__title\s*\{[^}]*font-weight:\s*var\(--ui-font-weight-semibold\);[^}]*line-height:\s*var\(--ui-line-height-label\);/su,
    );
    expect(trackRowSource).toMatch(
      /\.ui-track__artist\s*\{[^}]*color:\s*var\(--ui-color-text-muted\);[^}]*font-weight:\s*var\(--ui-font-weight-regular\);[^}]*line-height:\s*var\(--ui-line-height-caption\);/su,
    );
    expect(trackRowSource).toContain('ui-track--interactive');
    expect(trackRowSource).toContain('ui-track--current');
    expect(rowSource).not.toContain('queue-track__select');
    expect(rowSource).not.toContain('queue-track__cover');
  });

  it('owns section line rhythm without child margins defining content boundaries', () => {
    expect(sectionSource).toMatch(
      /\.queue-section\s*\{[^}]*display:\s*grid;[^}]*gap:\s*var\(--ui-space-3\);/su,
    );
    expect(sectionSource).toMatch(
      /\.queue-section \+ \.queue-section\s*\{[^}]*margin-top:\s*var\(--ui-space-5\);/su,
    );
    expect(sectionSource).not.toMatch(
      /\.queue-section__header\s*\{[^}]*margin-bottom:/su,
    );
  });

  it('protects Queue chrome from drag selection while preserving track metadata', () => {
    expect(source).toMatch(
      /\.queue-panel__scroll\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/su,
    );
    expect(source).toMatch(
      /\.queue-panel__content :deep\(\.ui-track__title\),[\s\S]*?\.queue-panel__content :deep\(\.ui-track__artist\)\s*\{[^}]*-webkit-user-select:\s*text;[^}]*user-select:\s*text;/u,
    );
    expect(source).not.toMatch(
      /\.queue-panel__scroll :deep\(\.ui-hint\)\s*\{[^}]*user-select:\s*text;/su,
    );
  });

  it('separates Track Row content inset from its hover and selected surface', () => {
    expect(trackRowSource).toContain('isolation: isolate;');
    expect(trackRowSource).toMatch(
      /\.ui-track::before\s*\{[^}]*inset-inline:\s*calc\(\s*-1\s*\*\s*var\(--ui-track-row-state-surface-outset-inline\)\s*\);[^}]*z-index:\s*-1;/su,
    );
    expect(trackRowSource).toMatch(
      /\.ui-track--interactive:hover::before\s*\{[^}]*background:\s*var\(--ui-color-surface-hover\);/su,
    );
    expect(trackRowSource).toMatch(
      /\.ui-track--active::before\s*\{[^}]*background:\s*var\(--ui-color-surface-selected\);[^}]*box-shadow:\s*var\(--ui-row-active-shadow\);/su,
    );
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

  it('owns one shared track action dispatch for queue and recent rows', () => {
    expect(source).toContain(
      "import TrackActionMenu from '../track/TrackActionMenu.vue';",
    );
    expect(source).toContain('const trackMenu = shallowRef(null);');
    expect(source).toContain('function openTrackMenu(payload)');
    expect(source).toContain('@open-track-menu="openTrackMenu"');
    expect(source).toContain(':open-menu-key="openTrackMenuKey"');
    expect(source).toContain('<TrackActionMenu');
    expect(source).toContain(':context="trackMenu?.context ?? \'default\'"');
    expect(source).toContain(':playlists="playlistState.playlists"');
    expect(source).toContain('@select="handleTrackMenuSelect"');
    expect(source).toContain('TRACK_MENU_ACTIONS.removeFromQueue');
    expect(source).toContain('removeQueuedTrack(track.id)');
  });

  it('keeps menu intent in feature owners rather than the shared track primitive', () => {
    expect(rowSource).toContain(
      "import UiIconButton from '../ui/UiIconButton.vue';",
    );
    expect(rowSource).toContain(':icon="Ellipsis"');
    expect(rowSource).toContain("'openMenu'");
    expect(sectionSource).toContain("'openTrackMenu'");
    expect(trackRowSource).not.toContain('UiContextMenu');
    expect(trackRowSource).not.toContain('menuItems');
  });
});
