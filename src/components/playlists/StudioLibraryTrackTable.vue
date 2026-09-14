<script setup>
import {
  ChevronDown,
  GripVertical,
  ICON_SIZE,
  Volume2,
} from '../../icons/index.js';
import { formatDuration } from '../../utils/format.js';
import { PLAYLIST_SORT_KEYS } from '../../utils/playlistSort.js';
import { formatStudioTrackSource } from '../../utils/studioLibraryPresentation.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

const SORT_COLUMNS = {
  title: { key: PLAYLIST_SORT_KEYS.title, label: '曲目' },
  duration: { key: PLAYLIST_SORT_KEYS.duration, label: '時間' },
};

const props = defineProps({
  title: { type: String, required: true },
  tracks: { type: Array, default: () => [] },
  sort: { type: Object, required: true },
  currentTrackId: { type: String, default: null },
  selectedTrackId: { type: String, default: null },
  showArtwork: { type: Boolean, default: true },
  reorderAvailable: { type: Boolean, default: false },
  canReorder: { type: Boolean, default: false },
  draggingTrackId: { type: String, default: null },
  dropTargetTrackId: { type: String, default: null },
  dropPosition: { type: String, default: null },
});

const emit = defineEmits([
  'selectTrack',
  'activateTrack',
  'toggleSort',
  'moveTrack',
  'trackDragStart',
  'trackDragOver',
  'trackDragLeave',
  'trackDrop',
  'trackDragEnd',
]);

function isSortActive(key) {
  return props.sort.key === key;
}

function sortLabel({ key, label }) {
  if (!isSortActive(key)) return `${label}排序`;
  return `${label}${props.sort.direction === 'asc' ? '升冪' : '降冪'}排序`;
}
</script>

