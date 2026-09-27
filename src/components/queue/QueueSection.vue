<script setup>
import UiHint from '../ui/UiHint.vue';
import UiTextButton from '../ui/UiTextButton.vue';
import QueueTrackButton from './QueueTrackButton.vue';

defineProps({
  title: { type: String, required: true },
  // Static, non-interactive text rendered before title — e.g. "下一首來自："
  // — so that when titleJumpable is true, only the actual destination name
  // in `title` becomes the clickable/underlined CTA, not the whole phrase.
  titlePrefix: { type: String, default: '' },
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
  <section
    class="queue-section"
    :aria-label="titlePrefix ? `${titlePrefix}${title}` : title"
  >
    <header class="queue-section__header">
      <h3 class="queue-section__title">
        <span v-if="titlePrefix" class="queue-section__title-prefix">{{
          titlePrefix
        }}</span>
        <span class="queue-section__title-text">
          <UiTextButton
            v-if="titleJumpable"
            :text="title"
            :aria-label="titleLinkAriaLabel || `前往：${title}`"
            overflow="ellipsis"
            @click="emit('sectionTitleClick')"
          />
          <template v-else>{{ title }}</template>
        </span>
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
  display: flex;
  align-items: center;
  margin: 0;
  min-width: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

/* Static label, not part of the CTA — must not shrink/truncate before the
   actual destination name (.queue-section__title-text) does. */
.queue-section__title-prefix {
  flex-shrink: 0;
  white-space: nowrap;
}

.queue-section__title-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  content-visibility: auto;
  contain-intrinsic-block-size: calc(
    var(--ui-queue-track-thumb-size) + 2 * var(--ui-space-1)
  );
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
