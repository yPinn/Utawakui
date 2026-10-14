<script setup>
import { computed, shallowRef, toRef, watch } from 'vue';
import { ChevronDown, ICON_SIZE } from '../../icons/index.js';
import { useDemoTrackCollectionColumns } from '../../composables/useDemoTrackCollectionColumns.js';
import {
  DEMO_TRACK_COLLECTION_KINDS,
  demoTrackCollectionProfile,
  reorderDemoTrackCollectionColumn,
} from './demoTrackCollectionProfiles.js';
import DemoTrackCollectionColumnChooser from './DemoTrackCollectionColumnChooser.vue';
import DemoTrackCollectionRow from './DemoTrackCollectionRow.vue';

const props = defineProps({
  entries: { type: Array, default: () => [] },
  collectionKind: {
    type: String,
    default: 'library-all',
    validator: (value) => DEMO_TRACK_COLLECTION_KINDS.includes(value),
  },
  columnPreferences: { type: Object, default: () => ({}) },
  sort: {
    type: Object,
    default: () => ({ key: null, direction: 'asc' }),
  },
  sortable: { type: Boolean, default: false },
  reorderEnabled: { type: Boolean, default: false },
  selectedTrackId: { type: String, default: '' },
  currentTrackId: { type: String, default: '' },
  playingTrackId: { type: String, default: '' },
  draggingTrackId: { type: String, default: '' },
  dropTargetTrackId: { type: String, default: '' },
  dropPosition: { type: String, default: '' },
});

const emit = defineEmits([
  'updateColumnPreferences',
  'layoutChange',
  'toggleSort',
  'selectTrack',
  'activateTrack',
  'togglePlayback',
  'navigateAlbum',
  'navigateArtist',
  'openMenu',
  'moveTrack',
  'dragStart',
  'dragOver',
  'dragLeave',
  'drop',
  'dragEnd',
]);

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
} = useDemoTrackCollectionColumns({
  collectionKind: toRef(props, 'collectionKind'),
  preferences: toRef(props, 'columnPreferences'),
  onUpdatePreferences: (preferences) =>
    emit('updateColumnPreferences', preferences),
});

const profile = computed(() =>
  demoTrackCollectionProfile(props.collectionKind),
);
const dragEnabled = computed(
  () =>
    profile.value.dragBehavior === 'reorder' && Boolean(props.reorderEnabled),
);
const draggedHeaderRole = shallowRef('');
const headerDropTargetRole = shallowRef('');
const headerDropPosition = shallowRef('');

watch(
  () => layout.value.hiddenForWidth.join('|'),
  () => emit('layoutChange', [...layout.value.hiddenForWidth]),
  { immediate: true },
);

function forwardOpenMenu(...args) {
  emit('openMenu', ...args);
}

function forwardMoveTrack(...args) {
  emit('moveTrack', ...args);
}

function forwardDragStart(...args) {
  if (!dragEnabled.value) return;
  emit('dragStart', ...args);
}

function forwardDragOver(...args) {
  if (!dragEnabled.value) return;
  emit('dragOver', ...args);
}

function forwardDragLeave(...args) {
  if (!dragEnabled.value) return;
  emit('dragLeave', ...args);
}

function forwardDrop(...args) {
  if (!dragEnabled.value) return;
  emit('drop', ...args);
}

function isSortActive(key) {
  return props.sort.key === key;
}

function sortLabel(key, label) {
  if (!isSortActive(key)) return `${label}排序`;
  return `${label}${props.sort.direction === 'asc' ? '升冪' : '降冪'}排序`;
}

function isHeaderColumnReorderable(column) {
  return profile.value.headerReorder && Boolean(column.textField);
}

