<script setup>
import { shallowRef } from 'vue';
import { useVirtualList } from '../../composables/useVirtualRows.js';
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
  artistText: { type: String, default: undefined },
  playbackDisabled: { type: Boolean, default: false },
  playbackLabel: { type: String, default: undefined },
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
  // Window rows once the section is longer than this; 0 renders every row.
  virtualizeAbove: { type: Number, default: 0 },
});

const emit = defineEmits([
  'selectTrack',
  'activateTrack',
  'toggleTrackPlayback',
  'sectionTitleClick',
  'artistNavigate',
  'trackDragStart',
  'trackDragOver',
  'trackDragLeave',
  'trackDrop',
  'trackDragEnd',
  'openTrackMenu',
]);

const list = shallowRef(null);
const { rows, rowAttrs, listStyle, listListeners } = useVirtualList({
  listRef: list,
  items: () => props.tracks,
  keyOf: (track) => track.id,
  threshold: () => props.virtualizeAbove,
  // Dragged rows and the row anchoring an open menu stay mounted.
  pinnedKeys: () =>
    [
      props.draggingTrackId,
      props.openMenuKey.startsWith(`${props.menuContext}:`)
        ? props.openMenuKey.slice(props.menuContext.length + 1)
        : '',
    ].filter(Boolean),
  // First-frame guess (3.25rem row + gap); replaced once one renders.
  estimateRowHeight: () => 56,
});

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
        <span
          class="queue-section__title-text"
          :class="{
            'queue-section__title-text--destination': titleJumpable,
          }"
        >
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
    <ul
      v-else
      ref="list"
      class="queue-section__list"
      :style="listStyle"
      v-on="listListeners"
    >
      <QueueTrackButton
        v-for="{ key, item: track, index, gap } in rows"
        :key="key"
        v-bind="rowAttrs({ key, index, gap })"
        class="queue-section__item"
        :class="{
          'queue-section__item--draggable': draggableItems,
          'queue-section__item--dragging': draggingTrackId === track.id,
        }"
        :track="track"
        :artist-text="artistText"
        :playback-disabled="playbackDisabled"
        :playback-label="playbackLabel"
        :active="track.id === selectedTrackId"
        :current="track.id === currentTrackId"
        :playing="playerPlaying && track.id === playingTrackId"
        :draggable="draggableItems"
        :menu-open="openMenuKey === `${menuContext}:${track.id}`"
        :drop-position="dropTargetTrackId === track.id ? dropPosition : null"
        @select="emit('selectTrack', $event)"
        @activate="emit('activateTrack', $event)"
        @toggle-playback="emit('toggleTrackPlayback', $event)"
        @navigate-artist="emit('artistNavigate', $event)"
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
  --queue-source-link-optical-offset: 0.18em;

  display: grid;
  gap: var(--ui-side-panel-content-gap);
  min-width: 0;
}

.queue-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  min-width: 0;
}

.queue-section__title {
  display: flex;
  align-items: center;
  margin: 0;
  min-width: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
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

.queue-section__title-text--destination {
  overflow: visible;
}

.queue-section__source-link :deep(.ui-text-btn__text) {
  padding-block-end: var(--queue-source-link-optical-offset);
  margin-block-end: calc(-1 * var(--queue-source-link-optical-offset));
}

.queue-section__list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--ui-track-list-gap);
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
