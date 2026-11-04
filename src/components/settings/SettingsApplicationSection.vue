<script setup>
import { onMounted } from 'vue';
import { useAppInfo } from '../../composables/useAppInfo.js';
import { useAppUpdate } from '../../composables/useAppUpdate.js';
import { useWindowsIntegrationSettings } from '../../composables/useWindowsIntegrationSettings.js';
import { useUiLanguageSettings } from '../../composables/useUiLanguageSettings.js';
import { useOutputLanguageSettings } from '../../composables/useOutputLanguageSettings.js';
import SettingsSection from './SettingsSection.vue';
import AppUpdateSettingsRow from './AppUpdateSettingsRow.vue';
import WindowsBackgroundSettingsRow from './WindowsBackgroundSettingsRow.vue';
import UiLanguageSettingsRow from './UiLanguageSettingsRow.vue';
import OutputLanguageSettingsRow from './OutputLanguageSettingsRow.vue';
import KeyboardShortcutSettingsBlock from './KeyboardShortcutSettingsBlock.vue';
import { t } from '../../utils/i18n.js';

const { state: appInfoState, refreshAppInfo } = useAppInfo();
const {
  state: appUpdateState,
  refreshAppUpdateStatus,
  checkForAppUpdate,
  downloadAppUpdate,
  installAppUpdate,
  refreshAppUpdateAutoCheck,
  setAppUpdateAutoCheck,
} = useAppUpdate();
const windowsIntegrationSettings = useWindowsIntegrationSettings();
const uiLanguageSettings = useUiLanguageSettings();
const outputLanguageSettings = useOutputLanguageSettings();

onMounted(() => {
  refreshAppInfo();
  refreshAppUpdateStatus();
  refreshAppUpdateAutoCheck();
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
    <KeyboardShortcutSettingsBlock />
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
    <AppUpdateSettingsRow
      :current-version="
        appInfoState.currentVersion || appUpdateState.currentVersion
      "
      :enabled="appUpdateState.enabled"
      :phase="appUpdateState.phase"
      :available-version="appUpdateState.availableVersion"
      :progress="appUpdateState.progress"
      :download-bytes-per-second="appUpdateState.downloadBytesPerSecond"
      :download-eta-seconds="appUpdateState.downloadEtaSeconds"
      :error="appUpdateState.error"
      :info-error="appInfoState.error"
      :auto-check-enabled="appUpdateState.autoCheckEnabled"
      :auto-check-busy="appUpdateState.autoCheckBusy"
      :auto-check-error="appUpdateState.autoCheckSaveError"
      :auto-check-read-error="appUpdateState.autoCheckReadError"
      :auto-check-loaded="appUpdateState.autoCheckLoaded ?? true"
      :auto-check-reading="appUpdateState.autoCheckReading"
      :status-read-error="appUpdateState.statusReadError"
      :action-error="appUpdateState.actionError"
      @refresh-auto-check="refreshAppUpdateAutoCheck"
      @refresh-status="refreshAppUpdateStatus"
      @refresh-info="refreshAppInfo"
      @check="checkForAppUpdate"
      @download="downloadAppUpdate"
      @install="installAppUpdate"
      @set-auto-check="setAppUpdateAutoCheck"
    />
  </SettingsSection>
</template>
