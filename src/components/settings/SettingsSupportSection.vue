<script setup>
import { onMounted } from 'vue';
import { ExternalLink, Info } from '../../icons/index.js';
import { useAppAnnouncement } from '../../composables/useAppAnnouncement.js';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useAppDiagnostics } from '../../composables/useAppDiagnostics.js';
import { useAutoErrorReportingSetting } from '../../composables/useAutoErrorReport.js';
import { useFeedbackReport } from '../../composables/useFeedbackReport.js';
import { usePersistentDiagnostics } from '../../composables/usePersistentDiagnostics.js';
import SettingsSection from './SettingsSection.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import DiagnosticsSettingsRow from './DiagnosticsSettingsRow.vue';
import AutoErrorReportingSettingsRow from './AutoErrorReportingSettingsRow.vue';
import FeedbackReportSettingsRow from './FeedbackReportSettingsRow.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';

const {
  state: persistentDiagnosticsState,
  refresh: refreshDiagnostics,
  clear: clearDiagnostics,
  openFolder: openDiagnosticsFolder,
  exportBundle: exportDiagnostics,
} = usePersistentDiagnostics();
const { recentRecords: recentDiagnosticRecords } = useAppDiagnostics();
const { confirm: confirmAction } = useAppConfirmation();
const feedback = useFeedbackReport();
const autoErrorReporting = useAutoErrorReportingSetting();
const announcement = useAppAnnouncement();

function openCommunityDiscord() {
  window.Utawakui?.openExternalTarget?.('community-discord');
}

async function handleClearDiagnostics() {
  const confirmed = await confirmAction({
    title: '清除錯誤紀錄？',
    message: '已儲存的錯誤紀錄會被清除。',
    detail: '此動作無法復原。',
    confirmLabel: '清除紀錄',
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

function handleReportIssueFromDiagnostics() {
  feedback.openReport({
    kind: 'bug',
    errorRecord: recentDiagnosticRecords.value?.[0],
  });
}

onMounted(() => {
  refreshDiagnostics();
  autoErrorReporting.refreshPreference();
});
</script>

<template>
  <SettingsSection
    id="settings-support"
    class="settings-support-section"
    title="支援與維護"
    tabindex="-1"
  >
    <SettingsDocumentItem
      :icon="Info"
      title="版本公告"
      :value="`v${announcement.version}`"
      :guidance="announcement.summary"
    >
      <template #actions>
        <UiIconButton
          :icon="Info"
          label="查看版本公告"
          @click="announcement.reopen"
        />
      </template>
    </SettingsDocumentItem>

    <SettingsDocumentItem
      :icon="ExternalLink"
      title="社群 Discord"
      guidance="公告、交流與開發者聯絡。"
    >
      <template #actions>
        <UiIconButton
          :icon="ExternalLink"
          label="開啟社群 Discord"
          @click="openCommunityDiscord"
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
      @report-issue="handleReportIssueFromDiagnostics"
    />
  </SettingsSection>
</template>
