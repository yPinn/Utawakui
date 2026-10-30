<script setup>
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

defineProps({
  allowBrowserCookies: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  reading: { type: Boolean, default: false },
  loaded: { type: Boolean, default: true },
  error: { type: String, default: '' },
  readError: { type: String, default: '' },
});
const emit = defineEmits(['setAllowBrowserCookies', 'refreshPreference']);
</script>

<template>
  <SettingsDocumentItem
    :title="t('capabilities.cookies.title')"
    :guidance="t('capabilities.cookies.guidance')"
    variant="nested"
  >
    <template #actions>
      <UiCheckbox
        id="youtube-browser-cookies"
        :label="t('capabilities.cookies.allow')"
        :aria-label="t('capabilities.cookies.allowLabel')"
        :model-value="loaded && allowBrowserCookies"
        :disabled="busy || reading || !loaded"
        :error="error"
        @update:model-value="emit('setAllowBrowserCookies', $event)"
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
