<script setup>
import { computed, shallowRef, toRef, watch } from 'vue';
import { ChevronDown, ICON_SIZE } from '../../icons/index.js';
import { useTrackCollectionColumns } from '../../composables/useTrackCollectionColumns.js';
import { useDeferredLoading } from '../../composables/useDeferredLoading.js';
import { useVirtualList } from '../../composables/useVirtualRows.js';
import UiSkeleton from '../ui/UiSkeleton.vue';
import '../../styles/loading.css';
import TrackCollectionRow from './TrackCollectionRow.vue';
import TrackTableColumnChooser from './TrackTableColumnChooser.vue';
import {
  TRACK_COLLECTION_KINDS,
  projectTrackCollectionEntries,
  reorderTrackCollectionColumn,
  trackCollectionColumnChoices,
  trackCollectionProfile,
} from './trackCollectionProfiles.js';

const VARIANT_KIND = Object.freeze({
  library: 'library-all',
  playlist: 'playlist',
  album: 'album',
  artist: 'artist',
});

const props = defineProps({
  entries: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  contentKey: { type: String, default: '' },
  collectionKind: {
    type: String,
    default: '',
    validator: (value) => !value || TRACK_COLLECTION_KINDS.includes(value),
  },
  // Compatibility input while callers migrate to collectionKind.
  variant: {
    type: String,
    default: 'library',
    validator: (value) =>
      ['library', 'playlist', 'album', 'artist'].includes(value),
  },
  label: { type: String, default: '' },
  columnPreferences: { type: Object, default: () => ({}) },
  sort: {
    type: Object,
    default: () => ({ key: null, direction: 'asc' }),
  },
  canReorderPlaylistTracks: { type: Boolean, default: false },
  selectedTrackId: { type: String, default: '' },
  selectedEntryKey: { type: String, default: '' },
  currentTrackId: { type: String, default: '' },
  playingTrackId: { type: String, default: '' },
  draggingTrackId: { type: String, default: '' },
  dropTargetTrackId: { type: String, default: '' },
  dropPosition: { type: String, default: '' },
  albumJumpableTrackIds: { type: Set, default: () => new Set() },
  vsQueuedTrackIds: { type: Set, default: () => new Set() },
  vsEnqueuePendingTrackId: { type: String, default: '' },
  density: {
    type: String,
    default: 'list',
    validator: (value) => ['list', 'compact'].includes(value),
  },
  // Window rows once the list is longer than this; 0 renders every row.
  virtualizeAbove: { type: Number, default: 0 },
});

const emit = defineEmits([
  'selectEntry',
  'entryKeydown',
  'openEntryMenu',
  'updateColumnPreferences',
  'layoutChange',
  'toggleSort',
  'selectTrack',
  'activateTrack',
  'togglePlayback',
  'navigateAlbum',
  'queueSeparation',
  'openMenu',
  'moveTrack',
  'trackDragStart',
  'trackDragOver',
  'trackDragLeave',
  'trackDrop',
  'trackDragEnd',
]);

const initialLoading = computed(
  () => props.loading && props.entries.length === 0,
);
const resolvedCollectionKind = computed(
  () => props.collectionKind || VARIANT_KIND[props.variant],
);
const { skeletonVisible, revealContent, finishReveal } = useDeferredLoading(
  initialLoading,
  {
    identity: () => props.contentKey || resolvedCollectionKind.value,
    hasContent: () => props.entries.length > 0,
  },
);
const profile = computed(() =>
  trackCollectionProfile(resolvedCollectionKind.value),
);
const projectedEntries = computed(() =>
  projectTrackCollectionEntries(props.entries, resolvedCollectionKind.value),
);
function rowKey(entry) {
  return profile.value.readOnly || profile.value.managedActions
    ? entry.key
    : (entry.key ?? entry.track.id);
}

