<script setup>
import { computed, shallowRef } from 'vue';
import { useDragReorder } from '../../composables/useDragReorder.js';
import { Ellipsis, RotateCcw, Square, Trash2 } from '../../icons/index.js';
import UiContextMenu from '../ui/UiContextMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiProgress from '../ui/UiProgress.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import { separationItemLabel } from './separationQueuePresentation.js';
import { pendingReorderOffset } from './separationToolbarQueue.js';

const props = defineProps({
  activeItems: { type: Array, default: () => [] },
  pendingItems: { type: Array, default: () => [] },
  attentionItems: { type: Array, default: () => [] },
  completedItems: { type: Array, default: () => [] },
  trackFor: { type: Function, required: true },
});

const emit = defineEmits([
  'move',
  'remove',
  'retry',
  'cancelActive',
  'clearCompleted',
]);
const itemMenu = shallowRef(null);
const completedItemsNewestFirst = computed(() =>
  [...props.completedItems].reverse(),
);
const menuItems = computed(() => {
  const item = itemMenu.value?.item;
  if (!item) return [];

  if (['checking', 'running'].includes(item.status)) {
    return [{ value: 'cancel', label: '停止這首', icon: Square, danger: true }];
  }

  if (item.status === 'pending') {
    return [{ value: 'remove', label: '移除', icon: Trash2, danger: true }];
  }

  return [
    { value: 'retry', label: '重試', icon: RotateCcw },
    { separator: true },
    { value: 'remove', label: '移除', icon: Trash2, danger: true },
  ];
});

function itemMenuOpen(item) {
  return itemMenu.value?.item?.itemId === item.itemId;
}

function openItemMenu(item, event) {
  event.preventDefault?.();
  event.stopPropagation?.();
  const fromButton = event.type === 'click';
  const rect = fromButton
    ? event.currentTarget?.getBoundingClientRect?.()
    : null;
  itemMenu.value = {
    item,
    x: rect?.right ?? event.clientX ?? 0,
    y: rect ? rect.bottom + 4 : (event.clientY ?? 0),
    alignX: rect ? 'right' : 'left',
  };
}

function closeItemMenu() {
  itemMenu.value = null;
}

function handleMenuSelect(action) {
  const item = itemMenu.value?.item;
  closeItemMenu();
  if (!item) return;

  if (action === 'remove') emit('remove', item.itemId);
  else if (action === 'retry') emit('retry', item.itemId);
  else if (action === 'cancel') emit('cancelActive');
}

function reorderPending(itemId, targetId, position) {
  const offset = pendingReorderOffset(
    props.pendingItems,
    itemId,
    targetId,
    position,
  );
  if (offset !== 0) emit('move', itemId, offset);
}

const {
  draggingId: draggingPendingId,
  dropTargetId: pendingDropTargetId,
  dropPosition: pendingDropPosition,
  startDrag: startPendingDrag,
  updateDropTarget: updatePendingDropTarget,
  leaveDropTarget: leavePendingDropTarget,
  drop: dropPendingItem,
  clearDragState: clearPendingDragState,
} = useDragReorder({
  onReorder: reorderPending,
  canDrag: () => props.pendingItems.length >= 2,
});

const DRAG_EXCLUDED_ACTIONS = '.ui-icon-btn';
let dragStartedFromAction = false;

function isExcludedDragTarget(target) {
  return Boolean(target?.closest?.(DRAG_EXCLUDED_ACTIONS));
}

function handlePendingPointerDown(event) {
  dragStartedFromAction = isExcludedDragTarget(event.target);
}

function resetPendingDragOrigin() {
  dragStartedFromAction = false;
}

function handlePendingDragStart(item, event) {
  if (dragStartedFromAction || isExcludedDragTarget(event.target)) {
    event.preventDefault();
    resetPendingDragOrigin();
    return;
  }
  closeItemMenu();
  startPendingDrag({ id: item.itemId }, event);
}

function handlePendingDragEnd() {
  resetPendingDragOrigin();
  clearPendingDragState();
}

function dragItem(item) {
  return { id: item.itemId };
}
</script>

