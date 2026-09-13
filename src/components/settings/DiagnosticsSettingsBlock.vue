<script setup>
import { computed, shallowRef } from 'vue';
import {
  Download,
  Ellipsis,
  FolderOpen,
  ListChecks,
  MessageSquare,
  RefreshCw,
  Trash2,
} from '../../icons/index.js';
import UiContextMenu from '../ui/UiContextMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import SettingsActionRow from './SettingsActionRow.vue';

const props = defineProps({
  recordCount: { type: Number, default: 0 },
  isLoading: { type: Boolean, default: false },
  notice: { type: Object, default: null },
});

const emit = defineEmits([
  'refresh',
  'openFolder',
  'clear',
  'export',
  'noticeAction',
  'reportIssue',
]);

// Export is the one action most people actually reach for (sending records
// to a developer); refresh/open-folder/clear are advanced/support actions,
// same split as SettingsDependencyActions.vue's primary + Ellipsis menu.
const isMenuOpen = shallowRef(false);
const menuX = shallowRef(0);
const menuY = shallowRef(0);

const menuItems = computed(() => [
  {
    value: 'refresh',
    label: '重新讀取',
    icon: RefreshCw,
    disabled: props.isLoading,
  },
  { value: 'open-folder', label: '開啟資料夾', icon: FolderOpen },
  { separator: true },
  {
    value: 'clear',
    label: '清除紀錄',
    icon: Trash2,
    danger: true,
    disabled: props.isLoading || props.recordCount === 0,
  },
  { separator: true },
  { value: 'report-issue', label: '回報問題', icon: MessageSquare },
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
  if (actionId === 'refresh') emit('refresh');
  else if (actionId === 'open-folder') emit('openFolder');
  else if (actionId === 'clear') emit('clear');
  else if (actionId === 'report-issue') emit('reportIssue');
}
</script>

<template>
  <div class="diagnostics-settings-block">
    <SettingsActionRow
      :icon="ListChecks"
      title="錯誤紀錄"
      :value="
        isLoading
          ? '讀取中'
          : recordCount > 0
            ? `${recordCount} 筆近期錯誤`
            : '沒有近期錯誤'
      "
      :status="recordCount > 0 ? '有紀錄' : '無紀錄'"
      :status-tone="recordCount > 0 ? 'warning' : 'muted'"
      tooltip="協助排查播放、匯入或音訊處理問題。"
    >
      <template #actions>
        <UiIconButton
          :icon="Download"
          label="匯出錯誤紀錄"
          :disabled="isLoading"
          @click="emit('export')"
        />
        <UiIconButton
          :icon="Ellipsis"
          label="錯誤紀錄選項"
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
      :items="menuItems"
      @select="handleMenuSelect"
      @close="closeMenu"
    />

    <UiNotice
      v-if="notice"
      :notice="notice"
      compact
      @action="emit('noticeAction', notice.operation)"
    />
  </div>
</template>

<style scoped>
.diagnostics-settings-block {
  display: grid;
  gap: var(--ui-space-2);
}
</style>
