<script setup>
import { onMounted } from 'vue';
import { ExternalLink, Info } from '../../icons/index.js';
import { useAppAnnouncement } from '../../composables/useAppAnnouncement.js';
import { useAppInfo } from '../../composables/useAppInfo.js';
import { useAppUpdate } from '../../composables/useAppUpdate.js';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useAutoErrorReportingSetting } from '../../composables/useAutoErrorReport.js';
import { useFeedbackReport } from '../../composables/useFeedbackReport.js';
import { usePersistentDiagnostics } from '../../composables/usePersistentDiagnostics.js';
import SettingsSection from './SettingsSection.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import DiagnosticsSettingsRow from './DiagnosticsSettingsRow.vue';
import AppUpdateSettingsRow from './AppUpdateSettingsRow.vue';
import AutoErrorReportingSettingsRow from './AutoErrorReportingSettingsRow.vue';
import FeedbackReportSettingsRow from './FeedbackReportSettingsRow.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

const {
  state: persistentDiagnosticsState,
  refresh: refreshDiagnostics,
  clear: clearDiagnostics,
  openFolder: openDiagnosticsFolder,
  exportBundle: exportDiagnostics,
} = usePersistentDiagnostics();
const { confirm: confirmAction } = useAppConfirmation();
const feedback = useFeedbackReport();
const autoErrorReporting = useAutoErrorReportingSetting();
const announcement = useAppAnnouncement();
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

function openCommunityDiscord() {
  window.Utawakui?.openExternalTarget?.('community-discord');
}

async function handleClearDiagnostics() {
  const confirmed = await confirmAction({
    title: t('settings.support.clearTitle'),
    message: t('settings.support.clearMessage'),
    detail: t('settings.support.clearDetail'),
    confirmLabel: t('settings.support.clearConfirm'),
    intent: 'danger',
  });
  if (confirmed) await clearDiagnostics();
}

function handleDiagnosticsNoticeAction(operation) {
  if (operation === 'open-folder') {
    openDiagnosticsFolder();
    return;
  }
  if (operation === 'clear') {
    handleClearDiagnostics();
    return;
  }
  if (operation === 'export') {
    exportDiagnostics();
    return;
  }
  refreshDiagnostics();
}

onMounted(() => {
  refreshAppInfo();
  refreshAppUpdateStatus();
  refreshAppUpdateAutoCheck();
  refreshDiagnostics();
  autoErrorReporting.refreshPreference();
});
</script>

<template>
  <SettingsSection
    id="settings-support"
    class="settings-support-section"
    :title="t('settings.sections.support')"
    tabindex="-1"
  >
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
    <SettingsDocumentItem
      :icon="Info"
      :title="t('settings.support.announcements')"
      :value="`v${announcement.version}`"
    >
      <template #actions>
        <UiIconButton
          :icon="Info"
          :label="t('settings.support.viewAnnouncements')"
          @click="announcement.reopen"
        />
      </template>
    </SettingsDocumentItem>

    <FeedbackReportSettingsRow @open="feedback.openReport()" />
    <AutoErrorReportingSettingsRow
      :reporting="autoErrorReporting.reporting.value"
      :busy="autoErrorReporting.preferenceBusy.value"
      :reading="autoErrorReporting.preferenceReading.value"
      :loaded="autoErrorReporting.preferenceLoaded.value"
      :error="autoErrorReporting.preferenceSaveError.value"
      :read-error="autoErrorReporting.preferenceReadError.value"
      @refresh-preference="autoErrorReporting.refreshPreference"
      @set-reporting="autoErrorReporting.setReporting"
    />
    <DiagnosticsSettingsRow
      :record-count="persistentDiagnosticsState.recordCount"
      :is-loading="persistentDiagnosticsState.isLoading"
      :notice="persistentDiagnosticsState.notice"
      @refresh="refreshDiagnostics"
      @open-folder="openDiagnosticsFolder"
      @clear="handleClearDiagnostics"
      @export="exportDiagnostics"
      @notice-action="handleDiagnosticsNoticeAction"
    />

    <SettingsDocumentItem
      :icon="ExternalLink"
      :title="t('settings.support.discord')"
      :guidance="t('settings.support.discordGuidance')"
    >
      <template #actions>
        <UiIconButton
          :icon="ExternalLink"
          :label="t('settings.support.openDiscord')"
          @click="openCommunityDiscord"
        />
      </template>
    </SettingsDocumentItem>
  </SettingsSection>
</template>
