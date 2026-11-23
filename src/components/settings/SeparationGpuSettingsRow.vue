<script setup>
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import UiButton from '../ui/UiButton.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

defineProps({
  gpuAcceleration: { type: Boolean, default: true },
  preferenceBusy: { type: Boolean, default: false },
  preferenceError: { type: String, default: '' },
  readError: { type: String, default: '' },
  reading: { type: Boolean, default: false },
  loaded: { type: Boolean, default: true },
});

const emit = defineEmits(['setGpuAcceleration', 'refreshPreference']);
</script>

<template>
  <SettingsDocumentItem
    :title="t('capabilities.gpu.title')"
    :guidance="t('capabilities.gpu.guidance')"
    variant="nested"
  >
    <template #actions>
      <UiCheckbox
        id="separation-gpu-acceleration"
        :label="t('capabilities.gpu.toggle')"
        :aria-label="t('capabilities.gpu.toggleLabel')"
        :model-value="loaded ? gpuAcceleration : false"
        :disabled="preferenceBusy || reading || !loaded"
        :error="preferenceError"
        @update:model-value="emit('setGpuAcceleration', $event)"
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
