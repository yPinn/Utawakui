<script setup>
import { onMounted } from 'vue';
import { useWindowsIntegrationSettings } from '../../composables/useWindowsIntegrationSettings.js';
import { useUiLanguageSettings } from '../../composables/useUiLanguageSettings.js';
import { useOutputLanguageSettings } from '../../composables/useOutputLanguageSettings.js';
import SettingsSection from './SettingsSection.vue';
import WindowsBackgroundSettingsRow from './WindowsBackgroundSettingsRow.vue';
import UiLanguageSettingsRow from './UiLanguageSettingsRow.vue';
import OutputLanguageSettingsRow from './OutputLanguageSettingsRow.vue';
import KeyboardShortcutSettingsBlock from './KeyboardShortcutSettingsBlock.vue';
import { t } from '../../utils/i18n.js';

const windowsIntegrationSettings = useWindowsIntegrationSettings();
const uiLanguageSettings = useUiLanguageSettings();
const outputLanguageSettings = useOutputLanguageSettings();

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
    <UiLanguageSettingsRow
      :preference="uiLanguageSettings.preference.value"
      :items="uiLanguageSettings.items"
      :busy="uiLanguageSettings.busy.value"
      :reading="uiLanguageSettings.reading.value"
      :loaded="uiLanguageSettings.loaded.value"
      :error="uiLanguageSettings.saveError.value"
      :read-error="uiLanguageSettings.readError.value"
      :pending-message="uiLanguageSettings.pendingMessage.value"
      :relaunching="uiLanguageSettings.relaunching.value"
      :relaunch-error="uiLanguageSettings.relaunchError.value"
      @refresh-preference="uiLanguageSettings.refresh"
      @set-preference="uiLanguageSettings.setPreference"
      @relaunch="uiLanguageSettings.offerRestart"
    />
    <OutputLanguageSettingsRow
      :preference="outputLanguageSettings.preference.value"
      :items="outputLanguageSettings.items"
      :busy="outputLanguageSettings.busy.value"
      :reading="outputLanguageSettings.reading.value"
      :loaded="outputLanguageSettings.loaded.value"
      :error="outputLanguageSettings.saveError.value"
      :read-error="outputLanguageSettings.readError.value"
      @refresh-preference="outputLanguageSettings.refresh"
      @set-preference="outputLanguageSettings.setPreference"
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
