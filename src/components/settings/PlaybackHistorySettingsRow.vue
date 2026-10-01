<script setup>
import { computed, shallowRef } from 'vue';
import { Clock, Ellipsis, Trash2 } from '../../icons/index.js';
import UiContextMenu from '../ui/UiContextMenu.vue';
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
const menuX = shallowRef(0);
const menuY = shallowRef(0);

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

const menuItems = computed(() => [
  {
    value: 'clear',
    label: '清除播放紀錄',
    icon: Trash2,
    danger: true,
    disabled: props.isLoading || props.isClearing || props.recordCount === 0,
  },
]);

function openMenu(event) {
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  menuX.value = rect.right;
  menuY.value = rect.bottom + 4;
  isMenuOpen.value = true;
}

function closeMenu() {
  isMenuOpen.value = false;
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

    <UiContextMenu
      :open="isMenuOpen"
      :x="menuX"
      :y="menuY"
      :width="184"
      align-x="right"
      aria-label="播放紀錄操作"
      :items="menuItems"
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