<template>
  <div
    class="studio-track-table"
    :class="{ 'studio-track-table--with-reorder': reorderAvailable }"
  >
    <div class="studio-track-table__header">
      <span v-if="reorderAvailable" aria-hidden="true"></span>
      <span>#</span>
      <button
        type="button"
        class="studio-track-table__sort"
        :class="{
          'studio-track-table__sort--active': isSortActive(
            SORT_COLUMNS.title.key,
          ),
        }"
        :aria-label="sortLabel(SORT_COLUMNS.title)"
        @click="emit('toggleSort', SORT_COLUMNS.title.key)"
      >
        <span>曲目</span>
        <ChevronDown
          v-if="isSortActive(SORT_COLUMNS.title.key)"
          class="studio-track-table__sort-indicator"
          :class="{
            'studio-track-table__sort-indicator--desc':
              sort.direction === 'desc',
          }"
          :size="ICON_SIZE"
          aria-hidden="true"
        />
      </button>
      <span>來源</span>
      <button
        type="button"
        class="studio-track-table__sort studio-track-table__sort--duration"
        :class="{
          'studio-track-table__sort--active': isSortActive(
            SORT_COLUMNS.duration.key,
          ),
        }"
        :aria-label="sortLabel(SORT_COLUMNS.duration)"
        @click="emit('toggleSort', SORT_COLUMNS.duration.key)"
      >
        <span>時間</span>
        <ChevronDown
          v-if="isSortActive(SORT_COLUMNS.duration.key)"
          class="studio-track-table__sort-indicator"
          :class="{
            'studio-track-table__sort-indicator--desc':
              sort.direction === 'desc',
          }"
          :size="ICON_SIZE"
          aria-hidden="true"
        />
      </button>
    </div>

    <ul
      class="studio-track-table__body"
      :aria-label="`${title}曲目`"
      role="list"
    >
      <li
        v-for="(track, index) in tracks"
        :key="track.id"
        class="studio-track-row"
        :class="{
          'studio-track-row--selected': selectedTrackId === track.id,
          'studio-track-row--current': currentTrackId === track.id,
          'studio-track-row--with-reorder': reorderAvailable,
          'studio-track-row--dragging': draggingTrackId === track.id,
          'studio-track-row--drop-before':
            dropTargetTrackId === track.id && dropPosition === 'before',
          'studio-track-row--drop-after':
            dropTargetTrackId === track.id && dropPosition === 'after',
        }"
        role="listitem"
        :aria-current="currentTrackId === track.id ? 'true' : undefined"
        @dragover="canReorder && emit('trackDragOver', track, $event)"
        @dragleave="canReorder && emit('trackDragLeave', track, $event)"
        @drop="canReorder && emit('trackDrop', track, $event)"
      >
        <button
          type="button"
          class="studio-track-row__action"
          :aria-label="`選取：${track.title}`"
          aria-description="單擊或空白鍵選取；雙擊或 Enter 播放"
          :aria-pressed="selectedTrackId === track.id"
          @click.stop="emit('selectTrack', track)"
          @dblclick.stop="emit('activateTrack', track)"
          @keydown.enter.prevent.stop="emit('activateTrack', track)"
          @keydown.space.prevent.stop="emit('selectTrack', track)"
        ></button>
        <UiIconButton
          v-if="reorderAvailable"
          class="studio-track-row__drag"
          :icon="GripVertical"
          :label="`調整順序：${track.title}`"
          :title="
            canReorder
              ? '拖曳，或使用方向鍵調整順序'
              : '清除搜尋並回到自訂順序後可調整'
          "
          :disabled="!canReorder"
          :draggable="canReorder"
          @click.stop
          @keydown.up.prevent.stop="emit('moveTrack', track.id, -1)"
          @keydown.down.prevent.stop="emit('moveTrack', track.id, 1)"
          @dragstart="canReorder && emit('trackDragStart', track, $event)"
          @dragend="canReorder && emit('trackDragEnd')"
        />
        <span class="studio-track-row__index" aria-hidden="true">
          <Volume2
            v-if="currentTrackId === track.id"
            :size="ICON_SIZE"
            aria-hidden="true"
          />
          <span v-else>{{ index + 1 }}</span>
        </span>
        <span class="studio-track-row__identity">
          <UiTrackThumb
            v-if="showArtwork"
            :track="track"
            size="var(--ui-track-artwork-size)"
          />
          <span class="studio-track-row__copy">
            <strong>{{ track.title }}</strong>
            <small>{{ track.artist || '未知演出者' }}</small>
          </span>
        </span>
        <span class="studio-track-row__source">
          {{ formatStudioTrackSource(track) }}
        </span>
        <span class="studio-track-row__duration">
          {{ formatDuration(track.duration) }}
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.studio-track-table {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}

.studio-track-table__header,
.studio-track-row {
  display: grid;
  grid-template-columns: 2.25rem minmax(12rem, 1fr) 7rem 4.5rem;
  min-width: 0;
  align-items: center;
  gap: var(--ui-space-2);
}

.studio-track-table--with-reorder .studio-track-table__header,
.studio-track-row--with-reorder {
  grid-template-columns:
    var(--ui-icon-button-size-md) 2.25rem minmax(12rem, 1fr)
    7rem 4.5rem;
}

.studio-track-table__header {
  position: sticky;
  z-index: var(--ui-z-sticky);
  top: 0;
  min-height: var(--ui-list-header-height);
  padding: 0 var(--ui-space-2);
  color: var(--ui-color-text-muted);
  background: var(--ui-color-surface);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
  -webkit-user-select: none;
  user-select: none;
}

.studio-track-row__action {
  position: absolute;
  z-index: 0;
  inset: 0;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: inherit;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}

.studio-track-row:has(.studio-track-row__action:focus-visible) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.studio-track-row__action:focus-visible {
  outline: none;
}

.studio-track-row__drag,
.studio-track-row__index,
.studio-track-row__identity,
.studio-track-row__source,
.studio-track-row__duration {
  position: relative;
  z-index: 1;
}

.studio-track-row__index,
.studio-track-row__identity,
.studio-track-row__source,
.studio-track-row__duration {
  pointer-events: none;
}

.studio-track-table__header > :last-child,
.studio-track-table__sort--duration {
  text-align: right;
}

.studio-track-table__sort {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  justify-self: start;
  gap: var(--ui-space-1);
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  font: inherit;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}

