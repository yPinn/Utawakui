<script setup>
import { computed, ref } from 'vue';
import { X } from '@lucide/vue';
import { usePlaybackQueue } from '../composables/usePlaybackQueue.js';
import { usePlayer } from '../composables/usePlayer.js';
import { toPlayableTrack } from '../utils/playableTrack.js';
import QueueSection from './queue/QueueSection.vue';
import UiButton from './ui/UiButton.vue';

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

const draggingQueuedTrackId = ref(null);
const dropTargetQueuedTrackId = ref(null);
const queuedDropPosition = ref(null);
const draggingSourceTrackId = ref(null);
const dropTargetSourceTrackId = ref(null);
const sourceDropPosition = ref(null);
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

function startDrag(track, event, options) {
  if (options.tracks.value.length < 2) {
    event.preventDefault();
    return;
  }

  options.draggingTrackId.value = track.id;
  options.dropTargetTrackId.value = null;
  options.dropPosition.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', track.id);
  }
}

function updateDropTarget(track, event, options) {
  if (
    !options.draggingTrackId.value ||
    options.draggingTrackId.value === track.id
  ) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

  const rect = event.currentTarget.getBoundingClientRect();
  options.dropTargetTrackId.value = track.id;
  options.dropPosition.value =
    event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function leaveDropTarget(track, event, options) {
  if (
    options.dropTargetTrackId.value === track.id &&
    !event.currentTarget.contains(event.relatedTarget)
  ) {
    options.dropTargetTrackId.value = null;
    options.dropPosition.value = null;
  }
}

function dropTrack(targetTrack, event, options) {
  event.preventDefault();
  event.stopPropagation();
  const draggedId =
    options.draggingTrackId.value || event.dataTransfer?.getData('text/plain');
  options.reorderTrack(
    draggedId,
    targetTrack.id,
    options.dropPosition.value || 'before',
  );
  clearDragState(options);
}

function clearDragState(options) {
  options.draggingTrackId.value = null;
  options.dropTargetTrackId.value = null;
  options.dropPosition.value = null;
}

const queuedDragOptions = {
  tracks: queuedTracks,
  draggingTrackId: draggingQueuedTrackId,
  dropTargetTrackId: dropTargetQueuedTrackId,
  dropPosition: queuedDropPosition,
  reorderTrack: reorderQueuedTrack,
};

const sourceDragOptions = {
  tracks: sourceUpcomingTracks,
  draggingTrackId: draggingSourceTrackId,
  dropTargetTrackId: dropTargetSourceTrackId,
  dropPosition: sourceDropPosition,
  reorderTrack: reorderSourceTrack,
};

function startQueuedDrag(track, event) {
  startDrag(track, event, queuedDragOptions);
}

function updateQueuedDropTarget(track, event) {
  updateDropTarget(track, event, queuedDragOptions);
}

function leaveQueuedDropTarget(track, event) {
  leaveDropTarget(track, event, queuedDragOptions);
}

function dropQueuedTrack(track, event) {
  dropTrack(track, event, queuedDragOptions);
}

function clearQueuedDragState() {
  clearDragState(queuedDragOptions);
}

function startSourceDrag(track, event) {
  startDrag(track, event, sourceDragOptions);
}

function updateSourceDropTarget(track, event) {
  updateDropTarget(track, event, sourceDragOptions);
}

function leaveSourceDropTarget(track, event) {
  leaveDropTarget(track, event, sourceDragOptions);
}

function dropSourceTrack(track, event) {
  dropTrack(track, event, sourceDragOptions);
}

function clearSourceDragState() {
  clearDragState(sourceDragOptions);
}
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

    <p v-if="!hasQueue" class="queue-panel__empty">尚未建立播放佇列</p>

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
  --queue-panel-bottom-offset: 72px;
  --queue-panel-width: 360px;
  --queue-panel-max-height-offset: 120px;

  position: fixed;
  right: var(--ui-space-3);
  bottom: calc(var(--queue-panel-bottom-offset) + var(--ui-space-3));
  z-index: var(--ui-z-dropdown);
  box-sizing: border-box;
  width: min(var(--queue-panel-width), calc(100vw - var(--ui-space-5)));
  max-height: min(640px, calc(100vh - var(--queue-panel-max-height-offset)));
  overflow: auto;
  padding: var(--ui-space-4);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  box-shadow: var(--ui-overlay-shadow);
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
  color: var(--ui-text);
  font-size: var(--ui-text-md);
  font-weight: var(--ui-font-weight-strong);
}

.queue-panel__empty {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}

.queue-panel__text-action {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: var(--ui-text-sm);
  cursor: pointer;
}

.queue-panel__text-action:hover {
  color: var(--ui-text);
}

.queue-panel__text-action:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
  border-radius: var(--ui-radius);
}
</style>
