<script setup>
import { RefreshCw } from '../../icons/index.js';
import SettingsActionRow from './SettingsActionRow.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';

defineProps({
  isRunning: { type: Boolean, default: false },
  message: { type: String, default: '' },
  error: { type: Object, default: null },
});

defineEmits(['run']);
</script>

<template>
  <SettingsActionRow
    :icon="RefreshCw"
    title="曲目資訊整理"
    value="整理名稱、歌手、專輯與年份"
    :status="isRunning ? '執行中' : '可用'"
    :status-tone="isRunning ? 'info' : 'success'"
    tooltip="從已保存的來源資訊安全整理曲目，不會覆蓋無法確認的手動編輯。"
  >
    <template #actions>
      <UiIconButton
        :icon="RefreshCw"
        :disabled="isRunning"
        label="整理曲目資訊"
        @click="$emit('run')"
      />
    </template>
  </SettingsActionRow>

  <UiNotice v-if="error" :notice="error" compact />
  <UiHint v-else-if="message" tone="success" role="status">
    {{ message }}
  </UiHint>
</template>
