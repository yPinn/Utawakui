<script setup>
import { computed } from 'vue';
import {
  ChevronDown,
  Ellipsis,
  GripVertical,
  ICON_SIZE,
} from '../../icons/index.js';
import { trackContentLang } from '../../utils/contentLanguage.js';
import { formatAddedDate, formatDuration } from '../../utils/format.js';
import { PLAYLIST_SORT_KEYS } from '../../utils/playlistSort.js';
import TrackArtistCredits from './TrackArtistCredits.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiOverflowTooltip from '../ui/UiOverflowTooltip.vue';
import UiTextButton from '../ui/UiTextButton.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

const COLUMN_TRACKS = Object.freeze({
  reorder: 'var(--ui-icon-button-size-md)',
  index: '3ch',
  identity: 'minmax(0, 2fr)',
  'context-primary': 'minmax(7.5rem, 1fr)',
  duration: '4.5rem',
  actions: 'var(--ui-icon-button-size-md)',
  selection: 'var(--ui-control-height)',
  status: '5rem',
});

const props = defineProps({
  entries: { type: Array, default: () => [] },
  variant: {
    type: String,
    default: 'library',
    validator: (value) =>
      ['library', 'playlist', 'album', 'artist', 'review'].includes(value),
  },
  label: { type: String, default: '' },
  identityLabel: { type: String, default: '曲目' },
  contextLabel: { type: String, default: '新增日期' },
  durationLabel: { type: String, default: '時長' },
  statusLabel: { type: String, default: '狀態' },
  sort: {
    type: Object,
    default: () => ({ key: null, direction: 'asc' }),
  },
  sortable: { type: Boolean, default: false },
  canDrag: { type: Boolean, default: false },
  selectedTrackId: { type: String, default: null },
  currentTrackId: { type: String, default: null },
  draggingTrackId: { type: String, default: null },
  dropTargetTrackId: { type: String, default: null },
  dropPosition: { type: String, default: null },
  jumpableTrackIds: { type: Set, default: () => new Set() },
  // compact: one-line rows without artwork, for scanning long lists.
  density: {
    type: String,
    default: 'list',
    validator: (value) => ['list', 'compact'].includes(value),
  },
});

const emit = defineEmits([
  'toggleSort',
  'selectTrack',
  'activateTrack',
  'titleClick',
  'openMenu',
  'moveTrack',
  'trackDragStart',
  'trackDragOver',
  'trackDragLeave',
  'trackDrop',
  'trackDragEnd',
]);

const isReviewVariant = computed(() => props.variant === 'review');
const hasReorderColumn = computed(() => props.variant === 'playlist');
const showsArtwork = computed(
  () => props.variant !== 'album' && props.density !== 'compact',
);
const showsArtist = computed(() => props.variant !== 'artist');

const columnRoles = computed(() =>
  isReviewVariant.value
    ? ['selection', 'identity', 'duration', 'status']
    : [
        ...(hasReorderColumn.value ? ['reorder'] : []),
        'index',
        'identity',
        'context-primary',
        'duration',
        'actions',
      ],
);

function templateFor(roles) {
  return roles.map((role) => COLUMN_TRACKS[role]).join(' ');
}

const gridStyle = computed(() => ({
  '--library-track-table-grid': templateFor(columnRoles.value),
  '--library-track-table-grid-medium': templateFor(
    columnRoles.value.filter((role) => role !== 'context-primary'),
  ),
  '--library-track-table-grid-narrow': templateFor(
    columnRoles.value.filter(
      (role) => role !== 'context-primary' && role !== 'duration',
    ),
  ),
}));

const resolvedLabel = computed(() => {
  if (props.label) return props.label;
  if (props.variant === 'album') return '專輯曲目';
  if (props.variant === 'artist') return '藝人曲目';
  if (props.variant === 'playlist') return '播放清單曲目';
  if (props.variant === 'review') return '匯入曲目確認';
  return '曲庫曲目';
});

function isSortActive(key) {
  return props.sort.key === key;
}

function sortLabel(key, label) {
  if (!isSortActive(key)) return `${label}排序`;
  return `${label}${props.sort.direction === 'asc' ? '升冪' : '降冪'}排序`;
}
</script>