const bodyList = shallowRef(null);
const {
  rows: renderedRows,
  rowAttrs,
  listStyle,
  listListeners,
} = useVirtualList({
  listRef: bodyList,
  items: () => projectedEntries.value,
  keyOf: rowKey,
  threshold: () => props.virtualizeAbove,
  // Dragged rows stay mounted so dragend survives scrolling.
  pinnedKeys: () => {
    if (!props.draggingTrackId) return [];
    const dragged = projectedEntries.value.find(
      (entry) => entry.track?.id === props.draggingTrackId,
    );
    return dragged ? [rowKey(dragged)] : [];
  },
  // First-frame guess from measured default rows; replaced once one renders.
  estimateRowHeight: () => (props.density === 'compact' ? 36 : 46),
});

const dragEnabled = computed(
  () =>
    profile.value.canReorderPlaylistTracks && props.canReorderPlaylistTracks,
);
const hasColumnChoices = computed(
  () => trackCollectionColumnChoices(resolvedCollectionKind.value).length > 0,
);

const {
  columnResizeBounds,
  columnWidth,
  columnWidthContract,
  gridStyle,
  guideStyle,
  isResizing,
  layout,
  resetColumnWidth,
  resizeColumnFromKeyboard,
  startColumnResize,
} = useTrackCollectionColumns({
  collectionKind: resolvedCollectionKind,
  preferences: toRef(props, 'columnPreferences'),
  onUpdatePreferences: (preferences) =>
    emit('updateColumnPreferences', preferences),
});

const draggedHeaderRole = shallowRef('');
const headerDropTargetRole = shallowRef('');
const headerDropPosition = shallowRef('');

watch(
  () => layout.value.hiddenForWidth.join('|'),
  () => emit('layoutChange', [...layout.value.hiddenForWidth]),
  { immediate: true },
);

function isSortActive(key) {
  return props.sort.key === key;
}

function sortLabel(key, label) {
  if (!isSortActive(key)) return `${label}排序`;
  return `${label}${props.sort.direction === 'asc' ? '升冪' : '降冪'}排序`;
}

function isColumnSortable(column) {
  if (!profile.value.canSortTrackRows || !column.sortKey) return false;
  if (column.sortKey !== 'playCount') return true;
  return projectedEntries.value.some((entry) => entry.playCount !== null);
}

function forwardOpenMenu(...args) {
  emit('openMenu', ...args);
}

function forwardMoveTrack(...args) {
  emit('moveTrack', ...args);
}

function forwardTrackDragStart(...args) {
  emit('trackDragStart', ...args);
}

function forwardTrackDragOver(...args) {
  emit('trackDragOver', ...args);
}

function forwardTrackDragLeave(...args) {
  emit('trackDragLeave', ...args);
}

function forwardTrackDrop(...args) {
  emit('trackDrop', ...args);
}

function isHeaderColumnReorderable(column) {
  return profile.value.canReorderColumns && Boolean(column.textField);
}

function headerColumnLabel(column) {
  return isHeaderColumnReorderable(column)
    ? `${column.label}欄；拖曳，或按 Alt 加左右方向鍵調整順序`
    : column.role === 'actions'
      ? column.label
      : undefined;
}

function plainPreferences(preferences) {
  return {
    visibleAdvanced: [...preferences.visibleAdvanced],
    hiddenDefaultColumns: [...preferences.hiddenDefaultColumns],
    widths: { ...preferences.widths },
    ...(preferences.columnOrder
      ? { columnOrder: [...preferences.columnOrder] }
      : {}),
  };
}

function emitHeaderReorder(movedRole, targetRole, position) {
  const reordered = reorderTrackCollectionColumn(
    resolvedCollectionKind.value,
    props.columnPreferences,
    movedRole,
    targetRole,
    position,
  );
  emit('updateColumnPreferences', plainPreferences(reordered));
}

function clearHeaderDrag() {
  draggedHeaderRole.value = '';
  headerDropTargetRole.value = '';
  headerDropPosition.value = '';
}

function startHeaderDrag(column, event) {
  if (!isHeaderColumnReorderable(column)) return;
  draggedHeaderRole.value = column.role;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', column.role);
  }
}

