<script setup>
import { Minimize2 } from '../../icons/index.js';
import UiHint from '../ui/UiHint.vue';
import UiButton from '../ui/UiButton.vue';
import UiSelect from '../ui/UiSelect.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';

defineProps({
  behavior: {
    type: String,
    default: 'ask',
    validator: (value) => ['ask', 'tray', 'quit'].includes(value),
  },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
  readError: { type: String, default: '' },
  reading: { type: Boolean, default: false },
  loaded: { type: Boolean, default: true },
});

const emit = defineEmits(['setBehavior', 'refreshPreference']);

const closeBehaviorItems = Object.freeze([
  { value: 'ask', label: '每次詢問' },
  { value: 'tray', label: '在系統匣背景執行' },
  { value: 'quit', label: '結束' },
]);
</script>

<template>
  <div class="windows-background-settings-row">
    <SettingsDocumentItem
      :icon="Minimize2"
      title="關閉主視窗時"
      guidance="背景執行保留播放、OBS 與輸出；最小化仍在工作列。"
    >
      <template #actions>
        <UiSelect
          id="windows-close-behavior"
          class="windows-background-settings-row__select"
          label="關閉主視窗時的行為"
          :options="closeBehaviorItems"
          :model-value="loaded ? behavior : ''"
          :placeholder="loaded ? '' : '尚未讀取'"
          :disabled="busy || reading || !loaded"
          :error="error"
          label-hidden
          @update:model-value="emit('setBehavior', $event)"
        />
      </template>
      <template v-if="readError || !loaded" #feedback>
        <UiHint :tone="readError ? 'danger' : 'muted'" role="status">{{
          readError || '讀取中；尚未確認已儲存設定。'
        }}</UiHint>
        <UiButton
          v-if="readError"
          variant="ghost"
          :loading="reading"
          @click="emit('refreshPreference')"
          >重新讀取</UiButton
        >
      </template>
    </SettingsDocumentItem>
  </div>
</template>

<style scoped>
.windows-background-settings-row {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.windows-background-settings-row__select {
  inline-size: 100%;
}
</style>