<template>
  <div class="separation-toolbar-list">
    <section v-if="activeItems.length > 0" aria-labelledby="quick-active">
      <h3 id="quick-active" class="separation-toolbar-list__heading">處理中</h3>
      <ul class="separation-toolbar-list__items">
        <UiTrackRow
          v-for="item in activeItems"
          :key="item.itemId"
          class="separation-toolbar-list__item"
          :track="trackFor(item)"
          hide-duration
          overflow="ellipsis"
          @contextmenu.prevent.stop="openItemMenu(item, $event)"
        >
          <template #trail>
            <span class="separation-toolbar-list__trail">
              <UiIconButton
                class="separation-toolbar-list__menu"
                :icon="Ellipsis"
                :label="`${trackFor(item).title}的更多選項`"
                :title="trackFor(item).title"
                tooltip-suffix="的更多選項"
                aria-haspopup="menu"
                :aria-expanded="itemMenuOpen(item) ? 'true' : 'false'"
                @click.stop="openItemMenu(item, $event)"
              />
            </span>
          </template>
        </UiTrackRow>
      </ul>
      <UiProgress
        v-for="item in activeItems"
        :key="`${item.itemId}-progress`"
        class="separation-toolbar-list__progress"
        label="進度"
        :value="item.percent ?? 0"
        :value-text="separationItemLabel(item)"
        :indeterminate="!Number.isFinite(item.percent)"
      />
    </section>

    <section v-if="pendingItems.length > 0" aria-labelledby="quick-pending">
      <h3 id="quick-pending" class="separation-toolbar-list__heading">
        接下來
      </h3>
      <ul class="separation-toolbar-list__items">
        <UiTrackRow
          v-for="(item, index) in pendingItems"
          :key="item.itemId"
          class="separation-toolbar-list__item"
          :class="{
            'separation-toolbar-list__item--draggable': pendingItems.length > 1,
            'separation-toolbar-list__item--dragging':
              draggingPendingId === item.itemId,
          }"
          :track="trackFor(item)"
          hide-duration
          overflow="ellipsis"
          thumb-loading="lazy"
          :draggable="pendingItems.length > 1"
          @contextmenu.prevent.stop="openItemMenu(item, $event)"
          @pointerdown="handlePendingPointerDown"
          @pointerup="resetPendingDragOrigin"
          @pointercancel="resetPendingDragOrigin"
          @dragstart="handlePendingDragStart(item, $event)"
          @dragover="updatePendingDropTarget(dragItem(item), $event)"
          @dragleave="leavePendingDropTarget(dragItem(item), $event)"
          @drop="dropPendingItem(dragItem(item), $event)"
          @dragend="handlePendingDragEnd"
        >
          <template #lead>
            <span class="separation-toolbar-list__order" aria-hidden="true">
              {{ index + 1 }}
            </span>
          </template>
          <template #trail>
            <span class="separation-toolbar-list__trail">
              <span class="separation-toolbar-list__state">
                {{ separationItemLabel(item) }}
              </span>
              <UiIconButton
                class="separation-toolbar-list__menu"
                :icon="Ellipsis"
                :label="`${trackFor(item).title}的更多選項`"
                :title="trackFor(item).title"
                tooltip-suffix="的更多選項"
                aria-haspopup="menu"
                :aria-expanded="itemMenuOpen(item) ? 'true' : 'false'"
                @click.stop="openItemMenu(item, $event)"
                @dblclick.stop
              />
            </span>
          </template>
          <template #overlay>
            <UiSeparator
              v-if="pendingDropTargetId === item.itemId"
              tone="accent"
              class="separation-toolbar-list__drop-indicator"
              :class="`separation-toolbar-list__drop-indicator--${pendingDropPosition}`"
            />
          </template>
        </UiTrackRow>
      </ul>
    </section>

    <section v-if="attentionItems.length > 0" aria-labelledby="quick-attention">
      <h3 id="quick-attention" class="separation-toolbar-list__heading">
        未完成
      </h3>
      <ul class="separation-toolbar-list__items">
        <UiTrackRow
          v-for="item in attentionItems"
          :key="item.itemId"
          class="separation-toolbar-list__item"
          :track="trackFor(item)"
          hide-duration
          overflow="ellipsis"
          thumb-loading="lazy"
          @contextmenu.prevent.stop="openItemMenu(item, $event)"
        >
          <template #trail>
            <span class="separation-toolbar-list__trail">
              <span class="separation-toolbar-list__state">
                {{ separationItemLabel(item) }}
              </span>
              <UiIconButton
                class="separation-toolbar-list__menu"
                :icon="Ellipsis"
                :label="`${trackFor(item).title}的更多選項`"
                :title="trackFor(item).title"
                tooltip-suffix="的更多選項"
                aria-haspopup="menu"
                :aria-expanded="itemMenuOpen(item) ? 'true' : 'false'"
                @click.stop="openItemMenu(item, $event)"
              />
            </span>
          </template>
        </UiTrackRow>
      </ul>
    </section>

    <section
      v-if="completedItemsNewestFirst.length > 0"
      aria-labelledby="quick-completed"
    >
      <div class="separation-toolbar-list__section-heading">
        <h3 id="quick-completed" class="separation-toolbar-list__heading">
          已完成
        </h3>
        <UiIconButton
          :icon="Trash2"
          label="清除完成紀錄"
          @click="emit('clearCompleted')"
        />
      </div>
      <ul class="separation-toolbar-list__items">
        <UiTrackRow
          v-for="item in completedItemsNewestFirst"
          :key="item.itemId"
          :track="trackFor(item)"
          hide-duration
          overflow="ellipsis"
          thumb-loading="lazy"
        >
          <template #trail>
            <span class="separation-toolbar-list__state">
              {{ separationItemLabel(item) }}
            </span>
          </template>
        </UiTrackRow>
      </ul>
    </section>

    <UiContextMenu
      :open="Boolean(itemMenu)"
      :x="itemMenu?.x ?? 0"
      :y="itemMenu?.y ?? 0"
      :width="176"
      :align-x="itemMenu?.alignX ?? 'left'"
      aria-label="伴奏處理操作"
      :items="menuItems"
      @select="handleMenuSelect"
      @close="closeItemMenu"
    />
  </div>