<template>
  <div
    class="library-track-table"
    :class="{ 'library-track-table--compact': density === 'compact' }"
    :data-track-table-variant="variant"
  >
    <div class="library-track-table__header" :style="gridStyle">
      <span
        v-if="isReviewVariant"
        data-track-column="selection"
        aria-label="選取"
      ></span>
      <span
        v-if="hasReorderColumn"
        data-track-column="reorder"
        aria-label="排序"
      ></span>
      <span v-if="!isReviewVariant" data-track-column="index">#</span>
      <span data-track-column="identity">
        <button
          v-if="sortable"
          type="button"
          class="library-track-table__sort"
          :class="{
            'library-track-table__sort--active': isSortActive(
              PLAYLIST_SORT_KEYS.title,
            ),
          }"
          :aria-label="sortLabel(PLAYLIST_SORT_KEYS.title, identityLabel)"
          @click="emit('toggleSort', PLAYLIST_SORT_KEYS.title)"
        >
          <span>{{ identityLabel }}</span>
          <ChevronDown
            v-if="isSortActive(PLAYLIST_SORT_KEYS.title)"
            class="library-track-table__sort-indicator"
            :class="{
              'library-track-table__sort-indicator--desc':
                sort.direction === 'desc',
            }"
            :size="ICON_SIZE"
            aria-hidden="true"
          />
        </button>
        <span v-else>{{ identityLabel }}</span>
      </span>
      <span
        v-if="!isReviewVariant"
        data-track-column="context-primary"
        data-column-priority="secondary"
      >
        <button
          v-if="sortable"
          type="button"
          class="library-track-table__sort"
          :class="{
            'library-track-table__sort--active': isSortActive(
              PLAYLIST_SORT_KEYS.addedAt,
            ),
          }"
          :aria-label="sortLabel(PLAYLIST_SORT_KEYS.addedAt, contextLabel)"
          @click="emit('toggleSort', PLAYLIST_SORT_KEYS.addedAt)"
        >
          <span>{{ contextLabel }}</span>
          <ChevronDown
            v-if="isSortActive(PLAYLIST_SORT_KEYS.addedAt)"
            class="library-track-table__sort-indicator"
            :class="{
              'library-track-table__sort-indicator--desc':
                sort.direction === 'desc',
            }"
            :size="ICON_SIZE"
            aria-hidden="true"
          />
        </button>
        <span v-else>{{ contextLabel }}</span>
      </span>
      <span data-track-column="duration" data-column-priority="tertiary">
        <button
          v-if="sortable"
          type="button"
          class="library-track-table__sort"
          :class="{
            'library-track-table__sort--active': isSortActive(
              PLAYLIST_SORT_KEYS.duration,
            ),
          }"
          :aria-label="sortLabel(PLAYLIST_SORT_KEYS.duration, durationLabel)"
          @click="emit('toggleSort', PLAYLIST_SORT_KEYS.duration)"
        >
          <span>{{ durationLabel }}</span>
          <ChevronDown
            v-if="isSortActive(PLAYLIST_SORT_KEYS.duration)"
            class="library-track-table__sort-indicator"
            :class="{
              'library-track-table__sort-indicator--desc':
                sort.direction === 'desc',
            }"
            :size="ICON_SIZE"
            aria-hidden="true"
          />
        </button>
        <span v-else>{{ durationLabel }}</span>
      </span>
      <span v-if="isReviewVariant" data-track-column="status">
        {{ statusLabel }}
      </span>
      <span v-else data-track-column="actions" aria-label="操作"></span>
    </div>

    <ul
      class="library-track-table__body"
      role="list"
      :aria-label="resolvedLabel"
    >
      <li
        v-for="{ track, visibleIndex, addedAt, source } in entries"
        :key="track.id"
        class="library-track-row"
        :class="{
          'library-track-row--selected': selectedTrackId === track.id,
          'library-track-row--current': currentTrackId === track.id,
          'library-track-row--review': isReviewVariant,
          'library-track-row--dragging': draggingTrackId === track.id,
          'library-track-row--drop-before':
            dropTargetTrackId === track.id && dropPosition === 'before',
          'library-track-row--drop-after':
            dropTargetTrackId === track.id && dropPosition === 'after',
        }"
        :style="gridStyle"
        role="listitem"
        :aria-current="currentTrackId === track.id ? 'true' : undefined"
        @contextmenu="!isReviewVariant && emit('openMenu', track, $event)"
        @dragover="canDrag && emit('trackDragOver', track, $event)"
        @dragleave="canDrag && emit('trackDragLeave', track, $event)"
        @drop="canDrag && emit('trackDrop', track, $event)"
      >
        <button
          v-if="!isReviewVariant"
          type="button"
          class="library-track-row__action"
          :aria-label="`選取：${track.title}`"
          aria-description="單擊或空白鍵選取；雙擊或 Enter 播放"
          :aria-pressed="selectedTrackId === track.id"
          @click.stop="emit('selectTrack', track)"
          @dblclick.stop="emit('activateTrack', track)"
          @keydown.enter.prevent.stop="emit('activateTrack', track)"
          @keydown.space.prevent.stop="emit('selectTrack', track)"
        ></button>

        <span
          v-if="hasReorderColumn"
          class="library-track-row__reorder-cell"
          data-track-column="reorder"
        >
          <UiIconButton
            class="library-track-row__reorder"
            :icon="GripVertical"
            :label="`調整順序：${track.title}`"
            :title="
              canDrag
                ? '拖曳，或使用方向鍵調整順序'
                : '清除搜尋並回到自訂順序後可調整'
            "
            :disabled="!canDrag"
            :draggable="canDrag"
            @click.stop
            @dblclick.stop
            @keydown.up.prevent.stop="emit('moveTrack', track.id, -1)"
            @keydown.down.prevent.stop="emit('moveTrack', track.id, 1)"
            @dragstart="canDrag && emit('trackDragStart', track, $event)"
            @dragend="canDrag && emit('trackDragEnd')"
          />
        </span>

        <span
          v-if="isReviewVariant"
          class="library-track-row__selection"
          data-track-column="selection"
        >
          <slot name="row-leading" :track="track" :source="source || track" />
        </span>

        <span v-else class="library-track-row__index" data-track-column="index">
          {{ visibleIndex + 1 }}
        </span>

        <span class="library-track-row__identity" data-track-column="identity">
          <UiTrackThumb
            v-if="showsArtwork"
            class="library-track-row__thumb"
            :track="track"
            size="var(--ui-track-row-thumb-size)"
          />
          <span class="library-track-row__copy" :lang="trackContentLang(track)">
            <UiTextButton
              v-if="!isReviewVariant && jumpableTrackIds.has(track.id)"
              class="library-track-row__title library-track-row__title--destination"
              :text="track.title"
              :aria-label="`前往專輯：${track.title}`"
              @click="emit('titleClick', track)"
              @dblclick.stop
            />
            <UiOverflowTooltip
              v-else-if="isReviewVariant"
              class="library-track-row__title library-track-row__review-text"
              :text="track.title"
            >
              {{ track.title }}
            </UiOverflowTooltip>
            <UiMarqueeText
              v-else
              class="library-track-row__title"
              :text="track.title"
            />
            <UiOverflowTooltip
              v-if="track.artist && isReviewVariant"
              class="library-track-row__subtitle library-track-row__review-text"
              :text="track.artist"
            >
              {{ track.artist }}
            </UiOverflowTooltip>
            <TrackArtistCredits
              v-else-if="track.artist && showsArtist"
              class="library-track-row__subtitle"
              :track="track"
            />
          </span>
        </span>

        <span
          v-if="!isReviewVariant"
          class="library-track-row__context"
          data-track-column="context-primary"
          data-column-priority="secondary"
        >
          {{ formatAddedDate(addedAt) }}
        </span>
        <span
          class="library-track-row__duration"
          data-track-column="duration"
          data-column-priority="tertiary"
        >
          {{ formatDuration(track.duration) }}
        </span>
        <span
          v-if="isReviewVariant"
          class="library-track-row__status"
          data-track-column="status"
        >
          <slot name="row-trailing" :track="track" :source="source || track" />
        </span>
        <span
          v-else
          class="library-track-row__actions"
          data-track-column="actions"
        >
          <UiIconButton
            class="library-track-row__more"
            :icon="Ellipsis"
            :label="`更多：${track.title}`"
            @click.stop="emit('openMenu', track, $event)"
            @dblclick.stop
          />
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.library-track-table {
  min-width: 0;
  margin-block-start: var(--ui-space-2);
  container-name: library-track-table;
  container-type: inline-size;
  user-select: none;
  -webkit-user-select: none;
}

