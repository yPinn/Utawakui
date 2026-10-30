<script setup>
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiSelect from '../ui/UiSelect.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

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
  { value: 'ask', label: t('settings.autoReport.ask') },
  { value: 'always', label: t('settings.autoReport.always') },
  { value: 'never', label: t('settings.autoReport.never') },
]);
</script>

<template>
  <SettingsDocumentItem
    :title="t('settings.autoReport.title')"
    :guidance="t('settings.autoReport.guidance')"
  >
    <template #actions>
      <UiSelect
        id="auto-error-reporting"
        class="auto-error-reporting-settings-row__select"
        :label="t('settings.autoReport.title')"
        label-hidden
        :model-value="reporting"
        :options="OPTIONS"
        :disabled="busy || reading || !loaded"
        @update:model-value="emit('setReporting', $event)"
      />
    </template>
    <template v-if="error || readError || !loaded" #feedback>
      <UiHint :tone="error || readError ? 'danger' : 'muted'" role="status">{{
        error || readError || t('settings.unconfirmed')
      }}</UiHint>
      <UiButton
        v-if="readError"
        variant="ghost"
        :loading="reading"
        @click="emit('refreshPreference')"
        >{{ t('settings.reload') }}</UiButton
      >
    </template>
  </SettingsDocumentItem>
</template>

<style scoped>
.auto-error-reporting-settings-row__select {
  inline-size: var(--settings-select-inline-size);
  min-inline-size: min(100%, 6ic);
  max-inline-size: 100%;
}
</style>
