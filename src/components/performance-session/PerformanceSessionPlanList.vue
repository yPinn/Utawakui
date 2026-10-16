<script setup>
import { computed, shallowRef, watch } from 'vue';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Ellipsis,
  Trash2,
} from '../../icons/index.js';
import UiChip from '../ui/UiChip.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';

const props = defineProps({
  items: { type: Array, default: () => [] },
  selectedItemId: { type: String, default: null },
  saving: { type: Boolean, default: false },
});

const emit = defineEmits(['select', 'move', 'duplicate', 'remove']);

const menuOpen = shallowRef(false);
const menuAnchorEl = shallowRef(null);
const menuItemId = shallowRef(null);

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

const STATUS_PRESENTATION = Object.freeze({
  ready: null,
  manual: { label: '手動', tone: 'muted' },
  'needs-link': { label: '需處理', tone: 'warning' },
  unavailable: { label: '音檔缺少', tone: 'danger' },
  'source-changed': { label: '資料已變更', tone: 'warning' },
  'needs-attention': { label: '需處理', tone: 'warning' },
});

function statusPresentation(item) {
  return (
    STATUS_PRESENTATION[item.status] ?? STATUS_PRESENTATION['needs-attention']
  );
}

function closeMenu() {
  menuOpen.value = false;
  menuAnchorEl.value = null;
}

function openMenu(event, itemId) {
  if (props.saving) return;
  event.stopPropagation();
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
  <ol class="performance-session-plan-list" aria-label="待唱順序">
    <li
      v-for="(item, index) in props.items"
      :key="item.itemId"
      class="performance-session-plan-row"
      :class="{
        'performance-session-plan-row--selected':
          item.itemId === selectedItemId,
      }"
    >
      <button
        type="button"
        class="performance-session-plan-row__select"
        :aria-label="`檢查第 ${index + 1} 首：${item.displayTitle}`"
        :aria-current="item.itemId === selectedItemId ? 'true' : undefined"
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        @click="emit('select', item.itemId)"
        @keydown="handleRowKeydown($event, item, index)"
      >
        <span class="performance-session-plan-row__index">{{ index + 1 }}</span>
        <span class="performance-session-plan-row__copy">
          <span class="performance-session-plan-row__title" dir="auto">
            {{ item.displayTitle }}
          </span>
          <span
            v-if="item.displayArtist"
            class="performance-session-plan-row__artist"
            dir="auto"
          >
            {{ item.displayArtist }}
          </span>
        </span>
        <UiChip
          v-if="statusPresentation(item)"
          :tone="statusPresentation(item).tone"
        >
          {{ statusPresentation(item).label }}
        </UiChip>
      </button>

      <div class="performance-session-plan-row__actions">
        <UiIconButton
          :icon="Ellipsis"
          :label="`第 ${index + 1} 首「${item.displayTitle}」的更多操作`"
          :disabled="saving"
          aria-haspopup="menu"
          :aria-expanded="
            menuOpen && menuItemId === item.itemId ? 'true' : 'false'
          "
          @click="openMenu($event, item.itemId)"
        />
      </div>
    </li>
  </ol>

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
</template>

<style scoped>
.performance-session-plan-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.performance-session-plan-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--ui-space-2);
  align-items: center;
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface);
}

.performance-session-plan-row--selected {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-surface-selected);
}

.performance-session-plan-row__select {
  display: grid;
  grid-template-columns: 3ch minmax(0, 1fr) auto;
  gap: var(--ui-space-2);
  align-items: center;
  min-width: 0;
  padding: var(--ui-space-1);
  border: 0;
  border-radius: var(--ui-radius-md);
  background: transparent;
  color: var(--ui-color-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.performance-session-plan-row__select:hover {
  background: var(--ui-color-surface-hover);
}

.performance-session-plan-row__select:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.performance-session-plan-row__index {
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
  text-align: end;
}

.performance-session-plan-row__copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.performance-session-plan-row__title,
.performance-session-plan-row__artist {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.performance-session-plan-row__title {
  font-weight: var(--ui-font-weight-semibold);
}

.performance-session-plan-row__artist {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.performance-session-plan-row__actions {
  display: flex;
  align-items: center;
}
</style>
