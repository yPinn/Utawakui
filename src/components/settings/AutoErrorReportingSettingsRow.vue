<script setup>
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiSelect from '../ui/UiSelect.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';

defineProps({
  reporting: { type: String, default: 'ask' },
  busy: { type: Boolean, default: false },
  reading: { type: Boolean, default: false },
  loaded: { type: Boolean, default: true },
  error: { type: String, default: '' },
  readError: { type: String, default: '' },
});
const emit = defineEmits(['setReporting', 'refreshPreference']);

const OPTIONS = Object.freeze([
  { value: 'ask', label: '每次詢問' },
  { value: 'always', label: '自動傳送' },
  { value: 'never', label: '不傳送' },
]);
</script>

<template>
  <SettingsDocumentItem
    title="嚴重錯誤回報"
    guidance="App 發生嚴重錯誤時，傳送錯誤類型與程式位置給開發者；不含曲庫、歌詞或檔案路徑。"
  >
    <template #actions>
      <UiSelect
        id="auto-error-reporting"
        label="嚴重錯誤回報"
        label-hidden
        :model-value="reporting"
        :options="OPTIONS"
        :disabled="busy || reading || !loaded"
        @update:model-value="emit('setReporting', $event)"
      />
    </template>
    <template v-if="error || readError || !loaded" #feedback>
      <UiHint :tone="error || readError ? 'danger' : 'muted'" role="status">{{
        error || readError || '讀取中；尚未確認已儲存設定。'
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
</template>
