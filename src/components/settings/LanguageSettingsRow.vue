<script setup>
import { computed } from 'vue';
import { Languages } from '../../icons/index.js';
import UiHint from '../ui/UiHint.vue';
import UiButton from '../ui/UiButton.vue';
import UiSelect from '../ui/UiSelect.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

// One row for both languages: the UI language (next launch) and the Output
// language (live). Each prop object mirrors its settings composable.
const props = defineProps({
  ui: { type: Object, required: true },
  output: { type: Object, required: true },
});

const emit = defineEmits([
  'setUiLanguage',
  'setOutputLanguage',
  'refreshUiLanguage',
  'refreshOutputLanguage',
  'relaunch',
]);

const readIssue = computed(() =>
  props.ui.readError
    ? {
        message: props.ui.readError,
        reading: props.ui.reading,
        event: 'refreshUiLanguage',
      }
    : props.output.readError
      ? {
          message: props.output.readError,
          reading: props.output.reading,
          event: 'refreshOutputLanguage',
        }
      : null,
);
const loading = computed(() => !props.ui.loaded || !props.output.loaded);
</script>

<template>
  <div class="language-settings-row">
    <SettingsDocumentItem
      :icon="Languages"
      :title="t('settings.language.groupTitle')"
      :guidance="t('settings.language.groupGuidance')"
    >
      <template #actions>
        <div class="language-settings-row__selects">
          <UiSelect
            id="ui-language-preference"
            class="language-settings-row__select"
            :label="t('settings.language.label')"
            :options="ui.items"
            :model-value="ui.loaded ? ui.preference : ''"
            :placeholder="ui.loaded ? '' : t('settings.notLoaded')"
            :disabled="ui.busy || ui.reading || ui.relaunching || !ui.loaded"
            :error="ui.error"
            @update:model-value="emit('setUiLanguage', $event)"
          />
          <UiSelect
            id="output-language-preference"
            class="language-settings-row__select"
            :label="t('settings.outputLanguage.label')"
            :options="output.items"
            :model-value="output.loaded ? output.preference : ''"
            :placeholder="output.loaded ? '' : t('settings.notLoaded')"
            :disabled="output.busy || output.reading || !output.loaded"
            :error="output.error"
            @update:model-value="emit('setOutputLanguage', $event)"
          />
        </div>
      </template>
      <template
        v-if="readIssue || loading || ui.pendingMessage || ui.relaunchError"
        #feedback
      >
        <template v-if="readIssue || loading">
          <UiHint :tone="readIssue ? 'danger' : 'muted'" role="status">{{
            readIssue?.message || t('settings.unconfirmed')
          }}</UiHint>
          <UiButton
            v-if="readIssue"
            variant="ghost"
            :loading="readIssue.reading"
            @click="emit(readIssue.event)"
            >{{ t('settings.reload') }}</UiButton
          >
        </template>
        <template v-else-if="ui.pendingMessage">
          <UiHint :tone="ui.relaunchError ? 'danger' : 'muted'" role="status">{{
            ui.relaunchError || ui.pendingMessage
          }}</UiHint>
          <UiButton
            variant="ghost"
            :loading="ui.relaunching"
            @click="emit('relaunch')"
            >{{ t('settings.language.restartNow') }}</UiButton
          >
        </template>
      </template>
    </SettingsDocumentItem>
  </div>
</template>

<style scoped>
.language-settings-row {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.language-settings-row__selects {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.language-settings-row__select {
  inline-size: var(--settings-select-inline-size);
  min-inline-size: min(100%, 10ic);
  max-inline-size: 100%;
}
</style>
