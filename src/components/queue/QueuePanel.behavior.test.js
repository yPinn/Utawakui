import { readFileSync } from 'node:fs';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./QueuePanel.vue', import.meta.url),
  'utf8',
);
const dockPanelSource = readFileSync(
  new URL('../layout/AppRightDockPanel.vue', import.meta.url),
  'utf8',
);
const rowSource = readFileSync(
  new URL('./QueueTrackButton.vue', import.meta.url),
  'utf8',
);
const recentSource = readFileSync(
  new URL('./RecentPlaybackList.vue', import.meta.url),
  'utf8',
);
const artworkCueSource = readFileSync(
  new URL('./RightDockTrackArtworkCue.vue', import.meta.url),
  'utf8',
);
const menuButtonSource = readFileSync(
  new URL('./RightDockTrackMenuButton.vue', import.meta.url),
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

function compileScopedStyles(sourceText, filename) {
  const { descriptor, errors } = parse(sourceText, { filename });
  expect(errors).toEqual([]);
  return descriptor.styles
    .map((style, index) => {
      const result = compileStyle({
        filename,
        id: `data-v-right-dock-test-${index}`,
        scoped: style.scoped,
        source: style.content,
      });
      expect(result.errors).toEqual([]);
      return result.code;
    })
    .join('\n');
}

const artworkRevealSource = readFileSync(
  new URL('../ui/UiArtworkReveal.vue', import.meta.url),
  'utf8',
);
const artworkRevealCss = compileScopedStyles(
  artworkRevealSource,
  'UiArtworkReveal.vue',
);
const menuButtonCss = compileScopedStyles(
  menuButtonSource,
  'RightDockTrackMenuButton.vue',
);
const sectionCss = compileScopedStyles(sectionSource, 'QueueSection.vue');
const panelCss = compileScopedStyles(source, 'QueuePanel.vue');

describe('QueuePanel shared Dock content', () => {
  it('is a content layer rather than a floating PlayerBarPanel', () => {
    expect(source).toContain('<AppRightDockPanel');
    expect(source).toContain(
      "import AppRightDockPanel from '../layout/AppRightDockPanel.vue';",
    );
    expect(source).toContain('title="播放清單"');
    expect(source).toContain('collapse-label="摺疊播放佇列"');
    expect(source).toContain('@collapse="emit(\'collapse\')"');
    expect(source).not.toContain('AppRightDockHeader');
    expect(source).not.toContain('class="queue-panel__header"');
    expect(source).not.toContain('PlayerBarPanel');
    expect(source).not.toContain('position: fixed');
  });

  it('uses the Dock height as one bounded scroll surface', () => {
    expect(source).toContain('ref="dockPanel"');
    expect(source).toContain('dockPanel.value?.scrollTo({ top: 0 })');
    expect(source).not.toContain('<UiScrollRegion');
    expect(dockPanelSource).toContain('<UiScrollLayout');
    expect(dockPanelSource).toMatch(
      /\.app-right-dock-panel__scroll\s*\{[^}]*min-block-size:\s*0;[^}]*flex:\s*1;/su,
    );
    expect(source).not.toContain('--ui-queue-panel-max-height');
  });

  it('keeps true Queue and Recently Played tabpanels below fixed shared chrome', () => {
    expect(source).toContain("import UiTabs from '../ui/UiTabs.vue';");
    expect(source).toContain("const activeTab = shallowRef('queue');");
    expect(source).toContain('variant="bar"');
    expect(source).toContain('role="tabpanel"');
    expect(source).not.toContain('queue-panel__chrome--scrolled');
    expect(source).not.toContain('@scroll="updateScrollState"');
  });

  it('keeps Queue row media lazy without changing row paint geometry', () => {
    expect(rowSource).not.toContain('UiMarqueeText');
    expect(rowSource).toContain('UiTrackRow');
    expect(rowSource).toContain('overflow="ellipsis"');
    expect(sectionSource).toContain('overflow="ellipsis"');
    expect(rowSource).toContain('thumb-loading="lazy"');
    expect(rowSource).toContain('thumb-decoding="async"');
    expect(rowSource).toContain('hide-duration');
    expect(rowSource).toContain('artwork-clickable');
    expect(sectionSource).not.toContain('--ui-queue-track-thumb-size');
  });

  it('inherits standard Track Row type, radius, focus, and current roles', () => {
    for (const queueSource of [sectionSource, rowSource, trackRowSource]) {
      expect(queueSource).not.toContain('--ui-font-weight-strong');
      expect(queueSource).not.toContain('var(--ui-radius)');
    }
    expect(sectionSource).toMatch(
      /\.queue-section__title\s*\{[^}]*font-size:\s*var\(--ui-font-size-sm\);[^}]*font-weight:\s*var\(--ui-font-weight-semibold\);[^}]*line-height:\s*var\(--ui-line-height-label\);/su,
    );
    expect(trackRowSource).toMatch(
      /\.ui-track\s*\{[^}]*font-size:\s*var\(--ui-font-size-sm\);/su,
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
    expect(source).toMatch(
      /\.queue-panel__sections\s*\{[^}]*display:\s*grid;[^}]*gap:\s*var\(--ui-side-panel-section-gap\);/su,
    );
    expect(sectionSource).toMatch(
      /\.queue-section\s*\{[^}]*display:\s*grid;[^}]*gap:\s*var\(--ui-side-panel-content-gap\);/su,
    );
    expect(sectionSource).not.toMatch(/\.queue-section \+ \.queue-section/u);
    expect(sectionSource).not.toMatch(
      /\.queue-section__header\s*\{[^}]*margin-bottom:/su,
    );
  });

  it('keeps Queue and Recent interaction surfaces select-none', () => {
    expect(source).toMatch(
      /\.queue-panel__content\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/su,
    );
    expect(source).not.toContain('queue-panel__content--metadata-selectable');
    expect(source).not.toMatch(/user-select:\s*text/u);
    expect(source).not.toMatch(
      /\.queue-panel__content :deep\(\.ui-track__(?:title|artist)\)\s*\{[^}]*user-select:\s*text;/su,
    );
  });

  it('separates Track Row content inset from its hover and selected surface', () => {
    expect(trackRowSource).toContain('isolation: isolate;');
    expect(trackRowSource).toMatch(
      /\.ui-track::before\s*\{[^}]*inset-inline:\s*calc\(\s*-1\s*\*\s*var\(--ui-track-row-state-surface-outset-inline\)\s*\);[^}]*z-index:\s*-1;/su,
    );
    expect(trackRowSource).toMatch(
      /\.ui-track--interactive:not\(\.ui-track--active\):hover::before\s*\{[^}]*background:\s*var\(--ui-color-surface-hover\);/su,
    );
    expect(trackRowSource).toContain(
      '.ui-track--state-surface:not(.ui-track--active):focus-within::before,',
    );
    expect(trackRowSource).toMatch(
      /\.ui-track--state-surface:not\(\.ui-track--active\):hover::before,[\s\S]*?background:\s*var\(--ui-color-surface-hover\);/u,
    );
    expect(trackRowSource).toMatch(
      /\.ui-track--active::before\s*\{[^}]*background:\s*var\(--ui-track-row-selected-surface\);/su,
    );
    expect(trackRowSource).not.toContain('--ui-row-active-shadow');
    expect(trackRowSource).not.toContain('--ui-track-row-active-shadow');
    expect(panelCss).not.toMatch(
      /\.queue-panel[^{}]*\.right-dock-track:not\(\.ui-track--active\):hover::before/u,
    );
    expect(panelCss).not.toMatch(
      /\.queue-panel[^{}]*\.right-dock-track:not\(\.ui-track--active\):focus-within::before/u,
    );
  });

  it('keeps the source destination on the shared hover/focus underline contract without clipping its paint', () => {
    expect(sectionSource).toContain('class="queue-section__source-link"');
    expect(sectionSource).toMatch(/\.queue-section\s*\{[^}]*min-width:\s*0;/su);
    expect(sectionSource).toMatch(
      /\.queue-section__header\s*\{[^}]*min-width:\s*0;/su,
    );
    expect(sectionSource).toContain(
      "'queue-section__title-text--destination': titleJumpable",
    );
    expect(sectionSource).toMatch(
      /\.queue-section__title-text--destination\s*\{[^}]*overflow:\s*visible;/su,
    );
    expect(sectionSource).toMatch(
      /\.queue-section__source-link :deep\(\.ui-text-btn__text\)\s*\{[^}]*padding-block-end:\s*0\.18em;[^}]*margin-block-end:\s*-0\.18em;/su,
    );
    expect(sectionSource).not.toMatch(
      /\.queue-section__source-link :deep\(\.ui-text-btn__text\)\s*\{[^}]*text-decoration:/su,
    );
    expect(sectionCss).toMatch(
      /\.queue-section__source-link\[data-v-right-dock-test-0\]\s+\.ui-text-btn__text\s*\{[^}]*padding-block-end:\s*0\.18em;[^}]*margin-block-end:\s*-0\.18em;/su,
    );
    expect(sectionCss).not.toMatch(
      /\.queue-section__source-link\[data-v-right-dock-test-0\]\s+\.ui-text-btn__text\s*\{[^}]*text-decoration:/su,
    );
  });

  it('separates selection from playback while artist credits remain independent destinations', () => {
    expect(source).toContain('shallowRef');
    expect(source).toContain('const selectedTrackId = shallowRef(null);');
    expect(source).toContain('@select-track="selectQueueTrack"');
    expect(source).toContain('@activate-track="playCurrentTrack"');
    expect(source).toContain('@activate-track="playQueuedTrack(');
    expect(sectionSource).toContain(':active="track.id === selectedTrackId"');
    expect(sectionSource).toContain("'activateTrack'");
    expect(rowSource).toContain(
      '@row-dblclick="interactive && emit(\'activate\', track)"',
    );
    expect(rowSource).toContain(
      '@artwork-click="emit(\'togglePlayback\', track)"',
    );
    expect(rowSource).not.toContain('title-clickable');
    expect(rowSource).not.toContain('titleClick');
    expect(rowSource).toContain(
      "import TrackArtistCredits from '../track/TrackArtistCredits.vue';",
    );
    expect(rowSource).toContain('<template #artist>');
    expect(rowSource).toContain('<TrackArtistCredits');
    expect(rowSource).toContain('@navigate="emit(\'navigateArtist\', $event)"');
    expect(rowSource).toContain(
      "'.ui-icon-btn, .ui-text-btn, .ui-track__artwork-action'",
    );
    expect(sectionSource).toContain("'artistNavigate'");
    expect(sectionSource).toContain(
      '@navigate-artist="emit(\'artistNavigate\', $event)"',
    );
    expect(recentSource).toContain("'artistNavigate'");
    expect(recentSource).toContain(
      '@navigate-artist="emit(\'artistNavigate\', $event)"',
    );
    expect(source.match(/@artist-navigate="emit\('close'\)"/gu)).toHaveLength(
      4,
    );
    expect(source).not.toContain('jumpFromQueue');
    expect(source).not.toContain('jumpableTrackIds');
    expect(source).not.toContain('albumPlaylistByTrackId');
  });

  it('projects HTML audio playback state into artwork play/pause without changing row selection', () => {
    expect(source).toContain('state: playerState');
    expect(source).toContain('toggle: togglePlayerPlayback');
    expect(source).toContain('playerState.track?.id === track.id');
    expect(source).toContain(
      ':playing-track-id="playerState.track?.id ?? null"',
    );
    expect(source).toContain(':player-playing="playerState.isPlaying"');
    expect(source).toContain(
      '@toggle-track-playback="toggleCurrentTrackPlayback"',
    );
    expect(source).toContain(
      '@toggle-entry-playback="toggleRecentEntryPlayback"',
    );
    expect(sectionSource).toContain(
      ':playing="playerPlaying && track.id === playingTrackId"',
    );
    expect(rowSource).toContain(':artwork-label="artworkActionLabel"');
    expect(rowSource).toContain(
      '<RightDockTrackArtworkCue :playing="playing" />',
    );
  });

  it('keeps an independent Recent selection while leaving history clearing out of the panel', () => {
    expect(source).toContain(
      "import { useRecentPlaybackActivation } from '../../composables/useRecentPlaybackActivation.js';",
    );
    expect(source).toContain(
      'const { activateRecentEntry } = useRecentPlaybackActivation();',
    );
    expect(source).toContain(
      'const selectedRecentEntryKey = shallowRef(null);',
    );
    expect(source).toContain('function selectRecentEntry(entry)');
    expect(source).toContain('selectedRecentEntryKey.value = entry.key;');
    expect(source).toContain(':selected-entry-key="selectedRecentEntryKey"');
    expect(source).toContain('@select-entry="selectRecentEntry"');
    expect(source).toContain('@activate-entry="activateRecentEntry"');
    expect(source).not.toContain('@clear="clearRecentPlayback"');
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
      "import RightDockTrackMenuButton from './RightDockTrackMenuButton.vue';",
    );
    expect(rowSource).toContain('<RightDockTrackMenuButton');
    expect(rowSource).toContain("'openMenu'");
    expect(sectionSource).toContain("'openTrackMenu'");
    expect(trackRowSource).not.toContain('UiContextMenu');
    expect(trackRowSource).not.toContain('menuItems');
  });

  it('shares one Right Dock artwork-hover and overflow-action recipe with recent rows', () => {
    expect(rowSource).toContain(
      "import RightDockTrackArtworkCue from './RightDockTrackArtworkCue.vue';",
    );
    expect(rowSource).toContain(
      "import RightDockTrackMenuButton from './RightDockTrackMenuButton.vue';",
    );
    expect(rowSource).toContain('right-dock-track');
    expect(rowSource).toContain('<RightDockTrackArtworkCue');
    expect(rowSource).toContain('<RightDockTrackMenuButton');
    expect(rowSource).toContain('right-dock-track--menu-open');
    expect(recentSource).toContain(
      "import QueueTrackButton from './QueueTrackButton.vue';",
    );
    expect(recentSource).toContain('<QueueTrackButton');
    expect(recentSource).not.toContain('RightDockTrackArtworkCue');
    expect(recentSource).not.toContain('RightDockTrackMenuButton');
    expect(rowSource).not.toContain('queue-track__artwork-cue');
    expect(rowSource).not.toContain('queue-track__menu');
    expect(recentSource).not.toContain('recent-playback__artwork-cue');
    // Geometry comes from UiTrackRow's UiArtworkOverlay; the reveal comes from
    // UiArtworkReveal with the row as a focus-within reveal scope.
    expect(artworkCueSource).toContain('<UiArtworkReveal>');
    expect(rowSource).toContain('data-artwork-reveal-scope="focus-within"');
    expect(artworkCueSource).not.toMatch(
      /\.right-dock-track__artwork-cue\s*\{[^}]*(?:position:|inset:|z-index:|border-radius:|opacity:|transition:)/su,
    );
    expect(menuButtonSource).toMatch(
      /\.right-dock-track__menu\s*\{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/su,
    );
    for (const revealSelector of [
      ':global(.right-dock-track:hover .right-dock-track__menu)',
      ':global(.right-dock-track:focus-within .right-dock-track__menu)',
      ':global(.right-dock-track.ui-track--active .right-dock-track__menu)',
      ':global(.right-dock-track--menu-open .right-dock-track__menu)',
    ]) {
      expect(menuButtonSource).toContain(revealSelector);
    }
  });

  it('keeps the reveal target intact after Vue compiles scoped styles', () => {
    // Vue drops anything after :global(x), so the scope selectors must still
    // reach .ui-artwork-reveal itself after compilation.
    expect(artworkRevealCss).toMatch(
      /\[data-artwork-reveal-scope\]:hover\s+\.ui-artwork-reveal/u,
    );
    expect(artworkRevealCss).toMatch(
      /\[data-artwork-reveal-scope='focus-within'\]:focus-within\s+\.ui-artwork-reveal/u,
    );
    expect(menuButtonCss).toMatch(
      /\.right-dock-track:hover\s+\.right-dock-track__menu/u,
    );
    expect(menuButtonCss).toMatch(
      /\.right-dock-track\.ui-track--active\s+\.right-dock-track__menu/u,
    );
    expect(menuButtonCss).toMatch(
      /\.right-dock-track--menu-open\s+\.right-dock-track__menu/u,
    );
    // Reduced motion: the shared reveal times on --ui-motion-duration-fast,
    // which tokens.css zeroes for both the manual and the OS preference.
    expect(artworkRevealCss).toMatch(
      /transition:\s*opacity var\(--ui-motion-duration-fast\)/u,
    );
    expect(artworkRevealSource).not.toContain('--ui-motion-duration-feedback');
    expect(menuButtonCss).toMatch(
      /:root\[data-ui-motion=['"]reduced['"]\]\s+\.right-dock-track__menu/u,
    );
  });

  it('keeps the menu tooltip action phrase intact instead of splitting 選項', () => {
    expect(menuButtonSource).toContain(':title="trackTitle"');
    expect(menuButtonSource).toContain('tooltip-suffix="的更多選項"');
    expect(menuButtonSource).toContain(':label="`${trackTitle}的更多選項`"');
  });

  it('keeps whole-row Queue drag, aligned drop guidance, and a separate menu action', () => {
    const rowTagStart = rowSource.indexOf('<UiTrackRow');
    const rowTag = rowSource.slice(
      rowTagStart,
      rowSource.indexOf('>', rowTagStart),
    );

    expect(rowSource).not.toContain('GripVertical');
    expect(rowSource).not.toContain('queue-track__drag-guide');
    expect(rowSource).toContain(':draggable="draggable"');
    expect(rowSource).toContain('@pointerdown="handlePointerDown"');
    expect(rowSource).toContain('@dragstart="handleDragStart"');
    expect(rowSource).toContain('@dragend="handleDragEnd"');
    expect(rowSource).toContain('<RightDockTrackMenuButton');
    expect(rowSource).toContain("@open=\"emit('openMenu'");
    expect(rowTag).toContain(':draggable="draggable"');
    expect(rowSource).not.toContain(':label="`調整順序：${track.title}`"');
    expect(rowSource).not.toContain('aria-keyshortcuts="ArrowUp ArrowDown"');
    expect(rowSource).not.toContain("emit('move', direction)");
    expect(sectionSource).not.toContain("'trackMove'");
    expect(sectionSource).not.toContain('@move="moveTrack(track, $event)"');
    expect(source).not.toContain('@track-move="reorderQueuedTrack"');
    expect(source).not.toContain('@track-move="reorderSourceTrack"');
    expect(sectionSource).toContain(
      "'queue-section__item--draggable': draggableItems",
    );
    expect(sectionSource).toMatch(
      /\.queue-section__item\s*\{[^}]*inline-size:\s*100%;[^}]*min-inline-size:\s*0;[^}]*max-inline-size:\s*100%;/su,
    );
    expect(sectionSource).toMatch(
      /\.queue-section__item--draggable\.queue-track\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/su,
    );
    expect(sectionSource).toMatch(
      /:drop-position="\s*dropTargetTrackId === track\.id \? dropPosition : null\s*"/u,
    );
    expect(sectionSource).not.toContain('queue-section__item--drop-before');
    expect(sectionSource).not.toContain('queue-section__item--drop-after');
    expect(sectionSource).not.toContain('box-shadow: inset');
    expect(rowSource).toContain(
      "import UiSeparator from '../ui/UiSeparator.vue';",
    );
    expect(rowSource).toContain('dropPosition:');
    expect(rowSource).toContain('<template #overlay>');
    expect(rowSource).toContain('<UiSeparator');
    expect(rowSource).toContain('tone="accent"');
    expect(rowSource).toContain('queue-track__drop-indicator');
    expect(rowSource).toMatch(
      /\.queue-track__drop-indicator\s*\{[^}]*position:\s*absolute;[^}]*inset-inline:\s*0;[^}]*pointer-events:\s*none;/su,
    );
    expect(rowSource).toMatch(
      /\.queue-track__drop-indicator--before\s*\{[^}]*inset-block-start:\s*calc\(-0\.5 \* var\(--ui-space-1\)\);/su,
    );
    expect(rowSource).toMatch(
      /\.queue-track__drop-indicator--after\s*\{[^}]*inset-block-end:\s*calc\(-0\.5 \* var\(--ui-space-1\)\);/su,
    );
    expect(rowSource).not.toMatch(
      /\.queue-track__drop-indicator\s*\{[^}]*(?:background|block-size|box-shadow):/su,
    );
    expect(trackRowSource).toContain('<slot name="overlay" />');
  });

  it('does not paint-contain any Queue row state surface based on reorder capability', () => {
    expect(sectionCss).not.toMatch(/content-visibility:\s*auto;/u);
    expect(sectionCss).not.toMatch(/contain-intrinsic-(?:block-)?size:/u);
  });
});
