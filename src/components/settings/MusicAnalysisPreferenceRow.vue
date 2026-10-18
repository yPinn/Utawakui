<script setup>
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';

defineProps({
  autoAnalyze: { type: Boolean, default: true },
  busy: { type: Boolean, default: false },
  reading: { type: Boolean, default: false },
  loaded: { type: Boolean, default: true },
  error: { type: String, default: '' },
  readError: { type: String, default: '' },
});
const emit = defineEmits(['setAutoAnalyze', 'refreshPreference']);
</script>

<template>
  <SettingsDocumentItem
    title="BPM 與節拍分析"
    guidance="匯入後在本機分析，不上傳歌曲。"
    variant="nested"
  >
    <template #actions>
      <UiCheckbox
        id="auto-music-analysis"
        label="自動分析"
        aria-label="匯入歌曲後自動分析 BPM 與節拍"
        :model-value="loaded && autoAnalyze"
        :disabled="busy || reading || !loaded"
        :error="error"
        @update:model-value="emit('setAutoAnalyze', $event)"
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
</template>
