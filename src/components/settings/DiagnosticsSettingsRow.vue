<script setup>
import { computed, shallowRef } from 'vue';
import {
  Download,
  Ellipsis,
  FolderOpen,
  ListChecks,
  ListX,
  MessageSquare,
  RefreshCw,
} from '../../icons/index.js';
import UiActionMenu from '../ui/UiActionMenu.vue';
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
const menuAnchorEl = shallowRef(null);

const menuAnchor = computed(() => ({
  kind: 'element',
  element: menuAnchorEl.value,
}));
const menuContent = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'records',
      items: [
        {
          id: 'refresh',
          kind: 'action',
          value: 'refresh',
          label: '重新讀取',
          icon: RefreshCw,
          disabled: props.isLoading,
        },
        {
          id: 'open-folder',
          kind: 'action',
          value: 'open-folder',
          label: '開啟資料夾',
          icon: FolderOpen,
        },
      ],
    },
    {
      id: 'destructive',
      items: [
        {
          id: 'clear',
          kind: 'action',
          value: 'clear',
          label: '清除紀錄',
          icon: ListX,
          disabled: props.isLoading || props.recordCount === 0,
        },
      ],
    },
    {
      id: 'support',
      items: [
        {
          id: 'report-issue',
          kind: 'action',
          value: 'report-issue',
          label: '回報問題',
          icon: MessageSquare,
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
  if (actionId === 'refresh') emit('refresh');
  else if (actionId === 'open-folder') emit('openFolder');
  else if (actionId === 'clear') emit('clear');
  else if (actionId === 'report-issue') emit('reportIssue');
}
</script>

<template>
  <div class="diagnostics-settings-row">
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

    <UiActionMenu
      :open="isMenuOpen"
      :anchor="menuAnchor"
      size="sm"
      :content="menuContent"
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
.diagnostics-settings-row {
  display: grid;
  gap: var(--ui-space-2);
}
</style>
