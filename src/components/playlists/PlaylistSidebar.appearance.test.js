import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./PlaylistSidebar.vue', import.meta.url),
  'utf8',
);
const rowSource = readFileSync(
  new URL('./PlaylistSidebarRow.vue', import.meta.url),
  'utf8',
);

describe('PlaylistSidebar compact-to-expanded stability', () => {
  it('searches collection members by every integrated artist form', () => {
    expect(source).toMatch(
      /import\s*\{[\s\S]*?artistSearchTexts[\s\S]*?\}\s*from '\.\.\/\.\.\/utils\/artistPage\.js'/u,
    );
    expect(source).toMatch(
      /function playlistMatchesSearch\(playlist\)[\s\S]*?artistSearchTexts\(track, artistIndexState\.index\)/u,
    );
  });

  it('delegates collection playback state and transitions to the shared controller', () => {
    expect(source).toContain(
      "import { useCollectionPlayback } from '../../composables/useCollectionPlayback.js'",
    );
    expect(source).toContain(
      'const collectionPlayback = useCollectionPlayback();',
    );
    expect(source).not.toContain('import { usePlayer }');
    expect(source).not.toContain('import { usePlaybackQueue }');
    expect(source).not.toContain('playTrack(toPlayableTrack(first))');
  });

  it('covers fixed library rows, collection rows, and scroll blank space with scoped context menus', () => {
    expect(source).toContain("kind: 'global'");
    expect(source).toContain("kind: 'collection'");
    expect(source).toContain('function openGlobalMenu(event)');
    expect(source).toMatch(
      /<UiScrollLayout[\s\S]*?@contextmenu="openGlobalMenu"[\s\S]*?>/u,
    );
    expect(source.match(/@contextmenu="openGlobalMenu"/gu)).toHaveLength(3);
    expect(
      source.match(/@contextmenu="openPlaylistMenu\(playlist, \$event\)"/gu),
    ).toHaveLength(1);
    expect(source).toContain(
      '@contextmenu="openPlaylistMenu(entry.item, $event)"',
    );
    expect(source).toContain("label: '建立播放清單'");
    expect(source).toContain("label: '建立資料夾'");
    expect(source).toMatch(
      /label: '建立資料夾',[\s\S]*?status: '尚未支援',[\s\S]*?disabled: true,/u,
    );
  });

  it('keeps commands and global destinations fixed while only collections own scrolling', () => {
    expect(source).toContain(
      "import UiScrollLayout from '../ui/UiScrollLayout.vue'",
    );
    expect(source).toContain('class="playlist-sidebar__scroll"');
    expect(source).toContain('class="playlist-sidebar__list"');
    expect(source).toContain(
      ":scrollbar-visibility=\"compact ? 'hidden' : 'auto'\"",
    );
    const toolbarAt = source.indexOf('class="playlist-sidebar__toolbar"');
    const fixedNavigationAt = source.indexOf(
      'class="playlist-sidebar__fixed-navigation"',
    );
    const allTracksAt = source.indexOf('aria-label="全部曲目"');
    const localTracksAt = source.indexOf('aria-label="本機檔案"');
    const scrollAt = source.indexOf('<UiScrollLayout');
    const collectionsAt = source.indexOf(
      'v-for="playlist in visiblePlaylistItems"',
    );

    expect(toolbarAt).toBeLessThan(fixedNavigationAt);
    expect(fixedNavigationAt).toBeLessThan(allTracksAt);
    expect(allTracksAt).toBeLessThan(localTracksAt);
    expect(localTracksAt).toBeLessThan(scrollAt);
    expect(source).not.toContain('匯入曲目');
    expect(source).not.toContain('本機曲目');
    expect(source).not.toContain('ArrowDownToLine');
    expect(scrollAt).toBeLessThan(collectionsAt);
    for (const [layoutRole, featureRole] of [
      ['block-start', 'list-gap'],
      ['block-end', 'sidebar-padding-block'],
      ['inline-start', 'sidebar-padding-inline'],
      ['inline-end', 'row-state-surface-outset-inline'],
    ]) {
      expect(source).toMatch(
        new RegExp(
          `--ui-scroll-layout-padding-${layoutRole}:\\s*var\\(\\s*--ui-playlist-${featureRole}\\s*\\);`,
          'u',
        ),
      );
    }
    expect(source).not.toContain('playlist-sidebar__scroll-viewport');
  });

  it('assigns perimeter, sibling rhythm, and empty-state inset to their owning layers', () => {
    expect(source).toMatch(
      /\.playlist-sidebar\s*\{[^}]*padding-block-start:\s*var\(--ui-playlist-sidebar-padding-block\);/su,
    );
    expect(source).toMatch(
      /\.playlist-sidebar__toolbar\s*\{[^}]*margin-inline:\s*var\(--ui-playlist-sidebar-padding-inline\);/su,
    );
    expect(source).toMatch(
      /\.playlist-sidebar__fixed-navigation\s*\{[^}]*margin-inline-start:\s*var\(--ui-playlist-sidebar-padding-inline\);[^}]*margin-inline-end:\s*var\(--ui-playlist-row-state-surface-outset-inline\);/su,
    );
    expect(source).not.toMatch(
      /\.playlist-sidebar__toolbar\s*\{[^}]*margin-block-start:/su,
    );
    expect(source).toMatch(
      /\.playlist-sidebar__divider\s*\{[^}]*margin-block:\s*calc\(\s*var\(--ui-playlist-section-gap\)\s*-\s*var\(--ui-playlist-list-gap\)\s*\);[^}]*margin-inline:\s*0;/su,
    );
    expect(source).toMatch(
      /\.playlist-sidebar__empty\s*\{[^}]*margin:\s*0;[^}]*padding:/su,
    );
  });

  it('keeps both toolbar anatomies mounted and fades between them with global motion tokens', () => {
    expect(source).toContain('playlist-sidebar__toolbar-expanded');
    expect(source).toContain('playlist-sidebar__toolbar-action--compact');
    expect(source).toContain(
      'var(--ui-sidebar-row-padding-inline) + var(--ui-border-width)',
    );
    expect(source).toMatch(
      /\.playlist-sidebar__toolbar-expanded,[\s\S]*?\.playlist-sidebar__toolbar-action--compact\s*\{[^}]*transition:[^}]*var\(--ui-motion-duration-fast\)[^}]*var\(--ui-motion-easing-exit\)/u,
    );
    expect(source).toMatch(
      /@container \(width < 256px\)[\s\S]*?\.playlist-sidebar__toolbar-expanded\s*\{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;/u,
    );
    expect(source).toMatch(
      /@container \(width < 256px\)[\s\S]*?\.playlist-sidebar__toolbar-action--compact\s*\{[^}]*opacity:\s*1;[^}]*visibility:\s*visible;/u,
    );
  });

  it('keeps row copy mounted and fades it without display-none layout churn', () => {
    expect(source).toMatch(
      /\.playlist-sidebar__info\s*\{[^}]*transition:[^}]*opacity\s+var\(--ui-motion-duration-standard\)\s+var\(--ui-motion-easing-enter\)/u,
    );
    expect(rowSource).toMatch(
      /\.playlist-sidebar-row__info\s*\{[^}]*transition:[^}]*opacity\s+var\(--ui-motion-duration-standard\)\s+var\(--ui-motion-easing-enter\)/u,
    );
    expect(source).not.toMatch(
      /@container \(width < 256px\)[\s\S]*?\.playlist-sidebar__info\s*\{[^}]*display:\s*none;/u,
    );
    expect(rowSource).not.toMatch(
      /@container \(width < 256px\)[\s\S]*?\.playlist-sidebar-row__info\s*\{[^}]*display:\s*none;/u,
    );
  });

  it('removes motion for both manual and OS reduced-motion preferences', () => {
    for (const componentSource of [source, rowSource]) {
      expect(componentSource).toContain("data-ui-motion='reduced'");
      expect(componentSource).toContain('prefers-reduced-motion: reduce');
    }
  });

  it('keeps row content aligned while expanding the hover and selected surface only', () => {
    expect(source).toContain('playlist-sidebar__item-state-surface');
    expect(rowSource).toContain('playlist-sidebar-row__state-surface');
    for (const componentSource of [source, rowSource]) {
      expect(componentSource).toContain(
        'var(--ui-playlist-row-state-surface-outset-inline)',
      );
      expect(componentSource).toMatch(
        /inset-inline:\s*calc\(\s*-1\s*\*\s*var\(--ui-playlist-row-state-surface-outset-inline\)\s*\)/u,
      );
      expect(componentSource).toMatch(
        /@container \(width < 256px\)[\s\S]*?inset-inline:\s*0;/u,
      );
    }
  });

  it('uses the shared side-panel radius and background-only hover recipe', () => {
    for (const componentSource of [source, rowSource]) {
      expect(componentSource).toContain(
        'border-radius: var(--ui-side-panel-row-radius);',
      );
    }
    expect(source).toMatch(
      /\.playlist-sidebar__item:hover \.playlist-sidebar__item-state-surface\s*\{[^}]*background:\s*var\(--ui-color-surface-hover\);/su,
    );
    expect(rowSource).toMatch(
      /\.playlist-sidebar-row:hover \.playlist-sidebar-row__state-surface\s*\{[^}]*background:\s*var\(--ui-color-surface-hover\);/su,
    );
    expect(source).not.toMatch(
      /\.playlist-sidebar__item:hover \.playlist-sidebar__item-state-surface\s*\{[^}]*border-color:/su,
    );
    expect(rowSource).not.toMatch(
      /\.playlist-sidebar-row:hover \.playlist-sidebar-row__state-surface\s*\{[^}]*border-color:/su,
    );
    expect(source).toMatch(
      /\.playlist-sidebar__item:active \.playlist-sidebar__item-state-surface\s*\{[^}]*background:\s*var\(--ui-color-surface-active\);/su,
    );
    expect(rowSource).toMatch(
      /\.playlist-sidebar-row:has\(\.playlist-sidebar-row__select:active\)\s+\.playlist-sidebar-row__state-surface\s*\{[^}]*background:\s*var\(--ui-color-surface-active\);/su,
    );
  });

  it('keeps filled functional-entry plates distinct while the row owns interaction state', () => {
    expect(source).toMatch(
      /\.playlist-sidebar\s*\{[^}]*--ui-playlist-navigation-plate-background:\s*var\(\s*--ui-color-entry\s*\);[^}]*--ui-playlist-navigation-plate-foreground:\s*var\(\s*--ui-color-entry-foreground\s*\);[^}]*--ui-playlist-navigation-active-indicator:\s*var\(\s*--ui-color-entry-selected-indicator\s*\);/su,
    );
    expect(source).toMatch(
      /\.playlist-sidebar__thumb--accent\s*\{[^}]*background:\s*var\(--ui-playlist-navigation-plate-background\);[^}]*color:\s*var\(--ui-playlist-navigation-plate-foreground\);/su,
    );
    expect(source).not.toMatch(
      /\.playlist-sidebar__item:hover\s+\.playlist-sidebar__thumb--accent/u,
    );
    expect(source).not.toMatch(
      /\.playlist-sidebar__item:active\s+\.playlist-sidebar__thumb--accent/u,
    );
  });

  it('uses the shared command primitive for both expanded and compact create actions', () => {
    expect(source).toContain(
      "import UiIconButton from '../ui/UiIconButton.vue';",
    );
    expect(source.match(/<UiIconButton/gu)).toHaveLength(2);
    expect(source.match(/variant="command"/gu)).toHaveLength(2);
    expect(source).not.toContain('variant="entry"');
    expect(source.match(/:icon="Plus"/gu)).toHaveLength(2);
    expect(source.match(/label="新增歌單"/gu)).toHaveLength(2);
    expect(source).not.toMatch(
      /<button[\s\S]*?class="playlist-sidebar__toolbar-action/u,
    );
    expect(source).toMatch(
      /\.playlist-sidebar__toolbar-action\s*\{[^}]*--ui-icon-button-size-override:\s*var\(--ui-sidebar-toolbar-control-size\);/su,
    );
  });

  it('uses one accessible active plate indicator in expanded and compact geometry', () => {
    expect(source).toMatch(
      /\.playlist-sidebar__item--active\s+\.playlist-sidebar__thumb\.playlist-sidebar__thumb--accent\s*\{[^}]*box-shadow:\s*0 0 0 var\(--ui-focus-width\)\s+var\(--ui-playlist-navigation-active-indicator\);/su,
    );
    expect(
      source.match(/--ui-playlist-navigation-active-indicator\)/gu),
    ).toHaveLength(1);
    expect(source).not.toMatch(
      /@container \(width < 256px\)[\s\S]*?\.playlist-sidebar__item--active\s+\.playlist-sidebar__thumb\s*\{[^}]*box-shadow:/u,
    );
  });

  it('uses app-owned end-side tooltips only while fixed navigation is compact', () => {
    expect(source).toContain(
      "import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';",
    );
    expect(source).toContain(
      "import { useTooltip } from '../ui/useTooltip.js';",
    );
    expect(source.match(/useTooltip\(\{/gu)).toHaveLength(2);
    expect(
      source.match(/disabled: computed\(\(\) => !props\.compact\)/gu),
    ).toHaveLength(2);
    expect(source.match(/placement: 'end'/gu)).toHaveLength(2);
    expect(source.match(/<UiTooltipSurface/gu)).toHaveLength(2);
    expect(source.match(/placement="end"/gu)).toHaveLength(2);
    expect(source).not.toMatch(/\stitle="/u);
  });

  it('mixes albums and artists in one reference tier after playlists and loads it after the library', () => {
    const playlistsAt = source.indexOf(
      'v-for="playlist in visiblePlaylistItems"',
    );
    const referenceAt = source.indexOf(
      'v-for="entry in visibleReferenceEntries"',
    );
    expect(playlistsAt).toBeLessThan(referenceAt);
    expect(source).not.toContain('v-for="playlist in visibleAlbumItems"');
    expect(source).not.toContain('v-for="artist in visibleArtistItems"');
    expect(source.match(/class="playlist-sidebar__divider"/gu)).toHaveLength(2);
    expect(source).toContain('orderReferenceItems({');
    expect(source).toContain("if (entry.kind === 'artist') return '藝人';");
    expect(source).toMatch(
      /watch\(\s*\(\) => props\.tracksById\.size > 0,[\s\S]*?setTimeout\(ensureArtistIndex, 0\)/u,
    );
    expect(source).toContain('@contextmenu="suppressArtistMenu"');
    expect(source).not.toMatch(/draggable[^\n]*artist/u);
  });

  it('does not mark a library view current while an artist page is open', () => {
    expect(source).toMatch(
      /const isLibraryViewActive = \(view\) =>\s*state\.selectedId === null &&\s*state\.selectedArtistId === null &&/u,
    );
    expect(source).not.toContain(
      "state.selectedId === null && libraryView === 'all'",
    );
  });

  it('reveals playback from the row hover or the playback button focus without mislabeling row focus', () => {
    // Hover-only scope: row focus (the select action) must not reveal play;
    // UiArtworkReveal still reveals on the play button's own keyboard focus.
    expect(rowSource).toMatch(
      /class="playlist-sidebar-row"\s+data-artwork-reveal-scope\s/u,
    );
    expect(rowSource).not.toContain('data-artwork-reveal-scope="focus-within"');
    expect(rowSource).toMatch(/<UiArtworkReveal>\s*<UiIconButton/u);
    expect(rowSource).not.toMatch(
      /\.playlist-sidebar-row__play\s*\{[^}]*opacity:/u,
    );
    expect(rowSource).not.toContain(
      '.playlist-sidebar-row__select:focus-visible\n  ~ .playlist-sidebar-row__thumb',
    );
  });
});