function updateHeaderDrop(column, event) {
  if (
    !draggedHeaderRole.value ||
    !isHeaderColumnReorderable(column) ||
    draggedHeaderRole.value === column.role
  ) {
    return;
  }
  event.preventDefault();
  const bounds = event.currentTarget?.getBoundingClientRect?.();
  const midpoint = bounds ? bounds.left + bounds.width / 2 : null;
  headerDropTargetRole.value = column.role;
  headerDropPosition.value =
    midpoint != null && Number.isFinite(event.clientX)
      ? event.clientX < midpoint
        ? 'before'
        : 'after'
      : 'before';
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function leaveHeaderDrop(column, event) {
  if (event.currentTarget?.contains?.(event.relatedTarget)) return;
  if (headerDropTargetRole.value !== column.role) return;
  headerDropTargetRole.value = '';
  headerDropPosition.value = '';
}

function dropHeaderColumn(column, event) {
  if (
    !draggedHeaderRole.value ||
    !isHeaderColumnReorderable(column) ||
    draggedHeaderRole.value === column.role
  ) {
    clearHeaderDrag();
    return;
  }
  event.preventDefault();
  emitHeaderReorder(
    draggedHeaderRole.value,
    column.role,
    headerDropPosition.value || 'before',
  );
  clearHeaderDrag();
}

function reorderHeaderFromKeyboard(column, event) {
  if (event.currentTarget !== event.target) return;
  if (
    !event.altKey ||
    !isHeaderColumnReorderable(column) ||
    !['ArrowLeft', 'ArrowRight'].includes(event.key)
  ) {
    return;
  }
  const visible = layout.value.columns.filter(isHeaderColumnReorderable);
  const currentIndex = visible.findIndex(
    (candidate) => candidate.role === column.role,
  );
  const delta = event.key === 'ArrowLeft' ? -1 : 1;
  const target = visible[currentIndex + delta];
  if (!target) return;
  event.preventDefault();
  event.stopPropagation?.();
  emitHeaderReorder(column.role, target.role, delta < 0 ? 'before' : 'after');
}
</script>

<template>
  <div
    ref="table"
    class="library-track-table"
    :class="{
      'library-track-table--compact': density === 'compact',
      'library-track-table--resizing': isResizing,
    }"
    :data-track-table-variant="variant"
    :data-collection-kind="resolvedCollectionKind"
    :aria-busy="initialLoading || undefined"
  >
    <span v-if="initialLoading" class="ui-visually-hidden" role="status"
      >正在讀取曲目</span
    >
    <div ref="header" class="library-track-table__header" :style="gridStyle">
      <span
        v-for="column in layout.columns"
        :key="column.role"
        :class="{
          'library-track-table__header-column--reorderable':
            isHeaderColumnReorderable(column),
          'library-track-table__header-column--dragging':
            draggedHeaderRole === column.role,
          'library-track-table__header-column--drop-before':
            headerDropTargetRole === column.role &&
            headerDropPosition === 'before',
          'library-track-table__header-column--drop-after':
            headerDropTargetRole === column.role &&
            headerDropPosition === 'after',
        }"
        :data-track-column="column.role"
        :data-column-align="column.headerAlign ?? column.align"
        :data-column-numeric="column.numeric ? 'true' : undefined"
        :data-column-reorderable="
          isHeaderColumnReorderable(column) ? 'true' : undefined
        "
        :data-column-priority="
          column.priority === 'essential' ? undefined : column.priority
        "
        :aria-hidden="column.role === 'spacer' ? 'true' : undefined"
        :aria-label="headerColumnLabel(column)"
        :draggable="isHeaderColumnReorderable(column) ? true : undefined"
        :tabindex="isHeaderColumnReorderable(column) ? 0 : undefined"
        @keydown="reorderHeaderFromKeyboard(column, $event)"
        @dragstart="startHeaderDrag(column, $event)"
        @dragover="updateHeaderDrop(column, $event)"
        @dragleave="leaveHeaderDrop(column, $event)"
        @drop="dropHeaderColumn(column, $event)"
        @dragend="clearHeaderDrag"
      >
        <template v-if="column.role !== 'spacer'">
          <button
            v-if="isColumnSortable(column)"
            type="button"
            class="library-track-table__sort"
            :class="{
              'library-track-table__sort--active': isSortActive(column.sortKey),
            }"
            :aria-label="sortLabel(column.sortKey, column.label)"
            draggable="false"
            @click="emit('toggleSort', column.sortKey)"
            @dragstart.stop.prevent
          >
            <ChevronDown
              v-if="
                isSortActive(column.sortKey) &&
                column.sortIndicatorPlacement === 'before'
              "
              class="library-track-table__sort-indicator"
              :class="{
                'library-track-table__sort-indicator--desc':
                  sort.direction === 'desc',
              }"
              :size="ICON_SIZE"
              aria-hidden="true"
            />
            <span>{{ column.label }}</span>
            <ChevronDown
              v-if="
                isSortActive(column.sortKey) &&
                column.sortIndicatorPlacement !== 'before'
              "
              class="library-track-table__sort-indicator"
              :class="{
                'library-track-table__sort-indicator--desc':
                  sort.direction === 'desc',
              }"
              :size="ICON_SIZE"
              aria-hidden="true"
            />
          </button>
          <span v-else-if="column.role !== 'actions'">
            {{ column.label }}
          </span>
          <TrackTableColumnChooser
            v-else-if="hasColumnChoices"
            :collection-kind="resolvedCollectionKind"
            :preferences="columnPreferences"
            :hidden-for-width="layout.hiddenForWidth"
            @update-column-preferences="emit('updateColumnPreferences', $event)"
          />

          <button
            v-if="
              column.resizable && !profile.readOnly && !profile.managedActions
            "
            type="button"
            class="library-track-table__resize-handle"
            role="separator"
            aria-orientation="vertical"
            :aria-label="`調整${column.label}欄寬`"
            :aria-valuemin="columnWidthContract(column.role).minWidth"
            :aria-valuenow="columnWidth(column.role)"
            :aria-valuemax="columnResizeBounds(column.role).maxWidth"
            :aria-valuetext="`${columnWidth(column.role)} 像素`"
            :data-resize-column="column.role"
            draggable="false"
            @pointerdown="startColumnResize(column, $event)"
            @keydown="resizeColumnFromKeyboard(column, $event)"
            @dblclick="resetColumnWidth(column, $event)"
            @dragstart.stop.prevent
          ></button>
        </template>
      </span>
    </div>

    <ul
      v-if="initialLoading"
      class="library-track-table__body"
      :class="{ 'library-track-table__body--waiting': !skeletonVisible }"
      aria-hidden="true"
    >
      <li
        v-for="index in 6"
        :key="index"
        class="library-track-table__skeleton-row"
        :style="gridStyle"
        aria-hidden="true"
      >
        <span
          v-for="column in layout.columns"
          :key="column.role"
          :data-track-column="column.role"
          class="library-track-table__skeleton-cell"
        >
          <template v-if="column.role === 'identity'">
            <UiSkeleton
              v-if="profile.showArtwork && density !== 'compact'"
              shape="block"
              class="library-track-table__skeleton-artwork"
            />
            <UiSkeleton
              class="library-track-table__skeleton-copy"
              :class="{
                'library-track-table__skeleton-copy--stacked':
                  density !== 'compact' && profile.showArtist,
              }"
              :lines="density === 'compact' || !profile.showArtist ? 1 : 2"
              pattern="staggered"
            />
          </template>
          <UiSkeleton
            v-else-if="!['spacer', 'actions'].includes(column.role)"
          />
        </span>
      </li>
    </ul>
    <ul
      v-else
      ref="bodyList"
      class="library-track-table__body"
      :class="{ 'ui-loading-content-enter': revealContent }"
      role="list"
      :aria-label="label || profile.accessibleLabel"
      :style="listStyle"
      @animationend.self="finishReveal"
      v-on="listListeners"
    >
      <TrackCollectionRow
        v-for="{ key, item: entry, index, gap } in renderedRows"
        :key="key"
        v-bind="rowAttrs({ key, index, gap })"
        :data-occurrence-id="
          profile.readOnly || profile.managedActions ? entry.key : undefined
        "
        :entry="entry"
        :data-source-slot="entry.sourceRow?.key"
        :profile="profile"
        :columns="layout.columns"
        :grid-style="gridStyle"
        :density="density"
        :album-jumpable="albumJumpableTrackIds.has(entry.track?.id)"
        :vs-queued="vsQueuedTrackIds.has(entry.track?.id)"
        :vs-enqueue-pending="
          Boolean(entry.track && vsEnqueuePendingTrackId === entry.track.id)
        "
        :selected="
          profile.managedActions
            ? selectedEntryKey === entry.key
            : !profile.readOnly &&
              Boolean(entry.track && selectedTrackId === entry.track.id)
        "
        :current="
          !profile.readOnly &&
          Boolean(entry.track && currentTrackId === entry.track.id)
        "
        :playing="
          !profile.readOnly &&
          Boolean(entry.track && playingTrackId === entry.track.id)
        "
        :drag-enabled="dragEnabled"
        :dragging="dragEnabled && draggingTrackId === entry.track?.id"
        :drop-position="
          dropTargetTrackId === entry.track?.id ? dropPosition : ''
        "
        @select-track="emit('selectTrack', $event)"
        @select-entry="emit('selectEntry', $event)"
        @entry-keydown="(entry, event) => emit('entryKeydown', entry, event)"
        @open-entry-menu="(entry, event) => emit('openEntryMenu', entry, event)"
        @activate-track="emit('activateTrack', $event)"
        @toggle-playback="emit('togglePlayback', $event)"
        @navigate-album="emit('navigateAlbum', $event)"
        @queue-separation="emit('queueSeparation', $event)"
        @open-menu="forwardOpenMenu"
        @move-track="forwardMoveTrack"
        @drag-start="forwardTrackDragStart"
        @drag-over="forwardTrackDragOver"
        @drag-leave="forwardTrackDragLeave"
        @drop="forwardTrackDrop"
        @drag-end="emit('trackDragEnd')"
        ><template v-if="$slots['row-status']" #status="{ entry: statusEntry }"
          ><slot name="row-status" :entry="statusEntry" /></template
        ><template
          v-if="$slots['row-actions']"
          #actions="{ entry: actionEntry }"
          ><slot name="row-actions" :entry="actionEntry" /></template
      ></TrackCollectionRow>
    </ul>

    <span
      v-if="isResizing"
      class="library-track-table__resize-guide"
      :style="guideStyle"
      aria-hidden="true"
    ></span>
  </div>
