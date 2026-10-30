<script setup>
import { Minimize2 } from '../../icons/index.js';
import UiHint from '../ui/UiHint.vue';
import UiButton from '../ui/UiButton.vue';
import UiSelect from '../ui/UiSelect.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

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
  { value: 'ask', label: t('settings.background.ask') },
  { value: 'tray', label: t('settings.background.tray') },
  { value: 'quit', label: t('settings.background.quit') },
]);
</script>

<template>
  <div class="windows-background-settings-row">
    <SettingsDocumentItem
      :icon="Minimize2"
      :title="t('settings.background.title')"
      :guidance="t('settings.background.guidance')"
    >
      <template #actions>
        <UiSelect
          id="windows-close-behavior"
          class="windows-background-settings-row__select"
          :label="t('settings.background.label')"
          :options="closeBehaviorItems"
          :model-value="loaded ? behavior : ''"
          :placeholder="loaded ? '' : t('settings.notLoaded')"
          :disabled="busy || reading || !loaded"
          :error="error"
          label-hidden
          @update:model-value="emit('setBehavior', $event)"
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
.windows-background-settings-row {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.windows-background-settings-row__select {
  inline-size: var(--settings-select-inline-size);
  min-inline-size: min(100%, 10ic);
  max-inline-size: 100%;
}
</style>
