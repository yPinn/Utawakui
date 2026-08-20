<script setup>
import { computed } from 'vue';
import { useAlbumNavigation } from '../../composables/useAlbumNavigation.js';
import { useDragReorder } from '../../composables/useDragReorder.js';
import { usePlaybackQueue } from '../../composables/usePlaybackQueue.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { albumPlaylistByTrackId } from '../../utils/albumMembership.js';
import { toPlayableTrack } from '../../utils/playableTrack.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import PlayerBarPanel from '../playback/PlayerBarPanel.vue';
import QueueSection from './QueueSection.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';

defineProps({
  open: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);

const { playTrack } = usePlayer();
const {
  state,
  currentTrack,
  queuedTracks,
  sourceUpcomingTracks,
  setCurrentTrack,
  clearQueuedTracks,
  reorderQueuedTrack,
  reorderSourceTrack,
} = usePlaybackQueue();
const { state: playlistState } = usePlaylists();
const { jumpToAlbum, jumpToPlaylist } = useAlbumNavigation();

const currentTracks = computed(() =>
  currentTrack.value ? [currentTrack.value] : [],
);
const hasQueue = computed(
  () =>
    currentTracks.value.length > 0 ||
    queuedTracks.value.length > 0 ||
    sourceUpcomingTracks.value.length > 0,
);
const upcomingSourceLabel = computed(() => state.sourceName || '目前佇列');
// null for a non-playlist source (e.g. useLyrics.js's 'lyrics-workspace'
// marker, or no source at all) — only a real, still-existing playlist/album
// entry is worth making the section title jump to.
const upcomingSourcePlaylist = computed(() => {
  if (!state.sourceId) return null;
  return (
    playlistState.playlists.find(
      (playlist) => playlist.id === state.sourceId,
    ) ?? null
  );
});
const upcomingSourceLinkLabel = computed(() => {
  const kindLabel =
    upcomingSourcePlaylist.value?.kind === 'album' ? '專輯' : '歌單';
  return `前往${kindLabel}：${upcomingSourceLabel.value}`;
});

// Shared by all three sections below (see useAlbumNavigation.js).
const jumpableTrackIds = computed(
  () => new Set(albumPlaylistByTrackId(playlistState.playlists).keys()),
);

function playCurrentTrack(track) {
  playTrack(toPlayableTrack(track));
}

function playQueuedTrack(track, options = {}) {
  setCurrentTrack(track.id, options);
  playTrack(toPlayableTrack(track));
}

// Also closes the panel — leaving it open over the Setlist view looks broken.
function jumpFromQueue(track) {
  jumpToAlbum(track);
  emit('close');
}

function jumpToUpcomingSource() {
  if (!upcomingSourcePlaylist.value) return;
  jumpToPlaylist(upcomingSourcePlaylist.value.id);
  emit('close');
}

// Two independent instances — queued tracks and upcoming-source tracks are
// two separate lists with two separate drag gestures, not one shared drag
// state (see useDragReorder.js's own doc comment on why this composable is
// a plain factory rather than a singleton).
const {
  draggingId: draggingQueuedTrackId,
  dropTargetId: dropTargetQueuedTrackId,
  dropPosition: queuedDropPosition,
  startDrag: startQueuedDrag,
  updateDropTarget: updateQueuedDropTarget,
  leaveDropTarget: leaveQueuedDropTarget,
  drop: dropQueuedTrack,
  clearDragState: clearQueuedDragState,
} = useDragReorder({
  onReorder: reorderQueuedTrack,
  canDrag: () => queuedTracks.value.length >= 2,
});

const {
  draggingId: draggingSourceTrackId,
  dropTargetId: dropTargetSourceTrackId,
  dropPosition: sourceDropPosition,
  startDrag: startSourceDrag,
  updateDropTarget: updateSourceDropTarget,
  leaveDropTarget: leaveSourceDropTarget,
  drop: dropSourceTrack,
  clearDragState: clearSourceDragState,
} = useDragReorder({
  onReorder: reorderSourceTrack,
  canDrag: () => sourceUpcomingTracks.value.length >= 2,
});
</script>

<template>
  <PlayerBarPanel
    :open="open"
    title="佇列"
    aria-label="播放佇列"
    close-label="關閉佇列"
    @close="emit('close')"
  >
    <UiHint v-if="!hasQueue">尚未建立播放佇列</UiHint>

    <div v-else class="queue-panel__sections">
      <QueueSection
        title="現正播放"
        :tracks="currentTracks"
        :current-track-id="state.currentTrackId"
        :jumpable-track-ids="jumpableTrackIds"
        @select-track="playCurrentTrack"
        @title-click="jumpFromQueue"
      />

      <QueueSection
        v-if="queuedTracks.length > 0"
        title="佇列中下一首"
        :tracks="queuedTracks"
        :draggable-items="queuedTracks.length > 1"
        :dragging-track-id="draggingQueuedTrackId"
        :drop-target-track-id="dropTargetQueuedTrackId"
        :drop-position="queuedDropPosition"
        :jumpable-track-ids="jumpableTrackIds"
        @select-track="playQueuedTrack($event, { source: false })"
        @title-click="jumpFromQueue"
        @track-drag-start="startQueuedDrag"
        @track-drag-over="updateQueuedDropTarget"
        @track-drag-leave="leaveQueuedDropTarget"
        @track-drop="dropQueuedTrack"
        @track-drag-end="clearQueuedDragState"
      >
        <template #actions>
          <UiButton @click="clearQueuedTracks">清除佇列</UiButton>
        </template>
      </QueueSection>

      <QueueSection
        title-prefix="下一首來自："
        :title="upcomingSourceLabel"
        :tracks="sourceUpcomingTracks"
        :draggable-items="sourceUpcomingTracks.length > 1"
        :dragging-track-id="draggingSourceTrackId"
        :drop-target-track-id="dropTargetSourceTrackId"
        :drop-position="sourceDropPosition"
        :jumpable-track-ids="jumpableTrackIds"
        :title-jumpable="Boolean(upcomingSourcePlaylist)"
        :title-link-aria-label="upcomingSourceLinkLabel"
        empty-text="沒有下一首"
        @select-track="playQueuedTrack($event, { source: true })"
        @title-click="jumpFromQueue"
        @section-title-click="jumpToUpcomingSource"
        @track-drag-start="startSourceDrag"
        @track-drag-over="updateSourceDropTarget"
        @track-drag-leave="leaveSourceDropTarget"
        @track-drop="dropSourceTrack"
        @track-drag-end="clearSourceDragState"
      />
    </div>
  </PlayerBarPanel>
</template>

<style scoped>
/* Caps the combined height of all three sections together (not each one
   individually), so the panel shows roughly --ui-queue-panel-max-height's
   worth of rows total across whichever mix of "現正播放"/"佇列中下一首"/
   "下一首來自" happen to be populated, then scrolls the whole set together
   beyond that. */
.queue-panel__sections {
  max-height: var(--ui-queue-panel-max-height);
  overflow-y: auto;
}
</style>
