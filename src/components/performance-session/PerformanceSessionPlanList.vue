<script setup>
import { computed, shallowRef, watch } from 'vue';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Ellipsis,
  Trash2,
} from '../../icons/index.js';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiChip from '../ui/UiChip.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';

const props = defineProps({
  items: { type: Array, default: () => [] },
  tracks: { type: Array, default: () => [] },
  selectedItemId: { type: String, default: null },
  saving: { type: Boolean, default: false },
});

const emit = defineEmits(['select', 'move', 'duplicate', 'remove']);

const menuOpen = shallowRef(false);
const menuAnchorEl = shallowRef(null);
const menuItemId = shallowRef(null);

const STATUS_PRESENTATION = Object.freeze({
  ready: null,
  manual: { label: '手動', tone: 'muted' },
  'needs-link': { label: '需處理', tone: 'warning' },
  unavailable: { label: '音檔缺少', tone: 'danger' },
  'source-changed': { label: '資料已變更', tone: 'warning' },
  'needs-attention': { label: '需處理', tone: 'warning' },
});

const tracksById = computed(
  () => new Map(props.tracks.map((track) => [track.id, track])),
);
const presentationRows = computed(() =>
  props.items.map((item, index) => {
    const canonicalTrack = item.trackId
      ? tracksById.value.get(item.trackId)
      : null;
    const fallbackId = item.trackId ?? item.linkedTrack?.id ?? item.itemId;
    return {
      item,
      index,
      position: index + 1,
      status:
        STATUS_PRESENTATION[item.status] ??
        STATUS_PRESENTATION['needs-attention'],
      track:
        canonicalTrack ??
        (item.linkedTrack
          ? { ...item.linkedTrack, id: item.linkedTrack.id ?? fallbackId }
          : {
              id: fallbackId,
              title: item.displayTitle,
              artist: item.displayArtist,
            }),
    };
  }),
);

const activeMenuItem = computed(() =>
  props.items.find((item) => item.itemId === menuItemId.value),
);
const activeMenuIndex = computed(() =>
  props.items.findIndex((item) => item.itemId === menuItemId.value),
);
const menuAnchor = computed(() => ({
  kind: 'element',
  element: menuAnchorEl.value,
}));
const menuContent = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'reorder',
      items: [
        {
          id: 'move-up',
          kind: 'action',
          label: '上移一位',
          value: 'move-up',
          icon: ChevronUp,
          shortcut: 'Alt+↑',
          disabled: props.saving || activeMenuIndex.value <= 0,
        },
        {
          id: 'move-down',
          kind: 'action',
          label: '下移一位',
          value: 'move-down',
          icon: ChevronDown,
          shortcut: 'Alt+↓',
          disabled:
            props.saving ||
            activeMenuIndex.value < 0 ||
            activeMenuIndex.value >= props.items.length - 1,
        },
      ],
    },
    {
      id: 'manage',
      items: [
        {
          id: 'duplicate',
          kind: 'action',
          label: '複製待唱項目',
          value: 'duplicate',
          icon: Copy,
          disabled: props.saving || !activeMenuItem.value,
        },
        {
          id: 'remove',
          kind: 'action',
          label: '從待唱移除',
          value: 'remove',
          icon: Trash2,
          intent: 'danger',
          disabled: props.saving || !activeMenuItem.value,
        },
      ],
    },
  ],
}));

function closeMenu() {
  menuOpen.value = false;
  menuAnchorEl.value = null;
}

function openMenu(event, itemId) {
  if (props.saving) return;
  event.stopPropagation?.();
  menuAnchorEl.value = event.currentTarget;
  menuItemId.value = itemId;
  menuOpen.value = true;
}

function handleMenuSelect(action) {
  const item = activeMenuItem.value;
  if (!item || props.saving) {
    closeMenu();
    return;
  }

  if (action === 'move-up') emit('move', item.itemId, -1);
  if (action === 'move-down') emit('move', item.itemId, 1);
  if (action === 'duplicate') emit('duplicate', item.itemId);
  if (action === 'remove') emit('remove', item.itemId);
  closeMenu();
}

function handleRowKeydown(event, item, index) {
  if (!event.altKey || props.saving) return;
  const offset =
    event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
  if (!offset) return;
  if (
    (offset < 0 && index === 0) ||
    (offset > 0 && index === props.items.length - 1)
  ) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  emit('move', item.itemId, offset);
}

watch(
  [() => props.saving, activeMenuItem],
  ([saving, item]) => {
    if (saving || !item) closeMenu();
  },
  { flush: 'sync' },
);
</script>

<template>
  <section class="performance-session-plan-list-surface">
    <UiScrollLayout
      class="performance-session-plan-list__body-scroll"
      axis="vertical"
      content-tag="ol"
      content-class="performance-session-plan-list"
      aria-label="待唱順序"
    >
      <UiTrackRow
        v-for="row in presentationRows"
        :key="row.item.itemId"
        class="performance-session-plan-entry"
        :track="row.track"
        :title="row.item.displayTitle"
        :artist="row.item.displayArtist"
        :active="row.item.itemId === selectedItemId"
        interactive
        state-surface
        :state-surface-active="menuOpen && menuItemId === row.item.itemId"
        selection-action
        action-description="單擊選取；Alt 加上下方向鍵調整順序；選單可複製或移除"
        action-keyboard-shortcuts="Alt+ArrowUp Alt+ArrowDown"
        :action-label="`檢查第 ${row.position} 首：${row.item.displayTitle}`"
        overflow="ellipsis"
        thumb-loading="lazy"
        thumb-decoding="async"
        @row-click="emit('select', row.item.itemId)"
        @action-keydown="handleRowKeydown($event, row.item, row.index)"
        @contextmenu.prevent.stop="openMenu($event, row.item.itemId)"
      >
        <template #lead>
          <span class="performance-session-plan-entry__ordinal">
            {{ row.position }}
          </span>
        </template>
        <template #trail>
          <UiChip v-if="row.status" :tone="row.status.tone">
            {{ row.status.label }}
          </UiChip>
          <UiIconButton
            :icon="Ellipsis"
            :label="`第 ${row.position} 首「${row.item.displayTitle}」的更多操作`"
            :disabled="saving"
            aria-haspopup="menu"
            :aria-expanded="
              menuOpen && menuItemId === row.item.itemId ? 'true' : 'false'
            "
            @click="openMenu($event, row.item.itemId)"
          />
        </template>
      </UiTrackRow>
    </UiScrollLayout>

    <UiActionMenu
      :open="menuOpen"
      :anchor="menuAnchor"
      size="md"
      :aria-label="
        activeMenuIndex >= 0 ? `第 ${activeMenuIndex + 1} 首操作` : '待唱操作'
      "
      :content="menuContent"
      @select="handleMenuSelect"
      @close="closeMenu"
    />
  </section>
</template>

<style scoped>
.performance-session-plan-list-surface {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.performance-session-plan-list__body-scroll {
  flex: 1;
  min-height: 0;
}

.performance-session-plan-list__body-scroll
  :deep(.performance-session-plan-list) {
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: var(--ui-track-list-gap);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.performance-session-plan-entry__ordinal {
  min-inline-size: var(--ui-space-5);
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
  text-align: end;
}
</style>
