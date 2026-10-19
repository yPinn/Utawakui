<script setup>
import { computed, shallowRef, watch } from 'vue';
import {
  ChevronUp,
  ChevronDown,
  Copy,
  SkipForward,
  Trash2,
} from '../../icons/index.js';
import { useDragReorder } from '../../composables/useDragReorder.js';
import QueueTrackButton from '../queue/QueueTrackButton.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiHint from '../ui/UiHint.vue';

const props = defineProps({
  items: { type: Array, default: () => [] },
  tracks: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
});
const emit = defineEmits([
  'play',
  'move',
  'reorder',
  'skip',
  'duplicate',
  'remove',
]);
const selectedItemId = shallowRef(null);
const menuItemId = shallowRef(null);
const menuAnchor = shallowRef(null);
const rows = computed(() => {
  const tracks = new Map(props.tracks.map((track) => [track.id, track]));
  return props.items.map((item, index) => {
    const canonical = tracks.get(item.trackId);
    const disabled = !item.ready || (item.mode !== 'manual' && !canonical?.url);
    return {
      id: item.itemId,
      ordinal: index + 1,
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
            ? '需連結曲目'
            : '音檔無法使用'
          : item.mode === 'manual'
            ? '手動項目'
            : '',
      ]
        .filter(Boolean)
        .join(' · '),
      disabled,
      playbackLabel: `${item.mode === 'manual' ? '開始' : '播放'}：${item.displayTitle}`,
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
const menuContent = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'order',
      items: [
        {
          id: 'up',
          kind: 'action',
          label: '上移一位',
          value: 'up',
          icon: ChevronUp,
          disabled: props.saving || menuIndex.value <= 0,
        },
        {
          id: 'down',
          kind: 'action',
          label: '下移一位',
          value: 'down',
          icon: ChevronDown,
          disabled:
            props.saving ||
            menuIndex.value < 0 ||
            menuIndex.value >= props.items.length - 1,
        },
      ],
    },
    {
      id: 'manage',
      items: [
        {
          id: 'skip',
          kind: 'action',
          label: '略過這首',
          value: 'skip',
          icon: SkipForward,
          disabled: props.saving,
        },
        {
          id: 'duplicate',
          kind: 'action',
          label: '複製待播項目',
          value: 'duplicate',
          icon: Copy,
          disabled: props.saving,
        },
        {
          id: 'remove',
          kind: 'action',
          label: '從待播移除',
          value: 'remove',
          icon: Trash2,
          intent: 'danger',
          disabled: props.saving,
        },
      ],
    },
  ],
}));
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
function play(row) {
  if (!props.saving && !row.disabled) emit('play', row.id);
}
function selectAction(action) {
  const id = menuItemId.value;
  const index = menuIndex.value;
  closeMenu();
  if (!id || index < 0 || props.saving) return;
  if (action === 'up' && index > 0) emit('move', id, -1);
  if (action === 'down' && index < props.items.length - 1) emit('move', id, 1);
  if (['skip', 'duplicate', 'remove'].includes(action)) emit(action, id);
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
    aria-label="待播順序"
  >
    <QueueTrackButton
      v-for="row in rows"
      :key="row.id"
      :data-arrangement-item-id="row.id"
      class="performance-session-queue-list__item"
      :class="{
        'performance-session-queue-list__item--draggable':
          !saving && rows.length > 1,
        'performance-session-queue-list__item--dragging': draggingId === row.id,
      }"
      :track="row.track"
      :ordinal="row.ordinal"
      :ordinal-label="`待播第 ${row.ordinal} 首`"
      :artist-text="row.artist"
      :active="selectedItemId === row.id"
      :playback-disabled="saving || row.disabled"
      :playback-label="row.playbackLabel"
      :menu-open="menuItemId === row.id"
      :draggable="!saving && rows.length > 1"
      :drop-position="dropTargetId === row.id ? dropPosition : null"
      @select="selectedItemId = row.id"
      @activate="play(row)"
      @toggle-playback="play(row)"
      @open-menu="openMenu(row, $event)"
      @drag-start="startDrag(row, $event)"
      @drag-over="updateDropTarget(row, $event)"
      @drag-leave="leaveDropTarget(row, $event)"
      @drop="drop(row, $event)"
      @drag-end="clearDragState"
    />
    <li v-if="!rows.length">
      <UiHint>沒有待播曲目。可在「演唱工具 → 播放安排」搜尋並加入。</UiHint>
    </li>
  </UiScrollLayout>
  <UiActionMenu
    :open="menuIndex >= 0"
    :anchor="menuAnchor"
    :content="menuContent"
    aria-label="待播曲目操作"
    @select="selectAction"
    @close="closeMenu"
  />
</template>

<style scoped>
.performance-session-queue-scroll {
  --ui-scroll-layout-padding-block-start: calc(
    var(--ui-focus-width) + var(--ui-focus-offset)
  );
  --ui-scroll-layout-padding-block-end: calc(
    var(--ui-focus-width) + var(--ui-focus-offset)
  );
  --ui-scroll-layout-padding-inline-start: calc(
    var(--ui-focus-width) + var(--ui-focus-offset)
  );
  --ui-scroll-layout-padding-inline-end: calc(
    var(--ui-focus-width) + var(--ui-focus-offset)
  );
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
