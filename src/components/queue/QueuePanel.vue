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
const { jumpToAlbum } = useAlbumNavigation();

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

    <template v-else>
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
          <button
            type="button"
            class="queue-panel__text-action"
            @click="clearQueuedTracks"
          >
            清除佇列
          </button>
        </template>
      </QueueSection>

      <QueueSection
        :title="`下一首來自：${upcomingSourceLabel}`"
        :tracks="sourceUpcomingTracks"
        :draggable-items="sourceUpcomingTracks.length > 1"
        :dragging-track-id="draggingSourceTrackId"
        :drop-target-track-id="dropTargetSourceTrackId"
        :drop-position="sourceDropPosition"
        :jumpable-track-ids="jumpableTrackIds"
        empty-text="沒有下一首"
        @select-track="playQueuedTrack($event, { source: true })"
        @title-click="jumpFromQueue"
        @track-drag-start="startSourceDrag"
        @track-drag-over="updateSourceDropTarget"
        @track-drag-leave="leaveSourceDropTarget"
        @track-drop="dropSourceTrack"
        @track-drag-end="clearSourceDragState"
      />
    </template>
  </PlayerBarPanel>
</template>

<style scoped>
.queue-panel__text-action {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-color-text-muted);
  font: inherit;
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
  cursor: pointer;
}

.queue-panel__text-action:hover {
  color: var(--ui-color-text);
}

.queue-panel__text-action:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
  border-radius: var(--ui-radius);
}
</style>
