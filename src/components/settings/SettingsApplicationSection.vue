<script setup>
import { computed, onMounted } from 'vue';
import { useWindowsIntegrationSettings } from '../../composables/useWindowsIntegrationSettings.js';
import { useUiLanguageSettings } from '../../composables/useUiLanguageSettings.js';
import { useOutputLanguageSettings } from '../../composables/useOutputLanguageSettings.js';
import SettingsSection from './SettingsSection.vue';
import WindowsBackgroundSettingsRow from './WindowsBackgroundSettingsRow.vue';
import LanguageSettingsRow from './LanguageSettingsRow.vue';
import KeyboardShortcutSettingsBlock from './KeyboardShortcutSettingsBlock.vue';
import { t } from '../../utils/i18n.js';

const windowsIntegrationSettings = useWindowsIntegrationSettings();
const uiLanguageSettings = useUiLanguageSettings();
const outputLanguageSettings = useOutputLanguageSettings();
const uiLanguage = computed(() => ({
  preference: uiLanguageSettings.preference.value,
  items: uiLanguageSettings.items,
  busy: uiLanguageSettings.busy.value,
  reading: uiLanguageSettings.reading.value,
  loaded: uiLanguageSettings.loaded.value,
  error: uiLanguageSettings.saveError.value,
  readError: uiLanguageSettings.readError.value,
  pendingMessage: uiLanguageSettings.pendingMessage.value,
  relaunching: uiLanguageSettings.relaunching.value,
  relaunchError: uiLanguageSettings.relaunchError.value,
}));
const outputLanguage = computed(() => ({
  preference: outputLanguageSettings.preference.value,
  items: outputLanguageSettings.items,
  busy: outputLanguageSettings.busy.value,
  reading: outputLanguageSettings.reading.value,
  loaded: outputLanguageSettings.loaded.value,
  error: outputLanguageSettings.saveError.value,
  readError: outputLanguageSettings.readError.value,
}));

onMounted(() => {
  windowsIntegrationSettings.refreshPreference();
  uiLanguageSettings.refresh();
  outputLanguageSettings.refresh();
});
</script>

<template>
  <SettingsSection
    id="settings-application"
    class="settings-application-section"
    :title="t('settings.sections.application')"
    tabindex="-1"
  >
    <LanguageSettingsRow
      :ui="uiLanguage"
      :output="outputLanguage"
      @set-ui-language="uiLanguageSettings.setPreference"
      @set-output-language="outputLanguageSettings.setPreference"
      @refresh-ui-language="uiLanguageSettings.refresh"
      @refresh-output-language="outputLanguageSettings.refresh"
      @relaunch="uiLanguageSettings.offerRestart"
    />
    <WindowsBackgroundSettingsRow
      :behavior="windowsIntegrationSettings.windowCloseBehavior.value"
      :busy="windowsIntegrationSettings.preferenceBusy.value"
      :error="windowsIntegrationSettings.preferenceSaveError.value"
      :read-error="windowsIntegrationSettings.preferenceReadError.value"
      :reading="windowsIntegrationSettings.preferenceReading.value"
      :loaded="windowsIntegrationSettings.preferenceLoaded.value"
      @refresh-preference="windowsIntegrationSettings.refreshPreference"
      @set-behavior="windowsIntegrationSettings.setWindowCloseBehavior"
    />
    <KeyboardShortcutSettingsBlock />
  </SettingsSection>
</template>
