<script setup>
import { computed, shallowRef, watch } from 'vue';

import { useDragReorder } from '../../composables/useDragReorder.js';
import QueueTrackButton from '../queue/QueueTrackButton.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiHint from '../ui/UiHint.vue';
import { t } from '../../utils/i18n.js';
import {
  performanceSessionItemMenu,
  moveFocusedSessionRow,
} from './performanceSessionItemActions.js';

const props = defineProps({
  items: { type: Array, default: () => [] },
  tracks: { type: Array, default: () => [] },
  moveItem: { type: Function, default: undefined },
  saving: { type: Boolean, default: false },
});
const emit = defineEmits(['reorder', 'skip', 'duplicate', 'remove']);
const selectedItemId = shallowRef(null);
const menuItemId = shallowRef(null);
const menuAnchor = shallowRef(null);
const rows = computed(() => {
  const tracks = new Map(props.tracks.map((track) => [track.id, track]));
  return props.items.map((item) => {
    const canonical = tracks.get(item.trackId);
    const disabled = !item.ready || (item.mode !== 'manual' && !canonical?.url);
    return {
      id: item.itemId,
      item,
      track: {
        ...canonical,
        id: item.trackId ?? item.itemId,
        title: item.displayTitle,
        artist: item.displayArtist,
      },
      artist: [
        item.displayArtist,
        disabled
          ? item.status === 'needs-link'
            ? t('session.queueList.needsLink')
            : t('session.queueList.audioUnavailable')
          : item.mode === 'manual'
            ? t('session.queueList.manualItem')
            : '',
      ]
        .filter(Boolean)
        .join(' · '),
      disabled,
      playbackLabel: t(
        item.mode === 'manual'
          ? 'session.queueList.startNamed'
          : 'session.queueList.playNamed',
        { title: item.displayTitle },
      ),
    };
  });
});
const {
  draggingId,
  dropTargetId,
  dropPosition,
  startDrag,
  updateDropTarget,
  leaveDropTarget,
  drop,
  clearDragState,
} = useDragReorder({
  canDrag: () => !props.saving && rows.value.length > 1,
  onReorder: (itemId, targetItemId, position) => {
    if (
      !props.saving &&
      itemId !== targetItemId &&
      rows.value.some((row) => row.id === itemId) &&
      rows.value.some((row) => row.id === targetItemId)
    )
      emit('reorder', itemId, targetItemId, position);
  },
});
const menuIndex = computed(() =>
  props.items.findIndex((item) => item.itemId === menuItemId.value),
);
const menuContent = computed(() =>
  performanceSessionItemMenu({ disabled: props.saving || menuIndex.value < 0 }),
);
function closeMenu() {
  menuItemId.value = null;
  menuAnchor.value = null;
}
function openMenu(row, { event }) {
  if (props.saving) return;
  event.preventDefault?.();
  event.stopPropagation?.();
  menuItemId.value = row.id;
  menuAnchor.value =
    event.type === 'contextmenu'
      ? { kind: 'point', x: event.clientX ?? 0, y: event.clientY ?? 0 }
      : { kind: 'element', element: event.currentTarget };
}
function selectAction(action) {
  const id = menuItemId.value;
  const index = menuIndex.value;
  closeMenu();
  if (!id || index < 0 || props.saving) return;
  if (['skip', 'duplicate', 'remove'].includes(action)) emit(action, id);
}
function handleRowKeydown(event, row, index) {
  if (!props.saving)
    return moveFocusedSessionRow(
      event,
      props.moveItem,
      row.id,
      index,
      rows.value.length,
    );
}
watch([() => props.saving, () => props.items], ([saving, items]) => {
  if (saving || !items.some((item) => item.itemId === menuItemId.value))
    closeMenu();
  if (saving || !items.some((item) => item.itemId === draggingId.value))
    clearDragState();
});
</script>

<template>
  <UiScrollLayout
    class="performance-session-queue-scroll"
    content-tag="ul"
    content-class="performance-session-queue-list"
    :aria-label="t('session.planList.order')"
  >
    <QueueTrackButton
      v-for="(row, index) in rows"
      :key="row.id"
      :data-arrangement-item-id="row.id"
      class="performance-session-queue-list__item"
      :class="{
        'performance-session-queue-list__item--draggable':
          !saving && rows.length > 1,
        'performance-session-queue-list__item--dragging': draggingId === row.id,
      }"
      :track="row.track"
      :artist-text="row.artist"
      :active="selectedItemId === row.id"
      :playback-disabled="saving || row.disabled"
      :playback-actions="false"
      :playback-label="row.playbackLabel"
      :menu-open="menuItemId === row.id"
      :draggable="!saving && rows.length > 1"
      :reorder-hint="
        !saving && rows.length > 1 ? t('session.reorderHint') : undefined
      "
      :drop-position="dropTargetId === row.id ? dropPosition : null"
      @action-keydown="handleRowKeydown($event, row, index)"
      @select="selectedItemId = row.id"
      @open-menu="openMenu(row, $event)"
      @drag-start="startDrag(row, $event)"
      @drag-over="updateDropTarget(row, $event)"
      @drag-leave="leaveDropTarget(row, $event)"
      @drop="drop(row, $event)"
      @drag-end="clearDragState"
    />
    <li v-if="!rows.length">
      <UiHint>{{ t('session.queueList.empty') }}</UiHint>
    </li>
  </UiScrollLayout>
  <UiActionMenu
    :open="menuIndex >= 0"
    :anchor="menuAnchor"
    :content="menuContent"
    :aria-label="t('session.queueList.actions')"
    @select="selectAction"
    @close="closeMenu"
  />
</template>

<style scoped>
.performance-session-queue-scroll {
  --ui-scroll-layout-padding-block-start: var(--ui-focus-safe-inset);
  --ui-scroll-layout-padding-block-end: var(--ui-focus-safe-inset);
  --ui-scroll-layout-padding-inline-start: var(--ui-focus-safe-inset);
  --ui-scroll-layout-padding-inline-end: var(--ui-focus-safe-inset);
  flex: 1;
  min-block-size: 0;
}
.performance-session-queue-scroll :deep(.performance-session-queue-list) {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  margin: 0;
  list-style: none;
}
.performance-session-queue-list__item {
  position: relative;
  inline-size: 100%;
  min-inline-size: 0;
  max-inline-size: 100%;
  box-sizing: border-box;
}
.performance-session-queue-list__item--draggable {
  cursor: grab;
  user-select: none;
}
.performance-session-queue-list__item--dragging {
  cursor: grabbing;
  opacity: var(--ui-opacity-dragging);
}
</style>