</template>

<style scoped>
.library-track-table {
  position: relative;
  min-width: 0;
  max-width: 100%;
  margin-block-start: var(--ui-space-2);
  container-name: library-track-table;
  container-type: inline-size;
}

.library-track-table__header {
  position: sticky;
  top: var(--ui-folder-sticky-offset, 0);
  z-index: var(--ui-layer-overlay);
  min-width: 0;
  min-height: var(--ui-list-header-height);
  display: grid;
  grid-template-columns: var(--library-track-table-grid);
  align-items: center;
  gap: var(--ui-track-row-gap);
  padding-inline: var(--ui-track-row-padding-inline);
  border-bottom: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule-strong, var(--ui-color-border));
  background: var(--ui-folder-page-background, var(--ui-color-surface));
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.library-track-table__header > [data-track-column] {
  position: relative;
  min-width: 0;
  display: flex;
  align-self: stretch;
  align-items: center;
  justify-self: stretch;
}

.library-track-table__header > [data-column-align='center'] {
  justify-content: center;
}

.library-track-table__header > [data-column-align='end'] {
  justify-content: flex-end;
}

.library-track-table__body {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0;
  background: var(--ui-color-surface);
  list-style: none;
}

.library-track-table__body--waiting {
  visibility: hidden;
}

