<script setup>
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

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
    :title="t('capabilities.bpm.title')"
    :guidance="t('capabilities.bpm.guidance')"
    variant="nested"
  >
    <template #actions>
      <UiCheckbox
        id="auto-music-analysis"
        :label="t('capabilities.bpm.auto')"
        :aria-label="t('capabilities.bpm.autoLabel')"
        :model-value="loaded && autoAnalyze"
        :disabled="busy || reading || !loaded"
        :error="error"
        @update:model-value="emit('setAutoAnalyze', $event)"
      />
    </template>
    <template v-if="readError || !loaded" #feedback>
      <UiHint :tone="readError ? 'danger' : 'muted'" role="status">{{
        readError || t('capabilities.unconfirmed')
      }}</UiHint>
      <UiButton
        v-if="readError"
        variant="ghost"
        :loading="reading"
        @click="emit('refreshPreference')"
        >{{ t('capabilities.reload') }}</UiButton
      >
    </template>
  </SettingsDocumentItem>
</template>
