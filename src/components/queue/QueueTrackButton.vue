<script setup>
import { computed } from 'vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import TrackArtistCredits from '../track/TrackArtistCredits.vue';
import RightDockTrackArtworkCue from './RightDockTrackArtworkCue.vue';
import RightDockTrackMenuButton from './RightDockTrackMenuButton.vue';

const props = defineProps({
  track: { type: Object, required: true },
  active: { type: Boolean, default: false },
  current: { type: Boolean, default: false },
  interactive: { type: Boolean, default: true },
  draggable: { type: Boolean, default: false },
  menuOpen: { type: Boolean, default: false },
  playing: { type: Boolean, default: false },
  playbackDisabled: { type: Boolean, default: false },
  playbackLabel: { type: String, default: undefined },
  artistText: { type: String, default: undefined },
  ordinal: {
    type: Number,
    default: null,
    validator: (value) =>
      value === null || (Number.isInteger(value) && value > 0),
  },
  ordinalLabel: { type: String, default: '' },
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
  'navigateArtist',
  'openMenu',
  'dragStart',
  'dragOver',
  'dragLeave',
  'drop',
  'dragEnd',
]);

const artworkActionLabel = computed(
  () =>
    props.playbackLabel ??
    `${props.playing ? '暫停' : '播放'}：${props.track.title}`,
);

const DRAG_EXCLUDED_ACTIONS =
  '.ui-icon-btn, .ui-text-btn, .ui-track__artwork-action';
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
    data-artwork-reveal-scope="focus-within"
    :class="{ 'right-dock-track--menu-open': menuOpen }"
    :track="track"
    :artist="artistText"
    :active="active"
    :current="current"
    :interactive="interactive"
    state-surface
    :state-surface-active="menuOpen"
    :activate-on-enter="interactive && !playbackDisabled"
    :action-label="interactive ? `選取：${track.title}` : undefined"
    :artwork-clickable="!playbackDisabled"
    :artwork-label="artworkActionLabel"
    hide-duration
    overflow="ellipsis"
    thumb-loading="lazy"
    thumb-decoding="async"
    :draggable="draggable"
    @row-click="interactive && emit('select', track)"
    @row-dblclick="interactive && !playbackDisabled && emit('activate', track)"
    @activate="interactive && !playbackDisabled && emit('activate', track)"
    @artwork-click="!playbackDisabled && emit('togglePlayback', track)"
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
    <template v-if="ordinal !== null" #lead>
      <span
        class="queue-track__ordinal"
        :aria-label="ordinalLabel || `第 ${ordinal} 首`"
        >{{ ordinal }}</span
      >
    </template>
    <template v-if="!playbackDisabled" #artworkOverlay>
      <RightDockTrackArtworkCue :playing="playing" />
    </template>
    <template #artist>
      <TrackArtistCredits
        v-if="artistText === undefined"
        :track="track"
        @navigate="emit('navigateArtist', $event)"
      />
      <span v-else class="queue-track__artist-label">{{ artistText }}</span>
    </template>
    <template #trail>
      <slot name="trail">
        <RightDockTrackMenuButton
          :track-title="track.title"
          :menu-open="menuOpen"
          @open="emit('openMenu', { track, event: $event })"
        />
      </slot>
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
.queue-track__ordinal {
  min-inline-size: var(--ui-space-3);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-variant-numeric: tabular-nums;
  text-align: end;
}
.queue-track__artist-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.queue-track__drop-indicator {
  position: absolute;
  inset-inline: 0;
  z-index: var(--ui-layer-overlay);
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
