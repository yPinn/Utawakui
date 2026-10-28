<script setup>
import { useLibrary } from '../../composables/useLibrary.js';
import { useAppView } from '../../composables/useAppView.js';
import { usePlaylistActions } from '../../composables/usePlaylistActions.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { useResizeDrag } from '../../composables/useResizeDrag.js';
import { useUiOverlayHost } from '../../composables/useUiOverlayHost.js';
import PlaylistDetailsModal from '../playlists/PlaylistDetailsModal.vue';
import PlaylistSidebar from '../playlists/PlaylistSidebar.vue';

const { tracksById, state: libraryState } = useLibrary();
const { state: playlistState, setLibraryView } = usePlaylists();
const { openLibraryContent } = useAppView();
const {
  editDetailsPlaylist,
  editDetailsIsAlbum,
  editDetailsCoverTracks,
  editDetailsCoverUrl,
  editDetailsDescription,
  editDetailsIsSaving,
  editDetailsError,
  closeEditDetailsModal,
  saveEditDetails,
  chooseCover,
  clearCover,
  handlePlaylistMenuAction,
} = usePlaylistActions();
const props = defineProps({
  expanded: { type: Boolean, default: false },
});
const emit = defineEmits(['toggleExpanded']);
const overlayHost = useUiOverlayHost();
let dragExpanded = false;
let directionAnchor = 0;
const { isResizing, startResize: startDrag } = useResizeDrag({
  onMove: (delta) => {
    // Follow the furthest point in the current direction. A reversal needs
    // its own deliberate movement, even if the pointer passed the old origin.
    directionAnchor = dragExpanded
      ? Math.max(directionAnchor, delta)
      : Math.min(directionAnchor, delta);
    if (
      dragExpanded ? delta > directionAnchor - 24 : delta < directionAnchor + 24
    )
      return;
    dragExpanded = !dragExpanded;
    directionAnchor = delta;
    emit('toggleExpanded');
  },
});
function startResize(event) {
  dragExpanded = props.expanded;
  directionAnchor = 0;
  startDrag(event);
}
function handleResizeKeydown(event) {
  const toggle = ['Enter', ' '].includes(event.key);
  const expand = ['ArrowRight', 'End'].includes(event.key);
  const collapse = ['ArrowLeft', 'Home'].includes(event.key);
  if (!toggle && !expand && !collapse) return;
  event.preventDefault();
  if (toggle || (expand && !props.expanded) || (collapse && props.expanded))
    emit('toggleExpanded');
}
</script>

<template>
  <nav
    class="app-playlist-sidebar"
    data-ui-region="chrome"
    aria-label="播放清單"
  >
    <PlaylistSidebar
      id="app-playlist-sidebar-content"
      class="app-playlist-sidebar__content"
      :tracks-by-id="tracksById"
      :library-loading="libraryState.isLoading"
      :library-view="playlistState.libraryView"
      :compact="!props.expanded"
      @library-view-select="setLibraryView"
      @activate-library="openLibraryContent"
      @playlist-action="handlePlaylistMenuAction"
    />

    <button
      data-sidebar-disclosure
      type="button"
      class="app-playlist-sidebar__handle"
      :class="{ 'app-playlist-sidebar__handle--active': isResizing }"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      :aria-valuemin="64"
      :aria-valuemax="256"
      :aria-valuenow="props.expanded ? 256 : 64"
      :aria-valuetext="props.expanded ? '已展開，256 像素' : '已摺疊，64 像素'"
      :aria-expanded="props.expanded"
      aria-controls="app-playlist-sidebar-content"
      :aria-label="
        props.expanded
          ? '摺疊播放清單側欄；拖曳、Enter、空白鍵或雙擊'
          : '展開播放清單側欄；拖曳、Enter、空白鍵或雙擊'
      "
      @pointerdown="startResize"
      @dblclick="emit('toggleExpanded')"
      @keydown="handleResizeKeydown"
    ></button>

    <Teleport v-if="isResizing && overlayHost" :to="overlayHost">
      <div class="app-playlist-sidebar__drag-feedback" aria-hidden="true"></div>
    </Teleport>

    <!-- Independent of which playlist/album is currently selected/viewed —
         right-clicking any sidebar row opens this for that row without
         changing what the active tab shows. UiModal teleports to the
         app-shell v2 overlay host, so its position here is purely logical. -->
    <PlaylistDetailsModal
      :open="Boolean(editDetailsPlaylist)"
      :is-album="editDetailsIsAlbum"
      :name="editDetailsPlaylist?.name ?? ''"
      :description="editDetailsDescription"
      :cover-url="editDetailsCoverUrl"
      :cover-tracks="editDetailsCoverTracks"
      :saving="editDetailsIsSaving"
      :error="editDetailsError"
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
  /* Shell panels (Sidebar, Folder, Right Dock) share the large radius. Safe
     alongside the container-type below — radius doesn't change the content-box size. */
  border-radius: var(--ui-radius-lg);
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
  z-index: var(--ui-layer-raised);
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
  transition: background-color var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
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

/* Keep the resize cursor after the original axis snaps away from the pointer. */
.app-playlist-sidebar__drag-feedback {
  position: fixed;
  inset: 0;
  z-index: var(--ui-z-popover);
  cursor: col-resize;
  user-select: none;
  pointer-events: auto;
}

@media (prefers-reduced-motion: reduce) {
  .app-playlist-sidebar__handle::after {
    transition: none;
  }
}
</style>