function headerColumnLabel(column) {
  return isHeaderColumnReorderable(column)
    ? `${column.label}欄；拖曳，或按 Alt 加左右方向鍵調整順序`
    : ['separation', 'actions'].includes(column.role)
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
  const reordered = reorderDemoTrackCollectionColumn(
    props.collectionKind,
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
    class="demo-track-collection-table"
    :class="{
      'demo-track-collection-table--resizing': isResizing,
    }"
    :data-collection-kind="collectionKind"
  >
    <div
      ref="header"
      class="demo-track-collection-table__header"
      :style="gridStyle"
    >
      <span
        v-for="column in layout.columns"
        :key="column.role"
        :class="{
          'demo-track-collection-table__header-column--reorderable':
            isHeaderColumnReorderable(column),
          'demo-track-collection-table__header-column--dragging':
            draggedHeaderRole === column.role,
          'demo-track-collection-table__header-column--drop-before':
            headerDropTargetRole === column.role &&
            headerDropPosition === 'before',
          'demo-track-collection-table__header-column--drop-after':
            headerDropTargetRole === column.role &&
            headerDropPosition === 'after',
        }"
        :data-track-column="column.role"
        :data-column-align="column.align"
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
            v-if="sortable && column.sortKey"
            type="button"
            class="demo-track-collection-table__sort"
            :class="{
              'demo-track-collection-table__sort--active': isSortActive(
                column.sortKey,
              ),
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
              class="demo-track-collection-table__sort-indicator"
              :class="{
                'demo-track-collection-table__sort-indicator--desc':
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
              class="demo-track-collection-table__sort-indicator"
              :class="{
                'demo-track-collection-table__sort-indicator--desc':
                  sort.direction === 'desc',
              }"
              :size="ICON_SIZE"
              aria-hidden="true"
            />
          </button>
          <span
            v-else-if="column.role === 'separation'"
            class="ui-visually-hidden"
          >
            {{ column.label }}
          </span>
          <span v-else-if="column.role !== 'actions'">
            {{ column.label }}
          </span>
          <DemoTrackCollectionColumnChooser
            v-else
            :collection-kind="collectionKind"
            :preferences="columnPreferences"
            :hidden-for-width="layout.hiddenForWidth"
            @update-column-preferences="emit('updateColumnPreferences', $event)"
          />

          <button
            v-if="column.resizable"
            type="button"
            class="demo-track-collection-table__resize-handle"
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
      class="demo-track-collection-table__body"
      role="list"
      :aria-label="profile.accessibleLabel"
    >
      <DemoTrackCollectionRow
        v-for="entry in entries"
        :key="entry.track.id"
        :entry="entry"
        :profile="profile"
        :columns="layout.columns"
        :grid-style="gridStyle"
        :selected="selectedTrackId === entry.track.id"
        :current="currentTrackId === entry.track.id"
        :playing="playingTrackId === entry.track.id"
        :drag-enabled="dragEnabled"
        :dragging="dragEnabled && draggingTrackId === entry.track.id"
        :drop-position="
          dropTargetTrackId === entry.track.id ? dropPosition : ''
        "
        @select-track="emit('selectTrack', $event)"
        @activate-track="emit('activateTrack', $event)"
        @toggle-playback="emit('togglePlayback', $event)"
        @navigate-album="emit('navigateAlbum', $event)"
        @navigate-artist="emit('navigateArtist', $event)"
        @open-menu="forwardOpenMenu"
        @move-track="forwardMoveTrack"
        @drag-start="forwardDragStart"
        @drag-over="forwardDragOver"
        @drag-leave="forwardDragLeave"
        @drop="forwardDrop"
        @drag-end="emit('dragEnd')"
      />
    </ul>

    <span
      v-if="isResizing"
      class="demo-track-collection-table__resize-guide"
      :style="guideStyle"
      aria-hidden="true"
    ></span>
  </div>
</template>

<style scoped>
.demo-track-collection-table {
  position: relative;
  min-width: 0;
  max-width: 100%;
}

.demo-track-collection-table__header {
  position: sticky;
  top: 0;
  z-index: var(--ui-layer-overlay);
  min-width: 0;
  min-height: var(--ui-list-header-height);
  display: grid;
  grid-template-columns: var(--demo-track-collection-grid);
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

.demo-track-collection-table__header > [data-track-column] {
  position: relative;
  min-width: 0;
  display: flex;
  align-self: stretch;
  align-items: center;
  justify-self: stretch;
}

.demo-track-collection-table__header > [data-column-align='center'] {
  justify-content: center;
}

.demo-track-collection-table__header > [data-column-align='end'] {
  justify-content: flex-end;
}

.demo-track-collection-table__body {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0;
  background: var(--ui-color-surface);
  list-style: none;
}

.demo-track-collection-table__header-column--reorderable {
  cursor: grab;
}

.demo-track-collection-table__header-column--reorderable:focus-visible {
  border-radius: var(--ui-radius-sm);
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.demo-track-collection-table__header-column--dragging {
  opacity: var(--ui-opacity-dragging);
}

.demo-track-collection-table__header-column--drop-before::after,
.demo-track-collection-table__header-column--drop-after::after {
  position: absolute;
  z-index: var(--ui-layer-indicator);
  inset-block: var(--ui-space-2);
  inline-size: var(--ui-focus-width);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-accent);
  content: '';
  pointer-events: none;
}

.demo-track-collection-table__header-column--drop-before::after {
  inset-inline-start: calc(var(--ui-track-row-gap) / -2);
}

.demo-track-collection-table__header-column--drop-after::after {
  inset-inline-end: calc(var(--ui-track-row-gap) / -2);
}

.demo-track-collection-table__sort {
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

.demo-track-collection-table__sort:hover,
.demo-track-collection-table__sort--active {
  color: var(--ui-color-text);
}

.demo-track-collection-table__sort:focus-visible {
  border-radius: var(--ui-radius-sm);
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-track-collection-table__sort-indicator {
  flex: 0 0 auto;
  color: var(--ui-color-accent);
  transition: transform var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.demo-track-collection-table__sort-indicator--desc {
  transform: rotate(180deg);
}

.demo-track-collection-table__resize-handle {
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

.demo-track-collection-table__resize-handle:focus-visible {
  outline: none;
}

.demo-track-collection-table__resize-handle::before {
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

.demo-track-collection-table:not(.demo-track-collection-table--resizing)
  .demo-track-collection-table__header:hover
  .demo-track-collection-table__resize-handle::before,
.demo-track-collection-table:not(.demo-track-collection-table--resizing)
  .demo-track-collection-table__header:focus-within
  .demo-track-collection-table__resize-handle::before {
  opacity: 1;
}

.demo-track-collection-table:not(.demo-track-collection-table--resizing)
  .demo-track-collection-table__resize-handle:focus-visible::before {
  inline-size: var(--ui-focus-width);
  background: var(--ui-color-focus);
}

.demo-track-collection-table__resize-guide {
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

[data-track-column='ordinal'],
[data-track-column='usage'],
[data-track-column='releaseYear'],
[data-track-column='duration'] {
  font-variant-numeric: tabular-nums;
}

.demo-track-collection-table__header
  > [data-track-column='duration']
  .demo-track-collection-table__sort {
  width: 100%;
  justify-content: flex-end;
}
</style>
