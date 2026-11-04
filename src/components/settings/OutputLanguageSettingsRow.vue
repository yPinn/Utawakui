<script setup>
import { Languages } from '../../icons/index.js';
import UiHint from '../ui/UiHint.vue';
import UiButton from '../ui/UiButton.vue';
import UiSelect from '../ui/UiSelect.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

defineProps({
  preference: { type: String, default: 'ui' },
  items: { type: Array, required: true },
  busy: { type: Boolean, default: false },
  reading: { type: Boolean, default: false },
  loaded: { type: Boolean, default: true },
  error: { type: String, default: '' },
  readError: { type: String, default: '' },
});

const emit = defineEmits(['setPreference', 'refreshPreference']);
</script>

<template>
  <div class="output-language-settings-row">
    <SettingsDocumentItem
      :icon="Languages"
      :title="t('settings.outputLanguage.title')"
      :guidance="t('settings.outputLanguage.guidance')"
    >
      <template #actions>
        <UiSelect
          id="output-language-preference"
          class="output-language-settings-row__select"
          :label="t('settings.outputLanguage.label')"
          :options="items"
          :model-value="loaded ? preference : ''"
          :placeholder="loaded ? '' : t('settings.notLoaded')"
          :disabled="busy || reading || !loaded"
          :error="error"
          label-hidden
          @update:model-value="emit('setPreference', $event)"
        />
      </template>
      <template v-if="readError || !loaded" #feedback>
        <UiHint :tone="readError ? 'danger' : 'muted'" role="status">{{
          readError || t('settings.unconfirmed')
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
  </div>
</template>

<style scoped>
.output-language-settings-row {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.output-language-settings-row__select {
  inline-size: var(--settings-select-inline-size);
  min-inline-size: min(100%, 10ic);
  max-inline-size: 100%;
}
</style>
