<script setup>
// A hand-rolled 5-column grid table, not UiTrackRow — the header and rows
// share one grid-template-columns rule (must move as a single CSS rule if
// this file is ever touched again, never split across two selectors), the
// layout model is grid rather than UiTrackRow's flex, and rows carry drag
// reorder + a #-index column UiTrackRow has no slot for. Sort state stays
// in the parent view (it doubles as playback queue order), so this
// component only renders from props and emits intent.
import { GripVertical } from '../../icons/index.js';
import { formatDuration, formatAddedDate } from '../../utils/format.js';
import { PLAYLIST_SORT_KEYS } from '../../utils/playlistSort.js';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiTextButton from '../ui/UiTextButton.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

// align: 'end' keeps duration header/body columns right-aligned together.
const SORT_COLUMNS = [
  { key: PLAYLIST_SORT_KEYS.title, label: '曲目' },
  { key: PLAYLIST_SORT_KEYS.addedAt, label: '新增日期' },
  { key: PLAYLIST_SORT_KEYS.duration, label: '時長', align: 'end' },
];

const props = defineProps({
  entries: { type: Array, default: () => [] },
  sort: { type: Object, required: true },
  // Album track rows omit the thumbnail — every track on an album shares
  // the same cover art (already shown once in the hero above), so a
  // per-row thumbnail column would just repeat it 10+ times for nothing.
  isAlbum: { type: Boolean, default: false },
  canDrag: { type: Boolean, default: false },
  activeTrackId: { type: String, default: null },
  draggingTrackId: { type: String, default: null },
  dropTargetTrackId: { type: String, default: null },
  dropPosition: { type: String, default: null },
  // Track ids whose title should jump to their source album (see
  // useAlbumNavigation.js). Empty in album mode itself — no jumping to the
  // album you're already viewing.
  jumpableTrackIds: { type: Set, default: () => new Set() },
});

const emit = defineEmits([
  'toggleSort',
  'selectTrack',
  'titleClick',
  'openMenu',
  'trackDragStart',
  'trackDragOver',
  'trackDragLeave',
  'trackDrop',
  'trackDragEnd',
]);

function isSortActive(key) {
  return props.sort.key === key;
}

function sortLabel(key, label) {
  if (!isSortActive(key)) return `${label}排序`;
  return `${label}${props.sort.direction === 'asc' ? '升冪' : '降冪'}排序`;
}
</script>

<template>
  <div class="playlist-table" aria-label="播放清單曲目">
    <div class="playlist-table__head">
      <span class="playlist-table__drag"></span>
      <span class="playlist-table__index">#</span>
      <button
        v-for="column in SORT_COLUMNS"
        :key="column.key"
        type="button"
        class="playlist-table__sort"
        :class="{
          'playlist-table__sort--duration': column.align === 'end',
          'playlist-table__duration': column.align === 'end',
          'playlist-table__sort--active': isSortActive(column.key),
        }"
        :aria-label="sortLabel(column.key, column.label)"
        @click="emit('toggleSort', column.key)"
      >
        <span>{{ column.label }}</span>
        <span
          v-if="isSortActive(column.key)"
          class="playlist-table__sort-indicator"
          :class="{
            'playlist-table__sort-indicator--desc': sort.direction === 'desc',
          }"
        ></span>
      </button>
    </div>
    <ul class="playlist-table__body">
      <li
        v-for="{ track, visibleIndex, addedAt } in entries"
        :key="track.id"
        class="playlist-track"
        :class="{
          'playlist-track--active': activeTrackId === track.id,
          'playlist-track--dragging': draggingTrackId === track.id,
          'playlist-track--drop-before':
            dropTargetTrackId === track.id && dropPosition === 'before',
          'playlist-track--drop-after':
            dropTargetTrackId === track.id && dropPosition === 'after',
          'playlist-track--drag-disabled': !canDrag,
        }"
        :draggable="canDrag"
        @click="emit('selectTrack', track)"
        @contextmenu="emit('openMenu', track, $event)"
        @dragstart="emit('trackDragStart', track, $event)"
        @dragover="emit('trackDragOver', track, $event)"
        @dragleave="emit('trackDragLeave', track, $event)"
        @drop="emit('trackDrop', track, $event)"
        @dragend="emit('trackDragEnd')"
      >
        <!-- Always rendered, even for albums — .playlist-table__head and
             .playlist-track share one grid-template-columns rule (see the
             comment at the top of this file), so removing this child
             entirely would shift every column after it left by one. Only
             the icon inside is conditional. -->
        <span
          class="playlist-track__drag"
          :title="isAlbum ? undefined : '拖曳排序'"
          aria-hidden="true"
        >
          <GripVertical v-if="!isAlbum" :size="16" aria-hidden="true" />
        </span>
        <span class="playlist-track__index">{{ visibleIndex + 1 }}</span>
        <span class="playlist-track__main">
          <UiTrackThumb
            v-if="!isAlbum"
            class="playlist-track__thumb"
            :track="track"
            :size="44"
          />
          <span class="playlist-track__copy">
            <UiTextButton
              v-if="jumpableTrackIds.has(track.id)"
              class="playlist-track__title"
              :text="track.title"
              :aria-label="`前往專輯：${track.title}`"
              @click="emit('titleClick', track)"
            />
            <UiMarqueeText
              v-else
              class="playlist-track__title"
              :text="track.title"
            />
            <span v-if="track.artist" class="playlist-track__subtitle">
              {{ track.artist }}
            </span>
          </span>
        </span>
        <span class="playlist-track__added">
          {{ formatAddedDate(addedAt) }}
        </span>
        <span class="playlist-track__duration">
          {{ formatDuration(track.duration) }}
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.playlist-table {
  margin-top: var(--ui-space-2);
  user-select: none;
  -webkit-user-select: none;
}

