<script setup>
import { computed, shallowRef } from 'vue';
import { Clock, Ellipsis, ListX } from '../../icons/index.js';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import SettingsActionRow from './SettingsActionRow.vue';

const props = defineProps({
  recordCount: { type: Number, default: 0 },
  isLoading: { type: Boolean, default: false },
  isClearing: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits(['clear']);
const isMenuOpen = shallowRef(false);
const menuAnchorEl = shallowRef(null);

const valueLabel = computed(() => {
  if (props.isLoading) return '讀取中';
  if (props.isClearing) return '清除中';
  return props.recordCount > 0
    ? `已保存 ${props.recordCount} 首`
    : '尚無播放紀錄';
});

const statusLabel = computed(() => {
  if (props.isLoading || props.isClearing) return '處理中';
  return props.recordCount > 0 ? '有紀錄' : '無紀錄';
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
    <SettingsActionRow
      :icon="Clock"
      title="播放紀錄"
      :value="valueLabel"
      :status="statusLabel"
      status-tone="muted"
      tooltip="最近播放依時間自動保存；清除不會影響播放佇列或歌單。"
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
    </SettingsActionRow>

    <UiActionMenu
      :open="isMenuOpen"
      :anchor="menuAnchor"
      size="sm"
      aria-label="播放紀錄操作"
      :content="menuContent"
      @select="handleMenuSelect"
      @close="closeMenu"
    />

    <UiNotice
      v-if="error"
      compact
      tone="warning"
      title="播放紀錄未更新"
      :message="error"
    />
  </div>
</template>

<style scoped>
.playback-history-settings-row {
  display: grid;
  gap: var(--ui-space-2);
}
</style>
