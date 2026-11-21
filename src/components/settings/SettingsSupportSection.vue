<script setup>
import { onMounted, shallowRef } from 'vue';
import { ExternalLink, Info, ListChecks } from '../../icons/index.js';
import { useAppAnnouncement } from '../../composables/useAppAnnouncement.js';
import { useAppInfo } from '../../composables/useAppInfo.js';
import { useAppUpdate } from '../../composables/useAppUpdate.js';
import SettingsSection from './SettingsSection.vue';
import TroubleshootingModal from './TroubleshootingModal.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiButton from '../ui/UiButton.vue';
import AppUpdateSettingsRow from './AppUpdateSettingsRow.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

const troubleshootingOpen = shallowRef(false);
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

onMounted(() => {
  refreshAppInfo();
  refreshAppUpdateStatus();
  refreshAppUpdateAutoCheck();
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
    >
      <template #actions>
        <UiIconButton
          :icon="Info"
          :label="t('settings.support.viewAnnouncements')"
          @click="announcement.reopen"
        />
      </template>
    </AppUpdateSettingsRow>

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
    <SettingsDocumentItem
      :icon="ListChecks"
      :title="t('settings.troubleshooting.title')"
    >
      <template #actions>
        <UiButton
          variant="secondary"
          aria-haspopup="dialog"
          @click="troubleshootingOpen = true"
        >
          {{ t('settings.troubleshooting.open') }}
        </UiButton>
      </template>
    </SettingsDocumentItem>
    <TroubleshootingModal
      :open="troubleshootingOpen"
      @close="troubleshootingOpen = false"
    />
  </SettingsSection>
</template>
