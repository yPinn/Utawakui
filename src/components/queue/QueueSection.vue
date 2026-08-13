<script setup>
import UiHint from '../ui/UiHint.vue';
import QueueTrackButton from './QueueTrackButton.vue';

defineProps({
  title: { type: String, required: true },
  tracks: { type: Array, default: () => [] },
  emptyText: { type: String, default: '' },
  currentTrackId: { type: String, default: null },
  draggableItems: { type: Boolean, default: false },
  draggingTrackId: { type: String, default: null },
  dropTargetTrackId: { type: String, default: null },
  dropPosition: { type: String, default: null },
});

const emit = defineEmits([
  'selectTrack',
  'trackDragStart',
  'trackDragOver',
  'trackDragLeave',
  'trackDrop',
  'trackDragEnd',
]);
</script>

<template>
  <section class="queue-section" :aria-label="title">
    <header class="queue-section__header">
      <h3 class="queue-section__title">{{ title }}</h3>
      <slot name="actions" />
    </header>

    <UiHint v-if="tracks.length === 0 && emptyText">
      {{ emptyText }}
    </UiHint>
    <ul v-else class="queue-section__list">
      <li
        v-for="track in tracks"
        :key="track.id"
        class="queue-section__item"
        :class="{
          'queue-section__item--dragging': draggingTrackId === track.id,
          'queue-section__item--drop-before':
            dropTargetTrackId === track.id && dropPosition === 'before',
          'queue-section__item--drop-after':
            dropTargetTrackId === track.id && dropPosition === 'after',
          'queue-section__item--draggable': draggableItems,
        }"
      >
        <QueueTrackButton
          :track="track"
          :current="track.id === currentTrackId"
          :draggable="draggableItems"
          @select="emit('selectTrack', $event)"
          @drag-start="emit('trackDragStart', track, $event)"
          @drag-over="emit('trackDragOver', track, $event)"
          @drag-leave="emit('trackDragLeave', track, $event)"
          @drop="emit('trackDrop', track, $event)"
          @drag-end="emit('trackDragEnd')"
        />
      </li>
    </ul>
  </section>
</template>

<style scoped>
.queue-section + .queue-section {
  margin-top: var(--ui-space-5);
}

.queue-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-3);
}

.queue-section__title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
}

.queue-section__list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
}

.queue-section__item {
  position: relative;
}

.queue-section__item--draggable {
  cursor: grab;
  user-select: none;
}

.queue-section__item--draggable:active {
  cursor: grabbing;
}

.queue-section__item--dragging {
  opacity: var(--ui-opacity-dragging);
}

.queue-section__item--drop-before::before,
.queue-section__item--drop-after::after {
  content: '';
  position: absolute;
  left: var(--ui-space-1);
  right: var(--ui-space-1);
  height: 2px;
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-accent);
  pointer-events: none;
}

.queue-section__item--drop-before::before {
  top: -3px;
}

.queue-section__item--drop-after::after {
  bottom: -3px;
}
</style>
