<script setup>
import { computed } from 'vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import RightDockTrackArtworkCue from './RightDockTrackArtworkCue.vue';
import RightDockTrackMenuButton from './RightDockTrackMenuButton.vue';

const props = defineProps({
  track: { type: Object, required: true },
  active: { type: Boolean, default: false },
  current: { type: Boolean, default: false },
  draggable: { type: Boolean, default: false },
  menuOpen: { type: Boolean, default: false },
  playing: { type: Boolean, default: false },
  dropPosition: {
    type: String,
    default: null,
    validator: (value) => value === null || ['before', 'after'].includes(value),
  },
});

const emit = defineEmits([
  'select',
  'activate',
  'togglePlayback',
  'openMenu',
  'dragStart',
  'dragOver',
  'dragLeave',
  'drop',
  'dragEnd',
]);

const artworkActionLabel = computed(
  () => `${props.playing ? '暫停' : '播放'}：${props.track.title}`,
);

const DRAG_EXCLUDED_ACTIONS = '.ui-icon-btn, .ui-track__artwork-action';
let dragStartedFromAction = false;

function isExcludedDragTarget(target) {
  return Boolean(target?.closest?.(DRAG_EXCLUDED_ACTIONS));
}

function handlePointerDown(event) {
  dragStartedFromAction = isExcludedDragTarget(event.target);
}

function resetDragOrigin() {
  dragStartedFromAction = false;
}

function handleDragStart(event) {
  if (dragStartedFromAction || isExcludedDragTarget(event.target)) {
    event.preventDefault();
    resetDragOrigin();
    return;
  }
  emit('dragStart', event);
}

function handleDragEnd(event) {
  resetDragOrigin();
  emit('dragEnd', event);
}
</script>

<template>
  <UiTrackRow
    class="queue-track right-dock-track"
    :class="{ 'right-dock-track--menu-open': menuOpen }"
    :track="track"
    :active="active"
    :current="current"
    interactive
    activate-on-enter
    :action-label="`選取：${track.title}`"
    artwork-clickable
    :artwork-label="artworkActionLabel"
    hide-duration
    overflow="ellipsis"
    thumb-loading="lazy"
    thumb-decoding="async"
    :draggable="draggable"
    @row-click="emit('select', track)"
    @row-dblclick="emit('activate', track)"
    @activate="emit('activate', track)"
    @artwork-click="emit('togglePlayback', track)"
    @contextmenu.prevent.stop="emit('openMenu', { track, event: $event })"
    @pointerdown="handlePointerDown"
    @pointerup="resetDragOrigin"
    @pointercancel="resetDragOrigin"
    @dragstart="handleDragStart"
    @dragover="emit('dragOver', $event)"
    @dragleave="emit('dragLeave', $event)"
    @drop="emit('drop', $event)"
    @dragend="handleDragEnd"
  >
    <template #artworkOverlay>
      <RightDockTrackArtworkCue :playing="playing" />
    </template>
    <template #trail>
      <RightDockTrackMenuButton
        :track-title="track.title"
        :menu-open="menuOpen"
        @open="emit('openMenu', { track, event: $event })"
      />
    </template>
    <template #overlay>
      <UiSeparator
        v-if="dropPosition"
        tone="accent"
        class="queue-track__drop-indicator"
        :class="`queue-track__drop-indicator--${dropPosition}`"
      />
    </template>
  </UiTrackRow>
</template>

<style scoped>
.queue-track__drop-indicator {
  position: absolute;
  inset-inline: 0;
  z-index: 2;
  pointer-events: none;
}

.queue-track__drop-indicator--before {
  inset-block-start: calc(-0.5 * var(--ui-space-1));
  transform: translateY(-50%);
}

.queue-track__drop-indicator--after {
  inset-block-end: calc(-0.5 * var(--ui-space-1));
  transform: translateY(50%);
}
</style>
