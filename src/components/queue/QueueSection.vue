<script setup>
import UiHint from '../ui/UiHint.vue';
import UiTextButton from '../ui/UiTextButton.vue';
import QueueTrackButton from './QueueTrackButton.vue';

const props = defineProps({
  title: { type: String, required: true },
  // Static, non-interactive text rendered before title — e.g. "下一首來自："
  // — so that when titleJumpable is true, only the actual destination name
  // in `title` becomes the clickable/underlined CTA, not the whole phrase.
  titlePrefix: { type: String, default: '' },
  tracks: { type: Array, default: () => [] },
  emptyText: { type: String, default: '' },
  selectedTrackId: { type: String, default: null },
  currentTrackId: { type: String, default: null },
  playingTrackId: { type: String, default: null },
  playerPlaying: { type: Boolean, default: false },
  draggableItems: { type: Boolean, default: false },
  draggingTrackId: { type: String, default: null },
  dropTargetTrackId: { type: String, default: null },
  dropPosition: { type: String, default: null },
  // Whether the section's own heading (not a track row) should jump to a
  // playlist/album — distinct from a per-track jump, so this section
  // represents a single known source rather than a per-row lookup.
  titleJumpable: { type: Boolean, default: false },
  // Overrides the default "前往：<title>" aria-label — title here is often a
  // compound string (e.g. "下一首來自：海螺記"), so the caller can supply a
  // cleaner label naming just the destination.
  titleLinkAriaLabel: { type: String, default: '' },
  menuContext: { type: String, required: true },
  openMenuKey: { type: String, default: '' },
});

const emit = defineEmits([
  'selectTrack',
  'activateTrack',
  'toggleTrackPlayback',
  'sectionTitleClick',
  'trackDragStart',
  'trackDragOver',
  'trackDragLeave',
  'trackDrop',
  'trackDragEnd',
  'openTrackMenu',
]);

function openTrackMenu(track, payload) {
  emit('openTrackMenu', {
    ...payload,
    track,
    context: props.menuContext,
    key: `${props.menuContext}:${track.id}`,
  });
}
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
            class="queue-section__source-link"
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
      <QueueTrackButton
        v-for="track in tracks"
        :key="track.id"
        class="queue-section__item"
        :class="{
          'queue-section__item--draggable': draggableItems,
          'queue-section__item--dragging': draggingTrackId === track.id,
        }"
        :track="track"
        :active="track.id === selectedTrackId"
        :current="track.id === currentTrackId"
        :playing="playerPlaying && track.id === playingTrackId"
        :draggable="draggableItems"
        :menu-open="openMenuKey === `${menuContext}:${track.id}`"
        :drop-position="dropTargetTrackId === track.id ? dropPosition : null"
        @select="emit('selectTrack', $event)"
        @activate="emit('activateTrack', $event)"
        @toggle-playback="emit('toggleTrackPlayback', $event)"
        @open-menu="openTrackMenu(track, $event)"
        @drag-start="emit('trackDragStart', track, $event)"
        @drag-over="emit('trackDragOver', track, $event)"
        @drag-leave="emit('trackDragLeave', track, $event)"
        @drop="emit('trackDrop', track, $event)"
        @drag-end="emit('trackDragEnd')"
      />
    </ul>
  </section>
</template>

<style scoped>
.queue-section {
  display: grid;
  gap: var(--ui-side-panel-content-gap);
}

.queue-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
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

.queue-section__source-link :deep(.ui-text-btn__text) {
  text-decoration: underline;
  text-underline-offset: 0.18em;
}

.queue-section__list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  min-inline-size: 0;
  margin: 0;
  padding: 0;
}

.queue-section__item {
  position: relative;
  inline-size: 100%;
  min-inline-size: 0;
  max-inline-size: 100%;
  box-sizing: border-box;
}

.queue-section__item--draggable.queue-track {
  cursor: grab;
  -webkit-user-select: none;
  user-select: none;
}

.queue-section__item--dragging.queue-track {
  cursor: grabbing;
  opacity: var(--ui-opacity-dragging);
}
</style>
