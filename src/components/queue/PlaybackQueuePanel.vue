<script setup>
import { computed } from 'vue';
import { X } from '@lucide/vue';
import { useDragReorder } from '../../composables/useDragReorder.js';
import { usePlaybackQueue } from '../../composables/usePlaybackQueue.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { toPlayableTrack } from '../../utils/playableTrack.js';
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

function playCurrentTrack(track) {
  playTrack(toPlayableTrack(track));
}

function playQueuedTrack(track, options = {}) {
  setCurrentTrack(track.id, options);
  playTrack(toPlayableTrack(track));
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
  <aside v-show="open" class="queue-panel" aria-label="播放佇列">
    <header class="queue-panel__header">
      <h2 class="queue-panel__title">佇列</h2>
      <UiButton
        :icon="X"
        aria-label="關閉佇列"
        title="關閉佇列"
        @click="emit('close')"
      />
    </header>

    <UiHint v-if="!hasQueue">尚未建立播放佇列</UiHint>

    <template v-else>
      <QueueSection
        title="現正播放"
        :tracks="currentTracks"
        :current-track-id="state.currentTrackId"
        @select-track="playCurrentTrack"
      />

      <QueueSection
        v-if="queuedTracks.length > 0"
        title="佇列中下一首"
        :tracks="queuedTracks"
        :draggable-items="queuedTracks.length > 1"
        :dragging-track-id="draggingQueuedTrackId"
        :drop-target-track-id="dropTargetQueuedTrackId"
        :drop-position="queuedDropPosition"
        @select-track="playQueuedTrack($event, { source: false })"
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
        empty-text="沒有下一首"
        @select-track="playQueuedTrack($event, { source: true })"
        @track-drag-start="startSourceDrag"
        @track-drag-over="updateSourceDropTarget"
        @track-drag-leave="leaveSourceDropTarget"
        @track-drop="dropSourceTrack"
        @track-drag-end="clearSourceDragState"
      />
    </template>
  </aside>
</template>

<style scoped>
.queue-panel {
  --queue-panel-width: 360px;
  /* 120px was a hand-guessed "player bar + top margin" reservation that
     didn't match --ui-player-bar-height's own derivation (see tokens.css);
     re-expressed as the token plus the remaining ~48px of reserved margin
     so the two stop drifting independently. Net effect is a ~4px taller
     max-height (120px → 116px reserved), consistent with the token
     correcting the player bar's guessed height from 72px to 68px. */
  --queue-panel-max-height-offset: calc(var(--ui-player-bar-height) + 48px);

  position: fixed;
  right: var(--ui-space-3);
  bottom: calc(var(--ui-player-bar-height) + var(--ui-space-3));
  z-index: var(--ui-z-dropdown);
  box-sizing: border-box;
  width: min(var(--queue-panel-width), calc(100vw - var(--ui-space-5)));
  max-height: min(640px, calc(100vh - var(--queue-panel-max-height-offset)));
  overflow: auto;
  padding: var(--ui-space-4);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
  box-shadow: var(--ui-shadow-overlay);
}

.queue-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-5);
}

.queue-panel__title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-strong);
}

.queue-panel__text-action {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-color-text-muted);
  font: inherit;
  font-size: var(--ui-font-size-sm);
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