.library-track-table[data-track-table-variant='review'] {
  margin-block-start: 0;
}

.library-track-table__header,
.library-track-row {
  display: grid;
  grid-template-columns: var(--library-track-table-grid);
  min-width: 0;
  align-items: center;
  gap: var(--ui-track-row-gap);
}

.library-track-table__header {
  /* Sticks below the page's compact bar once the dossier scrolls away. */
  position: sticky;
  top: var(--ui-folder-sticky-offset, 0);
  z-index: var(--ui-layer-overlay);
  min-height: var(--ui-list-header-height);
  background: var(--ui-folder-page-background, var(--ui-color-surface));
  padding-inline: var(--ui-track-row-padding-inline);
  color: var(--ui-color-text-muted);
  border-bottom: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule-strong, var(--ui-color-border));
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.library-track-table[data-track-table-variant='review']
  .library-track-table__header {
  background: var(--ui-color-surface-raised);
}

.library-track-table__sort {
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
  text-align: start;
  cursor: pointer;
}

.library-track-table__sort:hover,
.library-track-table__sort--active {
  color: var(--ui-color-text);
}

.library-track-table__sort:focus-visible {
  border-radius: var(--ui-radius-sm);
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.library-track-table__sort-indicator {
  flex: 0 0 auto;
  color: var(--ui-color-accent);
  transition: transform var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.library-track-table__sort-indicator--desc {
  transform: rotate(180deg);
}

.library-track-table__body {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.library-track-row {
  position: relative;
  isolation: isolate;
  min-height: var(--ui-track-row-min-height);
  padding: var(--ui-track-row-padding-block) var(--ui-track-row-padding-inline);
  color: var(--ui-color-text);
  border-bottom: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule, var(--ui-color-border));
  border-radius: 0;
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.library-track-row__action {
  position: absolute;
  z-index: var(--ui-layer-base);
  inset: 0;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: inherit;
  cursor: pointer;
}

.library-track-row:has(.library-track-row__action:focus-visible) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.library-track-row__action:focus-visible {
  outline: none;
}

.library-track-row:hover {
  background: var(--ui-color-surface-hover);
}

.library-track-row--selected {
  background: var(--ui-track-row-selected-surface);
}

.library-track-row--current .library-track-row__title {
  color: var(--ui-color-current);
}

.library-track-row--dragging {
  opacity: var(--ui-opacity-dragging);
}

.library-track-row--drop-before::before,
.library-track-row--drop-after::after {
  position: absolute;
  right: var(--ui-track-row-padding-inline);
  left: var(--ui-track-row-padding-inline);
  height: var(--ui-drag-indicator-width);
  background: var(--ui-color-accent);
  border-radius: var(--ui-radius-pill);
  content: '';
  pointer-events: none;
}

.library-track-row--drop-before::before {
  top: calc(var(--ui-space-1) * -1);
}

.library-track-row--drop-after::after {
  bottom: calc(var(--ui-space-1) * -1);
}

.library-track-row__reorder-cell,
.library-track-row__selection,
.library-track-row__index,
.library-track-row__identity,
.library-track-row__context,
.library-track-row__duration,
.library-track-row__actions,
.library-track-row__status {
  position: relative;
  z-index: var(--ui-layer-raised);
}

.library-track-row__reorder-cell,
.library-track-row__selection,
.library-track-row__actions,
.library-track-row__status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.library-track-row__index,
.library-track-row__identity,
.library-track-row__context,
.library-track-row__duration {
  pointer-events: none;
}

.library-track-row__identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-track-row-gap);
}

.library-track-row__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.library-track-row--review .library-track-row__copy {
  flex: 1 1 0;
  max-width: 100%;
  overflow: hidden;
}

.library-track-row--review :deep(.library-track-row__review-text) {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-track-row__title {
  min-width: 0;
  font-weight: var(--ui-font-weight-semibold);
}

.library-track-table--compact .library-track-row {
  min-height: var(--ui-track-row-compact-min-height);
}

.library-track-table--compact .library-track-row__copy {
  flex-direction: row;
  align-items: baseline;
  gap: var(--ui-space-2);
}

.library-track-table--compact .library-track-row__title {
  flex: 0 1 auto;
}

.library-track-table--compact .library-track-row__subtitle {
  flex: 1 1 0;
}

.library-track-row__title--destination,
.library-track-row__subtitle :deep(.track-artist-credits__link) {
  position: relative;
  z-index: var(--ui-layer-raised);
  pointer-events: auto;
}

.library-track-row__subtitle,
.library-track-row__context,
.library-track-row__duration {
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-track-column='reorder'],
[data-track-column='selection'],
[data-track-column='index'],
[data-track-column='actions'],
[data-track-column='status'] {
  justify-self: center;
  text-align: center;
}

[data-track-column='identity'],
[data-track-column='context-primary'] {
  justify-self: stretch;
  text-align: start;
}

[data-track-column='duration'] {
  justify-self: end;
  text-align: end;
}

[data-track-column='index'],
[data-track-column='context-primary'],
[data-track-column='duration'] {
  font-variant-numeric: tabular-nums;
}

.library-track-table__header
  > [data-track-column='duration']
  .library-track-table__sort {
  width: 100%;
  justify-content: flex-end;
}

@container library-track-table (max-width: 44rem) {
  .library-track-table__header,
  .library-track-row {
    grid-template-columns: var(--library-track-table-grid-medium);
  }

  [data-column-priority='secondary'] {
    display: none;
  }
}

@container library-track-table (max-width: 30rem) {
  .library-track-table__header,
  .library-track-row {
    grid-template-columns: var(--library-track-table-grid-narrow);
  }

  [data-column-priority='tertiary'] {
    display: none;
  }
}
</style>
