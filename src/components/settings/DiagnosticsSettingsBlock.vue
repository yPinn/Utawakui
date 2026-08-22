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
      title="使用記錄"
      description="記錄只保留在這台電腦。"
      :value="isLoading ? '讀取中' : `${recordCount} 筆近期記錄`"
      :status="recordCount > 0 ? '已記錄' : '待命'"
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
          label="開啟使用記錄資料夾"
          @click="emit('openFolder')"
        />
        <UiIconButton
          :icon="Trash2"
          label="清除使用記錄"
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
