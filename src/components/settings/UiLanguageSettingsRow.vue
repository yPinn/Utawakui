<script setup>
import { Languages } from '../../icons/index.js';
import UiHint from '../ui/UiHint.vue';
import UiButton from '../ui/UiButton.vue';
import UiSelect from '../ui/UiSelect.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

defineProps({
  preference: { type: String, default: 'system' },
  items: { type: Array, required: true },
  busy: { type: Boolean, default: false },
  reading: { type: Boolean, default: false },
  loaded: { type: Boolean, default: true },
  error: { type: String, default: '' },
  readError: { type: String, default: '' },
  pendingMessage: { type: String, default: '' },
  relaunching: { type: Boolean, default: false },
  relaunchError: { type: String, default: '' },
});

const emit = defineEmits(['setPreference', 'refreshPreference', 'relaunch']);
</script>

<template>
  <div class="ui-language-settings-row">
    <SettingsDocumentItem
      :icon="Languages"
      :title="t('settings.language.title')"
      :guidance="t('settings.language.guidance')"
    >
      <template #actions>
        <UiSelect
          id="ui-language-preference"
          class="ui-language-settings-row__select"
          :label="t('settings.language.label')"
          :options="items"
          :model-value="loaded ? preference : ''"
          :placeholder="loaded ? '' : t('settings.notLoaded')"
          :disabled="busy || reading || relaunching || !loaded"
          :error="error"
          label-hidden
          @update:model-value="emit('setPreference', $event)"
        />
      </template>
      <template
        v-if="readError || !loaded || pendingMessage || relaunchError"
        #feedback
      >
        <template v-if="readError || !loaded">
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
        <template v-else-if="pendingMessage">
          <UiHint :tone="relaunchError ? 'danger' : 'muted'" role="status">{{
            relaunchError || pendingMessage
          }}</UiHint>
          <UiButton
            variant="ghost"
            :loading="relaunching"
            @click="emit('relaunch')"
            >{{ t('settings.language.restartNow') }}</UiButton
          >
        </template>
      </template>
    </SettingsDocumentItem>
  </div>
</template>

<style scoped>
.ui-language-settings-row {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.ui-language-settings-row__select {
  inline-size: var(--settings-select-inline-size);
  min-inline-size: min(100%, 10ic);
  max-inline-size: 100%;
}
</style>
