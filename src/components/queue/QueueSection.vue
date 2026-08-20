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
  // See QueueTrackButton.vue's `jumpable` prop / useAlbumNavigation.js.
  jumpableTrackIds: { type: Set, default: () => new Set() },
  // Whether the section's own heading (not a track row) should jump to a
  // playlist/album — distinct from a per-track jump, so this section
  // represents a single known source rather than a per-row lookup.
  titleJumpable: { type: Boolean, default: false },
  // Overrides the default "前往：<title>" aria-label — title here is often a
  // compound string (e.g. "下一首來自：海螺記"), so the caller can supply a
  // cleaner label naming just the destination.
  titleLinkAriaLabel: { type: String, default: '' },
});

const emit = defineEmits([
  'selectTrack',
  'titleClick',
  'sectionTitleClick',
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
      <h3 class="queue-section__title">
        <button
          v-if="titleJumpable"
          type="button"
          class="queue-section__title-link"
          :aria-label="titleLinkAriaLabel || `前往：${title}`"
          @click="emit('sectionTitleClick')"
        >
          {{ title }}
        </button>
        <template v-else>{{ title }}</template>
      </h3>
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
          :jumpable="jumpableTrackIds.has(track.id)"
          @select="emit('selectTrack', $event)"
          @title-click="emit('titleClick', $event)"
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
  min-width: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-section__title-link {
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.queue-section__title-link:hover,
.queue-section__title-link:focus-visible {
  text-decoration: underline;
}

.queue-section__title-link:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
  border-radius: var(--ui-radius);
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
  --queue-section-drop-indicator-offset: calc(
    -1 * (var(--ui-focus-width) + var(--ui-border-width))
  );

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
  height: var(--ui-focus-width);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-accent);
  pointer-events: none;
}

.queue-section__item--drop-before::before {
  top: var(--queue-section-drop-indicator-offset);
}

.queue-section__item--drop-after::after {
  bottom: var(--queue-section-drop-indicator-offset);
}
</style>
