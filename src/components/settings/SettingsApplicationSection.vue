<script setup>
import { onMounted } from 'vue';
import { useAppInfo } from '../../composables/useAppInfo.js';
import { useAppUpdate } from '../../composables/useAppUpdate.js';
import { useWindowsIntegrationSettings } from '../../composables/useWindowsIntegrationSettings.js';
import SettingsSection from './SettingsSection.vue';
import AppUpdateSettingsRow from './AppUpdateSettingsRow.vue';
import WindowsBackgroundSettingsRow from './WindowsBackgroundSettingsRow.vue';

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

onMounted(() => {
  refreshAppInfo();
  refreshAppUpdateStatus();
  refreshAppUpdateAutoCheck();
  windowsIntegrationSettings.refreshPreference();
});
</script>

<template>
  <SettingsSection
    id="settings-application"
    class="settings-application-section"
    title="應用程式"
    tabindex="-1"
  >
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
