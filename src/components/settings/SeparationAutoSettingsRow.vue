<script setup>
import { MicVocal } from '../../icons/index.js';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import UiButton from '../ui/UiButton.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

defineProps({
  autoSeparate: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
  readError: { type: String, default: '' },
  reading: { type: Boolean, default: false },
  loaded: { type: Boolean, default: true },
});

const emit = defineEmits(['setAutoSeparate', 'refreshPreference']);
</script>

<template>
  <SettingsDocumentItem
    :icon="MicVocal"
    :title="t('capabilities.autoSeparation.title')"
    :guidance="t('capabilities.autoSeparation.guidance')"
    variant="nested"
  >
    <template #actions>
      <UiCheckbox
        id="auto-separation"
        :label="t('capabilities.autoSeparation.toggle')"
        :aria-label="t('capabilities.autoSeparation.toggleLabel')"
        :model-value="loaded && autoSeparate"
        :disabled="busy || reading || !loaded"
        :error="error"
        @update:model-value="emit('setAutoSeparate', $event)"
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