.studio-track-table__sort:hover,
.studio-track-table__sort--active {
  color: var(--ui-color-text);
}

.studio-track-table__sort:focus-visible {
  border-radius: var(--ui-radius-sm);
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.studio-track-table__sort--duration {
  justify-self: end;
}

.studio-track-table__sort-indicator {
  flex: 0 0 auto;
  color: var(--ui-color-accent);
  transition: transform var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.studio-track-table__sort-indicator--desc {
  transform: rotate(180deg);
}

.studio-track-table__body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  margin: 0;
  padding: var(--ui-space-1) 0 0;
  list-style: none;
}

.studio-track-row {
  position: relative;
  min-height: var(--ui-track-row-min-height);
  padding: var(--ui-space-1) var(--ui-space-2);
  color: var(--ui-color-text-muted);
  border-radius: var(--ui-radius-md);
  -webkit-user-select: none;
  user-select: none;
}

.studio-track-row--dragging {
  opacity: var(--ui-opacity-dragging);
}

.studio-track-row--drop-before::before,
.studio-track-row--drop-after::after {
  position: absolute;
  right: var(--ui-space-2);
  left: var(--ui-space-2);
  height: calc(var(--ui-border-width) * 2);
  background: var(--ui-color-accent);
  border-radius: var(--ui-radius-pill);
  content: '';
  pointer-events: none;
}

.studio-track-row--drop-before::before {
  top: 0;
}

.studio-track-row--drop-after::after {
  bottom: 0;
}

.studio-track-row:hover {
  color: var(--ui-color-text);
  background: var(--ui-color-surface-hover);
}

.studio-track-row--selected {
  background: var(--ui-playlist-row-selected-background);
  box-shadow: inset calc(var(--ui-border-width) * 2) 0 0
    var(--ui-color-border-strong);
}

.studio-track-row--current .studio-track-row__index,
.studio-track-row--current .studio-track-row__copy strong {
  color: var(--ui-color-current);
}

.studio-track-row__index {
  display: grid;
  place-items: center;
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
}

.studio-track-row__drag {
  display: inline-flex;
  width: var(--ui-icon-button-size-md);
  height: var(--ui-icon-button-size-md);
  align-items: center;
  justify-content: center;
  color: var(--ui-color-text-muted);
  cursor: grab;
  -webkit-user-select: none;
  user-select: none;
}

.studio-track-row__drag:active:not(:disabled) {
  cursor: grabbing;
}

.studio-track-row__drag:disabled {
  cursor: default;
}

.studio-track-row__identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--ui-space-2);
}

.studio-track-row__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.studio-track-row__copy strong,
.studio-track-row__copy small,
.studio-track-row__source {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-track-row__copy strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.studio-track-row__copy small {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.studio-track-row__source,
.studio-track-row__duration {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.studio-track-row__duration {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

@container dossier (max-width: 45rem) {
  .studio-track-table__header,
  .studio-track-row {
    grid-template-columns: 2rem minmax(0, 1fr) 4.25rem;
  }

  .studio-track-table--with-reorder .studio-track-table__header,
  .studio-track-row--with-reorder {
    grid-template-columns:
      var(--ui-icon-button-size-md) 2rem minmax(0, 1fr)
      4.25rem;
  }

  .studio-track-table:not(.studio-track-table--with-reorder)
    .studio-track-table__header
    > :nth-child(3),
  .studio-track-table--with-reorder .studio-track-table__header > :nth-child(4),
  .studio-track-row__source {
    display: none;
  }
}

@container dossier (max-width: 34rem) {
  .studio-track-table__header,
  .studio-track-row {
    grid-template-columns: 2rem minmax(0, 1fr);
  }

  .studio-track-table--with-reorder .studio-track-table__header,
  .studio-track-row--with-reorder {
    grid-template-columns: var(--ui-icon-button-size-md) 2rem minmax(0, 1fr);
  }

  .studio-track-table__header > :last-child,
  .studio-track-row__duration {
    display: none;
  }
}
</style>
