<script setup>
import { computed } from 'vue';
import { useLibrary } from '../../composables/useLibrary.js';
import { useAppView } from '../../composables/useAppView.js';
import { usePlaylistActions } from '../../composables/usePlaylistActions.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { useSidebarResize } from '../../composables/useSidebarResize.js';
import {
  SIDEBAR_COMPACT_THRESHOLD,
  SIDEBAR_WIDTH_KEYBOARD_STEP,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  useSidebarWidth,
} from '../../composables/useSidebarWidth.js';
import {
  isStudioLibraryComparisonMode,
  useVisualSystemMode,
} from '../../composables/useVisualSystemMode.js';
import PlaylistDetailsModal from '../playlists/PlaylistDetailsModal.vue';
import PlaylistSidebar from '../playlists/PlaylistSidebar.vue';

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
const { isResizing, startResize, resizeBy, resizeTo, toggleSidebarCollapse } =
  useSidebarResize();
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

async function handleResizeKeydown(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    await toggleSidebarCollapse();
    return;
  }
  if (sidebarCompact.value) return;

  const handlers = {
    ArrowLeft: () => resizeBy(-SIDEBAR_WIDTH_KEYBOARD_STEP),
    ArrowRight: () => resizeBy(SIDEBAR_WIDTH_KEYBOARD_STEP),
    Home: () => resizeTo(SIDEBAR_WIDTH_MIN),
    End: () => resizeTo(SIDEBAR_WIDTH_MAX),
  };
  const handler = handlers[event.key];
  if (!handler) return;
  event.preventDefault();
  await handler();
}
</script>

<template>
  <nav class="app-playlist-sidebar" aria-label="播放清單">
    <PlaylistSidebar
      id="app-playlist-sidebar-content"
      class="app-playlist-sidebar__content"
      :tracks-by-id="tracksById"
      :library-view="playlistState.libraryView"
      :compact="sidebarCompact"
      @library-view-select="setLibraryView"
      @activate-setlist="activateSetlistView"
      @playlist-action="handlePlaylistMenuAction"
    />

    <button
      type="button"
      class="app-playlist-sidebar__handle"
      :class="{ 'app-playlist-sidebar__handle--active': isResizing }"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      :aria-valuemin="SIDEBAR_WIDTH_MIN"
      :aria-valuemax="SIDEBAR_WIDTH_MAX"
      :aria-valuenow="sidebarWidth"
      :aria-valuetext="`${sidebarWidth} 像素`"
      aria-controls="app-playlist-sidebar-content"
      :aria-expanded="!sidebarCompact"
      :aria-label="
        sidebarCompact
          ? '展開播放清單側欄；Enter、空白鍵或雙擊'
          : '調整播放清單側欄寬度；方向鍵調整，Enter、空白鍵或雙擊切換摺疊'
      "
      @pointerdown="startResize"
      @dblclick="toggleSidebarCollapse"
      @keydown="handleResizeKeydown"
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
  /* Matches AppInnerPage/TrackContextPanel's own --ui-radius-sm
     card corners. Safe alongside the container-type below — unlike a real
     border, radius doesn't change the content-box size. */
  border-radius: var(--ui-radius-sm);
  /* An inset box-shadow, not a border — this element is also the size
     container query root below, and a real border shrinks its content-box
     just enough to falsely trigger the compact-mode @container rule at the
     sidebar's default width (see tokens.css's compact-threshold token). */
  box-shadow: inset 0 0 0 var(--ui-border-width) var(--ui-color-border);
  /* Lets PlaylistSidebar.vue/PlaylistSidebarRow.vue's @container rules
     query this element's own width instead of the viewport. */
  container-type: inline-size;
}

.app-playlist-sidebar__content {
  height: 100%;
  min-height: 0;
}

.app-playlist-sidebar__handle {
  position: absolute;
  inset-block: 0;
  /* Keep only the rail's transparent 3px edge under the handle. The rest of
     the 12px target extends into the shell-owned panel gap, so it cannot
     intercept the visible scrollbar thumb on this shared right boundary. */
  inset-inline-end: calc(
    (var(--ui-resize-handle-hit-size) - var(--ui-scrollbar-thumb-inset)) / -1
  );
  inline-size: var(--ui-resize-handle-hit-size);
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
  inset-block: 0;
  inset-inline-start: calc(
    var(--ui-scrollbar-thumb-inset) - var(--ui-drag-indicator-width) / 2
  );
  inline-size: var(--ui-drag-indicator-width);
  background: transparent;
  transition: background-color var(--ui-motion-fast) var(--ui-motion-ease);
}

.app-playlist-sidebar__handle:hover::after,
.app-playlist-sidebar__handle--active::after {
  background: var(--ui-color-accent);
}

.app-playlist-sidebar__handle:focus-visible {
  outline: none;
}

.app-playlist-sidebar__handle:focus-visible::after {
  background: var(--ui-color-focus);
}

@media (prefers-reduced-motion: reduce) {
  .app-playlist-sidebar__handle::after {
    transition: none;
  }
}
</style>
