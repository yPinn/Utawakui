<script setup>
import { computed, shallowRef } from 'vue';
import { Clock, Ellipsis, ListX } from '../../icons/index.js';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiButton from '../ui/UiButton.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';

const props = defineProps({
  recordCount: { type: Number, default: 0 },
  isLoading: { type: Boolean, default: false },
  isClearing: { type: Boolean, default: false },
  error: { type: String, default: '' },
  readError: { type: String, default: '' },
});

const emit = defineEmits(['clear', 'refresh']);
const isMenuOpen = shallowRef(false);
const menuAnchorEl = shallowRef(null);

const valueLabel = computed(() => {
  if (props.readError) return '尚未確認播放紀錄';
  if (props.isLoading) return '讀取中';
  if (props.isClearing) return '清除中';
  return props.recordCount > 0
    ? `已保存 ${props.recordCount} 首`
    : '尚無播放紀錄';
});

const menuAnchor = computed(() => ({
  kind: 'element',
  element: menuAnchorEl.value,
}));
const menuContent = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'history',
      items: [
        {
          id: 'clear',
          kind: 'action',
          value: 'clear',
          label: '清除播放紀錄',
          icon: ListX,
          intent: 'danger',
          disabled:
            props.isLoading || props.isClearing || props.recordCount === 0,
        },
      ],
    },
  ],
}));

function openMenu(event) {
  event.stopPropagation();
  menuAnchorEl.value = event.currentTarget;
  isMenuOpen.value = true;
}

function closeMenu() {
  isMenuOpen.value = false;
  menuAnchorEl.value = null;
}

function handleMenuSelect(actionId) {
  closeMenu();
  if (actionId === 'clear') emit('clear');
}
</script>

<template>
  <div class="playback-history-settings-row">
    <SettingsDocumentItem
      :icon="Clock"
      title="播放紀錄"
      :value="valueLabel"
      guidance="自動保存；清除不影響佇列或歌單。"
    >
      <template #actions>
        <UiIconButton
          :icon="Ellipsis"
          label="播放紀錄選項"
          aria-haspopup="menu"
          :aria-expanded="isMenuOpen ? 'true' : 'false'"
          @click="openMenu"
        />
      </template>
      <template v-if="error" #feedback>
        <UiHint tone="danger" role="alert"
          >{{ readError ? '播放紀錄無法讀取' : '播放紀錄未更新' }}：{{
            error
          }}</UiHint
        >
        <UiButton
          v-if="readError"
          variant="ghost"
          :loading="isLoading"
          @click="emit('refresh')"
          >重新讀取</UiButton
        >
      </template>
    </SettingsDocumentItem>

    <UiActionMenu
      :open="isMenuOpen"
      :anchor="menuAnchor"
      size="sm"
      aria-label="播放紀錄操作"
      :content="menuContent"
      @select="handleMenuSelect"
      @close="closeMenu"
    />
  </div>
</template>

<style scoped>
.playback-history-settings-row {
  display: grid;
  gap: var(--ui-space-2);
}
</style>
