<script setup>
import { computed, shallowRef } from 'vue';
import { useDragReorder } from '../../composables/useDragReorder.js';
import {
  BadgeCheck,
  Check,
  CircleDashed,
  CircleX,
  ListMinus,
  Pause,
  Play,
  RotateCcw,
  Square,
} from '../../icons/index.js';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import UiButton from '../ui/UiButton.vue';
import UiContextMenu from '../ui/UiContextMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiProgress from '../ui/UiProgress.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import TrackIdentityRow from '../track/TrackIdentityRow.vue';
import { separationItemLabel } from './separationQueuePresentation.js';
import { pendingReorderOffset } from './separationToolbarQueue.js';

const props = defineProps({
  activeItems: { type: Array, default: () => [] },
  pendingItems: { type: Array, default: () => [] },
  attentionItems: { type: Array, default: () => [] },
  completedItems: { type: Array, default: () => [] },
  trackFor: { type: Function, required: true },
  paused: { type: Boolean, default: false },
  pausing: { type: Boolean, default: false },
});

const emit = defineEmits([
  'move',
  'remove',
  'retry',
  'pause',
  'resume',
  'cancelActive',
  'clearPending',
  'clearCompleted',
  'navigate',
]);
const itemMenu = shallowRef(null);
const completedItemsNewestFirst = computed(() =>
  [...props.completedItems].reverse(),
);
const ITEM_STATUS_PRESENTATION = Object.freeze({
  failed: Object.freeze({ icon: CircleX, tone: 'danger' }),
  cancelled: Object.freeze({ icon: Square, tone: 'muted' }),
  completed: Object.freeze({ icon: Check, tone: 'success' }),
  skipped: Object.freeze({ icon: BadgeCheck, tone: 'muted' }),
});
const UNKNOWN_STATUS_PRESENTATION = Object.freeze({
  icon: CircleDashed,
  tone: 'muted',
});
const menuItems = computed(() => {
  const item = itemMenu.value?.item;
  if (!item) return [];

  if (['checking', 'running'].includes(item.status)) {
    return [{ value: 'cancel', label: '停止這首', icon: Square }];
  }

  if (item.status === 'pending') {
    return [{ value: 'remove', label: '移除', icon: ListMinus }];
  }

  return [
    { value: 'retry', label: '重試', icon: RotateCcw },
    { separator: true },
    { value: 'remove', label: '移除', icon: ListMinus },
  ];
});

function itemMenuOpen(item) {
  return itemMenu.value?.item?.itemId === item.itemId;
}

function statusPresentationFor(item) {
  return ITEM_STATUS_PRESENTATION[item.status] ?? UNKNOWN_STATUS_PRESENTATION;
}

function openItemMenu(item, event) {
  event.preventDefault?.();
  event.stopPropagation?.();
  itemMenu.value = {
    item,
    anchorEl: null,
    x: event.clientX ?? 0,
    y: event.clientY ?? 0,
  };
}

