<script setup>
import {
  FolderOpen,
  ListChecks,
  RefreshCw,
  Trash2,
} from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import SettingsActionRow from './SettingsActionRow.vue';

defineProps({
  recordCount: { type: Number, default: 0 },
  isLoading: { type: Boolean, default: false },
  notice: { type: Object, default: null },
});

const emit = defineEmits(['refresh', 'openFolder', 'clear', 'noticeAction']);
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
          :icon="RefreshCw"
          label="重新讀取"
          :disabled="isLoading"
          @click="emit('refresh')"
        />
        <UiIconButton
          :icon="FolderOpen"
          label="開啟錯誤紀錄資料夾"
          @click="emit('openFolder')"
        />
        <UiIconButton
          :icon="Trash2"
          label="清除錯誤紀錄"
          :disabled="isLoading || recordCount === 0"
          @click="emit('clear')"
        />
      </template>
    </SettingsActionRow>

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