.library-track-table__skeleton-row {
  min-width: 0;
  min-height: var(--ui-track-row-min-height);
  display: grid;
  grid-template-columns: var(--library-track-table-grid);
  align-items: center;
  gap: var(--ui-track-row-gap);
  padding: var(--ui-track-row-padding-block) var(--ui-track-row-padding-inline);
  border-bottom: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule, var(--ui-color-border));
}

.library-track-table--compact .library-track-table__skeleton-row {
  min-height: var(--ui-track-row-compact-min-height);
}

.library-track-table__skeleton-cell {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-track-row-gap);
}

.library-track-table__skeleton-cell > .ui-skeleton {
  flex: 1;
}

.library-track-table__skeleton-cell > .library-track-table__skeleton-artwork {
  --ui-skeleton-block-min-block-size: var(--ui-track-row-thumb-size);
  flex: 0 0 var(--ui-track-row-thumb-size);
}

.library-track-table__skeleton-copy--stacked {
  min-block-size: calc(
    var(--ui-type-body-compact-size) * var(--ui-type-body-compact-line-height) +
      var(--ui-type-caption-size) * var(--ui-type-caption-line-height)
  );
  align-content: center;
}

.library-track-table__header-column--reorderable {
  cursor: grab;
}

.library-track-table__header-column--reorderable:focus-visible {
  border-radius: var(--ui-radius-sm);
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.library-track-table__header-column--dragging {
  opacity: var(--ui-opacity-dragging);
}

.library-track-table__header-column--drop-before::after,
.library-track-table__header-column--drop-after::after {
  position: absolute;
  z-index: var(--ui-layer-indicator);
  inset-block: var(--ui-space-2);
  inline-size: var(--ui-focus-width);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-accent);
  content: '';
  pointer-events: none;
}