function openItemMenuFromKeyboard(item, event) {
  const isContextMenuKey = event.key === 'ContextMenu';
  const isShiftF10 = event.shiftKey && event.key === 'F10';
  if (!isContextMenuKey && !isShiftF10) return;

  event.preventDefault();
  event.stopPropagation();
  itemMenu.value = {
    item,
    anchorEl: event.currentTarget,
    x: 0,
    y: 0,
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

const DRAG_EXCLUDED_ACTIONS = '.ui-icon-btn, .ui-text-btn';
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
    <AppRightDockSection v-if="activeItems.length > 0" heading="處理中">
      <template #trailing>
        <UiIconButton
          v-if="pendingItems.length > 0"
          :icon="Pause"
          :label="pausing ? '等待暫停' : '完成這首後暫停'"
          :disabled="pausing"
          @click="emit('pause')"
        />
      </template>
      <div class="separation-toolbar-list__active-status">
        <UiProgress
          v-for="item in activeItems"
          :key="`${item.itemId}-progress`"
          class="separation-toolbar-list__progress"
          label="進度"
          :value="item.percent ?? 0"
          :value-text="separationItemLabel(item)"
          :indeterminate="!Number.isFinite(item.percent)"
        />
      </div>
      <ul class="separation-toolbar-list__items">
        <TrackIdentityRow
          v-for="item in activeItems"
          :key="item.itemId"
          class="separation-toolbar-list__item right-dock-track"
          :track="trackFor(item)"
          navigation="artist"
          state-surface
          :state-surface-active="itemMenuOpen(item)"
          hide-duration
          overflow="ellipsis"
          tabindex="0"
          aria-haspopup="menu"
          :aria-expanded="itemMenuOpen(item) ? 'true' : 'false'"
          @contextmenu.prevent.stop="openItemMenu(item, $event)"
          @keydown="openItemMenuFromKeyboard(item, $event)"
          @navigate="emit('navigate', $event)"
        />
      </ul>
    </AppRightDockSection>

    <AppRightDockSection v-if="pendingItems.length > 0" heading="接下來">
      <template #trailing>
        <div class="separation-toolbar-list__section-actions">
          <UiIconButton
            v-if="paused"
            :icon="Play"
            label="繼續處理"
            variant="accent"
            @click="emit('resume')"
          />
          <UiIconButton
            :icon="ListMinus"
            label="清除待處理"
            @click="emit('clearPending')"
          />
        </div>
      </template>
      <ul class="separation-toolbar-list__items">
        <TrackIdentityRow
          v-for="item in pendingItems"
          :key="item.itemId"
          class="separation-toolbar-list__item right-dock-track"
          :class="{
            'separation-toolbar-list__item--draggable': pendingItems.length > 1,
            'separation-toolbar-list__item--dragging':
              draggingPendingId === item.itemId,
          }"
          :track="trackFor(item)"
          navigation="artist"
          state-surface
          :state-surface-active="itemMenuOpen(item)"
          hide-duration
          overflow="ellipsis"
          thumb-loading="lazy"
          :draggable="pendingItems.length > 1"
          tabindex="0"
          aria-haspopup="menu"
          :aria-expanded="itemMenuOpen(item) ? 'true' : 'false'"
          @contextmenu.prevent.stop="openItemMenu(item, $event)"
          @keydown="openItemMenuFromKeyboard(item, $event)"
          @pointerdown="handlePendingPointerDown"
          @pointerup="resetPendingDragOrigin"
          @pointercancel="resetPendingDragOrigin"
          @dragstart="handlePendingDragStart(item, $event)"
          @dragover="updatePendingDropTarget(dragItem(item), $event)"
          @dragleave="leavePendingDropTarget(dragItem(item), $event)"
          @drop="dropPendingItem(dragItem(item), $event)"
          @dragend="handlePendingDragEnd"
          @navigate="emit('navigate', $event)"
        >
          <template #overlay>
            <UiSeparator
              v-if="pendingDropTargetId === item.itemId"
              tone="accent"
              class="separation-toolbar-list__drop-indicator"
              :class="`separation-toolbar-list__drop-indicator--${pendingDropPosition}`"
            />
          </template>
        </TrackIdentityRow>
      </ul>
    </AppRightDockSection>

    <AppRightDockSection v-if="attentionItems.length > 0" heading="未完成">
      <ul class="separation-toolbar-list__items">
        <TrackIdentityRow
          v-for="item in attentionItems"
          :key="item.itemId"
          class="separation-toolbar-list__item right-dock-track"
          :track="trackFor(item)"
          navigation="artist"
          state-surface
          :state-surface-active="itemMenuOpen(item)"
          hide-duration
          overflow="ellipsis"
          thumb-loading="lazy"
          tabindex="0"
          aria-haspopup="menu"
          :aria-expanded="itemMenuOpen(item) ? 'true' : 'false'"
          @contextmenu.prevent.stop="openItemMenu(item, $event)"
          @keydown="openItemMenuFromKeyboard(item, $event)"
          @navigate="emit('navigate', $event)"
        >
          <template #trail>
            <UiStatusIcon
              :icon="statusPresentationFor(item).icon"
              :tone="statusPresentationFor(item).tone"
              :label="separationItemLabel(item)"
            />
          </template>
        </TrackIdentityRow>
      </ul>
    </AppRightDockSection>

    <AppRightDockSection
      v-if="completedItemsNewestFirst.length > 0"
      heading="已完成"
    >
      <template #trailing>
        <UiButton @click="emit('clearCompleted')">清除紀錄</UiButton>
      </template>
      <ul class="separation-toolbar-list__items">
        <TrackIdentityRow
          v-for="item in completedItemsNewestFirst"
          :key="item.itemId"
          class="right-dock-track"
          :track="trackFor(item)"
          navigation="artist"
          hide-duration
          overflow="ellipsis"
          thumb-loading="lazy"
          @navigate="emit('navigate', $event)"
        >
          <template #trail>
            <UiStatusIcon
              :icon="statusPresentationFor(item).icon"
              :tone="statusPresentationFor(item).tone"
              :label="separationItemLabel(item)"
            />
          </template>
        </TrackIdentityRow>
      </ul>
    </AppRightDockSection>

    <UiContextMenu
      :open="Boolean(itemMenu)"
      :anchor-el="itemMenu?.anchorEl ?? null"
      :x="itemMenu?.x ?? 0"
      :y="itemMenu?.y ?? 0"
      :width="176"
      aria-label="伴奏處理操作"
      :items="menuItems"
      @select="handleMenuSelect"
      @close="closeItemMenu"
    />
  </div>
</template>

<style scoped>
.separation-toolbar-list {
  display: grid;
  gap: var(--ui-right-dock-section-gap);
}

.separation-toolbar-list__items {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.separation-toolbar-list__section-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
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

.separation-toolbar-list__active-status {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0 var(--ui-space-2) var(--ui-space-2);
}

.separation-toolbar-list__drop-indicator {
  position: absolute;
  inset-inline: 0;
  z-index: var(--ui-layer-overlay);
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
