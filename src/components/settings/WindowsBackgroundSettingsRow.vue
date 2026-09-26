<script setup>
import { Minimize2 } from '../../icons/index.js';
import UiNotice from '../ui/UiNotice.vue';
import UiSelect from '../ui/UiSelect.vue';
import SettingsActionRow from './SettingsActionRow.vue';

defineProps({
  behavior: {
    type: String,
    default: 'ask',
    validator: (value) => ['ask', 'tray', 'quit'].includes(value),
  },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits(['setBehavior']);

const closeBehaviorItems = Object.freeze([
  { value: 'ask', label: '每次詢問' },
  { value: 'tray', label: '在系統匣背景執行' },
  { value: 'quit', label: '完全結束' },
]);
</script>

<template>
  <div class="windows-background-settings-row">
    <SettingsActionRow
      :icon="Minimize2"
      title="關閉主視窗時"
      description="預設按 X 時會詢問。選擇背景執行後，播放、OBS 連線與輸出仍會繼續；可從系統匣再次開啟或完整結束。"
      tooltip="最小化按鈕仍會照常縮到 Windows 工作列。"
    >
      <template #actions>
        <UiSelect
          id="windows-close-behavior"
          class="windows-background-settings-row__select"
          label="關閉主視窗時的行為"
          :options="closeBehaviorItems"
          :model-value="behavior"
          :disabled="busy"
          label-hidden
          @update:model-value="emit('setBehavior', $event)"
        />
      </template>
    </SettingsActionRow>

    <UiNotice
      v-if="error"
      tone="danger"
      title="關閉行為未儲存"
      :message="error"
      compact
    />
  </div>
</template>

<style scoped>
.windows-background-settings-row {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.windows-background-settings-row__select {
  inline-size: min(100%, 15rem);
}
</style>