.library-track-table__header-column--drop-before::after {
  inset-inline-start: calc(var(--ui-track-row-gap) / -2);
}

.library-track-table__header-column--drop-after::after {
  inset-inline-end: calc(var(--ui-track-row-gap) / -2);
}

.library-track-table__sort {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: var(--ui-space-1);
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
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

.library-track-table__resize-handle {
  position: absolute;
  z-index: var(--ui-layer-raised);
  inset-block: 0;
  inset-inline-end: calc(
    (var(--ui-resize-handle-hit-size) + var(--ui-track-row-gap)) / -2
  );
  inline-size: var(--ui-resize-handle-hit-size);
  min-inline-size: var(--ui-resize-handle-hit-size);
  padding: 0;
  border: 0;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
}

.library-track-table__resize-handle:focus-visible {
  outline: none;
}

.library-track-table__resize-handle::before {
  position: absolute;
  inset-block: var(--ui-space-2);
  inset-inline-start: 50%;
  inline-size: var(--ui-border-width);
  background: var(--ui-color-border-strong);
  content: '';
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%);
}

.library-track-table:not(.library-track-table--resizing)
  .library-track-table__header:hover
  .library-track-table__resize-handle::before,
.library-track-table:not(.library-track-table--resizing)
  .library-track-table__header:focus-within
  .library-track-table__resize-handle::before {
  opacity: 1;
}

.library-track-table:not(.library-track-table--resizing)
  .library-track-table__resize-handle:focus-visible::before {
  inline-size: var(--ui-focus-width);
  background: var(--ui-color-focus);
}

.library-track-table__resize-guide {
  position: absolute;
  z-index: var(--ui-layer-indicator);
  inset-block: 0;
  left: 0;
  inline-size: var(--ui-focus-width);
  background: var(--ui-color-accent);
  pointer-events: none;
}

[data-column-align='center'] {
  justify-self: center;
  text-align: center;
}

[data-column-align='start'] {
  justify-self: stretch;
  text-align: start;
}

[data-column-align='end'] {
  justify-self: end;
  text-align: end;
}

[data-column-numeric='true'] {
  font-variant-numeric: tabular-nums;
}

.library-track-table__header
  > [data-track-column='duration']
  .library-track-table__sort {
  width: 100%;
  justify-content: flex-end;
}
</style>