.playlist-table__head,
.playlist-track {
  display: grid;
  grid-template-columns: 24px 3ch minmax(0, 2fr) minmax(120px, 1fr) 64px;
  gap: var(--ui-space-3);
  align-items: center;
}

.playlist-table__head {
  padding: 0 var(--ui-space-3) var(--ui-space-2);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.playlist-table__sort {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: var(--ui-space-1);
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.playlist-table__sort:hover,
.playlist-table__sort--active {
  color: var(--ui-color-text);
}

.playlist-table__sort:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
  border-radius: var(--ui-radius);
}

.playlist-table__sort--duration {
  justify-self: end;
}

.playlist-table__sort-indicator {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid var(--ui-color-accent);
}

.playlist-table__sort-indicator--desc {
  transform: rotate(180deg);
}

.playlist-table__duration,
.playlist-track__duration {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.playlist-table__body {
  list-style: none;
  margin: 0;
  padding: var(--ui-space-1) 0 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.playlist-track {
  position: relative;
  min-height: 52px;
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  cursor: grab;
}

.playlist-track:active {
  cursor: grabbing;
}

.playlist-track--drag-disabled {
  cursor: pointer;
}

.playlist-track--dragging {
  opacity: var(--ui-opacity-dragging);
}

.playlist-track--drop-before::before,
.playlist-track--drop-after::after {
  content: '';
  position: absolute;
  left: var(--ui-space-3);
  right: var(--ui-space-3);
  height: 2px;
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-accent);
  pointer-events: none;
}

.playlist-track--drop-before::before {
  top: -3px;
}

.playlist-track--drop-after::after {
  bottom: -3px;
}

.playlist-track:hover {
  background: var(--ui-color-surface-hover);
}

.playlist-track--active {
  background: var(--ui-color-accent);
  color: var(--ui-color-accent-contrast);
}

.playlist-track__index,
.playlist-track__added,
.playlist-track__duration {
  color: var(--ui-color-text-muted);
}

.playlist-track__drag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--ui-color-text-muted);
}

.playlist-track--active .playlist-track__index,
.playlist-track--active .playlist-track__added,
.playlist-track--active .playlist-track__duration {
  color: var(--ui-color-accent-contrast-muted);
}

.playlist-track--active .playlist-track__drag {
  color: var(--ui-color-accent-contrast-muted);
}

.playlist-track__main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.playlist-track__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.playlist-track__subtitle,
.playlist-track__added {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playlist-track__title {
  font-weight: var(--ui-font-weight-strong);
}

.playlist-track__subtitle {
  color: var(--ui-color-text-muted);
}

.playlist-track--active .playlist-track__subtitle {
  color: var(--ui-color-accent-contrast-muted);
}
</style>