</template>

<style scoped>
.separation-toolbar-list {
  --ui-track-row-min-height: 2.5rem;
  --ui-track-row-thumb-size: 2rem;
  --ui-track-row-padding-inline: var(--ui-space-1);

  display: grid;
  gap: var(--ui-space-3);
}

.separation-toolbar-list__heading {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.separation-toolbar-list__section-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  margin-bottom: var(--ui-space-2);
}

.separation-toolbar-list > section > .separation-toolbar-list__heading {
  margin-bottom: var(--ui-space-2);
}

.separation-toolbar-list__items {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.separation-toolbar-list__item {
  position: relative;
  inline-size: 100%;
  min-inline-size: 0;
  max-inline-size: 100%;
  box-sizing: border-box;
}

.separation-toolbar-list__item--draggable {
  cursor: grab;
  -webkit-user-select: none;
  user-select: none;
}

.separation-toolbar-list__item--dragging {
  cursor: grabbing;
  opacity: var(--ui-opacity-dragging);
}

.separation-toolbar-list__progress {
  margin: var(--ui-space-1) var(--ui-space-2) 0;
}

.separation-toolbar-list__order {
  min-width: var(--ui-space-5);
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.separation-toolbar-list__state {
  flex: 0 0 auto;
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.separation-toolbar-list__trail {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
}

.separation-toolbar-list__menu {
  flex: 0 0 auto;
}

.separation-toolbar-list__drop-indicator {
  position: absolute;
  inset-inline: 0;
  z-index: 2;
  pointer-events: none;
}

.separation-toolbar-list__drop-indicator--before {
  inset-block-start: calc(-0.5 * var(--ui-space-1));
  transform: translateY(-50%);
}

.separation-toolbar-list__drop-indicator--after {
  inset-block-end: calc(-0.5 * var(--ui-space-1));
  transform: translateY(50%);
}
</style>
