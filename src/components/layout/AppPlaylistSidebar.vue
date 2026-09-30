<script setup>
import { computed } from 'vue';
import { useLibrary } from '../../composables/useLibrary.js';
import { useAppView } from '../../composables/useAppView.js';
import { usePlaylistActions } from '../../composables/usePlaylistActions.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { useSidebarResize } from '../../composables/useSidebarResize.js';
import {
  SIDEBAR_COMPACT_THRESHOLD,
  useSidebarWidth,
} from '../../composables/useSidebarWidth.js';
import {
  isStudioLibraryComparisonMode,
  useVisualSystemMode,
} from '../../composables/useVisualSystemMode.js';
import PlaylistDetailsModal from '../playlists/PlaylistDetailsModal.vue';
import PlaylistSidebar from '../playlists/PlaylistSidebar.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';

const { tracksById } = useLibrary();
const { state: playlistState, setLibraryView } = usePlaylists();
const { activeView, setActiveView } = useAppView();
const { mode: visualSystemMode } = useVisualSystemMode();
const {
  editDetailsPlaylist,
  editDetailsIsAlbum,
  editDetailsCoverTracks,
  editDetailsCoverUrl,
  editDetailsDescription,
  closeEditDetailsModal,
  saveEditDetails,
  chooseCover,
  clearCover,
  handlePlaylistMenuAction,
} = usePlaylistActions();
const { isResizing, startResize, toggleSidebarCollapse } = useSidebarResize();
const { width: sidebarWidth } = useSidebarWidth();
const sidebarCompact = computed(
  () => sidebarWidth.value < SIDEBAR_COMPACT_THRESHOLD,
);

function activateSetlistView() {
  const isViewingStudioLibrary =
    activeView.value === 'visual-system' &&
    isStudioLibraryComparisonMode(visualSystemMode.value);
  if (!isViewingStudioLibrary) setActiveView('setlist');
}
</script>

<template>
  <nav class="app-playlist-sidebar" aria-label="播放清單">
    <!-- Scroll lives on this inner wrapper, not the root — the resize
         handle below is a sibling positioned against the root instead, so
         it stays pinned to the visible right edge instead of scrolling
         away with a long playlist list. -->
    <UiScrollRegion
      class="app-playlist-sidebar__scroll"
      axis="vertical"
      viewport-class="app-playlist-sidebar__scroll-viewport"
      :scrollbar-visibility="sidebarCompact ? 'hidden' : 'auto'"
      tabindex="0"
      aria-label="播放清單內容"
    >
      <PlaylistSidebar
        :tracks-by-id="tracksById"
        :library-view="playlistState.libraryView"
        :compact="sidebarCompact"
        @library-view-select="setLibraryView"
        @activate-setlist="activateSetlistView"
        @playlist-action="handlePlaylistMenuAction"
      />
    </UiScrollRegion>

    <button
      type="button"
      class="app-playlist-sidebar__handle"
      :class="{ 'app-playlist-sidebar__handle--active': isResizing }"
      aria-label="調整側欄寬度，雙擊切換摺疊"
      @pointerdown="startResize"
      @dblclick="toggleSidebarCollapse"
    ></button>

    <!-- Independent of which playlist/album is currently selected/viewed —
         right-clicking any sidebar row opens this for that row without
         changing what the active tab shows. UiModal teleports to <body>,
         so its position here is purely logical, not visual. -->
    <PlaylistDetailsModal
      :open="Boolean(editDetailsPlaylist)"
      :is-album="editDetailsIsAlbum"
      :name="editDetailsPlaylist?.name ?? ''"
      :description="editDetailsDescription"
      :cover-url="editDetailsCoverUrl"
      :cover-tracks="editDetailsCoverTracks"
      @close="closeEditDetailsModal"
      @save="saveEditDetails"
      @choose-cover="chooseCover"
      @clear-cover="clearCover"
    />
  </nav>
</template>

<style scoped>
.app-playlist-sidebar {
  position: relative;
  box-sizing: border-box;
  height: 100%;
  background: var(--ui-color-surface);
  /* Matches AppInnerPage/StudioLibraryContextInspector's own --ui-radius-sm
     card corners. Safe alongside the container-type below — unlike a real
     border, radius doesn't change the content-box size. */
  border-radius: var(--ui-radius-sm);
  /* An inset box-shadow, not border-right — this element is also the size
     container query root below, and a real border shrinks its content-box
     just enough to falsely trigger the compact-mode @container rule at the
     sidebar's default width (see tokens.css's compact-threshold token). */
  box-shadow: inset calc(-1 * var(--ui-border-width)) 0 0 var(--ui-color-border);
  /* Lets PlaylistSidebar.vue/PlaylistSidebarRow.vue's @container rules
     query this element's own width instead of the viewport. */
  container-type: inline-size;
}

.app-playlist-sidebar__scroll {
  height: 100%;
}

.app-playlist-sidebar__scroll :deep(.app-playlist-sidebar__scroll-viewport) {
  box-sizing: border-box;
  padding: var(--ui-playlist-sidebar-padding-block)
    var(--ui-playlist-sidebar-padding-inline);
}

@container (width < 256px) {
  .app-playlist-sidebar__scroll :deep(.app-playlist-sidebar__scroll-viewport) {
    padding-inline: var(--ui-playlist-sidebar-padding-inline-compact);
  }
}

.app-playlist-sidebar__handle {
  position: absolute;
  top: 0;
  bottom: 0;
  right: -3px;
  width: 6px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: col-resize;
  /* Sits above the scrollable content and the titlebar's own drag region
     (see AppTitleBar.vue) so a drag starting right at the sidebar's edge
     always hits this, not the content behind it. */
  z-index: 1;
  touch-action: none;
}

.app-playlist-sidebar__handle::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 2px;
  background: transparent;
  transition: background-color var(--ui-motion-fast) var(--ui-motion-ease);
}

.app-playlist-sidebar__handle:hover::after,
.app-playlist-sidebar__handle--active::after {
  background: var(--ui-color-accent);
}

@media (prefers-reduced-motion: reduce) {
  .app-playlist-sidebar__handle::after {
    transition: none;
  }
}
</style>
