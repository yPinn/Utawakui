<script setup>
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import {
  Ellipsis,
  ExternalLink,
  FolderOpen,
  Info,
  RefreshCw,
  RotateCcw,
} from '../icons/index.js';
import AppUpdateSettingsRow from '../components/settings/AppUpdateSettingsRow.vue';
import AudioOutputSettingsBlock from '../components/settings/AudioOutputSettingsBlock.vue';
import CaptureDeviceModal from '../components/settings/CaptureDeviceModal.vue';
import DiagnosticsSettingsRow from '../components/settings/DiagnosticsSettingsRow.vue';
import FeedbackReportModal from '../components/settings/FeedbackReportModal.vue';
import FeedbackReportSettingsRow from '../components/settings/FeedbackReportSettingsRow.vue';
import FfmpegSourceModal from '../components/settings/FfmpegSourceModal.vue';
import LibraryMetadataSettingsRow from '../components/settings/LibraryMetadataSettingsRow.vue';
import LibraryStorageSettingsRow from '../components/settings/LibraryStorageSettingsRow.vue';
import MusicAnalysisSettingsRow from '../components/settings/MusicAnalysisSettingsRow.vue';
import ObsIntegrationSettingsBlock from '../components/settings/ObsIntegrationSettingsBlock.vue';
import ObsSessionExportModal from '../components/settings/ObsSessionExportModal.vue';
import PlaybackHistorySettingsRow from '../components/settings/PlaybackHistorySettingsRow.vue';
import SeparationGpuSettingsRow from '../components/settings/SeparationGpuSettingsRow.vue';
import SettingsActionRow from '../components/settings/SettingsActionRow.vue';
import SettingsBlock from '../components/settings/SettingsBlock.vue';
import SettingsFeatureGateRow from '../components/settings/SettingsFeatureGateRow.vue';
import UiContextMenu from '../components/ui/UiContextMenu.vue';
import UiHint from '../components/ui/UiHint.vue';
import UiIconButton from '../components/ui/UiIconButton.vue';
import UiNotice from '../components/ui/UiNotice.vue';
import UiScrollRegion from '../components/ui/UiScrollRegion.vue';
import WindowsBackgroundSettingsRow from '../components/settings/WindowsBackgroundSettingsRow.vue';
import {
  FEATURE_DEPENDENCY_IDS,
  getFeatureDependencies,
  isKnownFeatureDependency,
} from '../constants/featureDependencies.js';
import { FEATURE_IDS } from '../constants/featureGates.js';
import { useFeatureDependencies } from '../composables/useFeatureDependencies.js';
import { useFeatureGateAccess } from '../composables/useFeatureGateAccess.js';
import { useFeatureGatePresentation } from '../composables/useFeatureGatePresentation.js';
import { useFeatureGates } from '../composables/useFeatureGates.js';
import { useFeedbackReport } from '../composables/useFeedbackReport.js';
import { useImportSession } from '../composables/useImportSession.js';
import { useAppAnnouncement } from '../composables/useAppAnnouncement.js';
import { useAppInfo } from '../composables/useAppInfo.js';
import { useAppDiagnostics } from '../composables/useAppDiagnostics.js';
import { useAppUpdate } from '../composables/useAppUpdate.js';
import { useAudioOutput } from '../composables/useAudioOutput.js';
import { useLibraryMetadataMaintenance } from '../composables/useLibraryMetadataMaintenance.js';
import { useLibraryStorage } from '../composables/useLibraryStorage.js';
import { useMusicAnalysisSettings } from '../composables/useMusicAnalysisSettings.js';
import { useObsIntegrationSettings } from '../composables/useObsIntegrationSettings.js';
import { useObsSessionExport } from '../composables/useObsSessionExport.js';
import { useSeparationSettings } from '../composables/useSeparationSettings.js';
import { usePersistentDiagnostics } from '../composables/usePersistentDiagnostics.js';
import { usePlaybackHistory } from '../composables/usePlaybackHistory.js';
import { usePlayer } from '../composables/usePlayer.js';
import { useWindowsIntegrationSettings } from '../composables/useWindowsIntegrationSettings.js';

const {
  state: importState,
  refreshConfig,
  chooseDownloadDir,
  resetDownloadDir,
  openDownloadDir,
} = useImportSession();
const {
  state: persistentDiagnosticsState,
  refresh: refreshDiagnostics,
  clear: clearDiagnostics,
  openFolder: openDiagnosticsFolder,
  exportBundle: exportDiagnostics,
} = usePersistentDiagnostics();
const { recordError, recentRecords: recentDiagnosticRecords } =
  useAppDiagnostics();
const feedback = useFeedbackReport();
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
const {
  state: libraryMetadataMaintenanceState,
  message: libraryMetadataMaintenanceMessage,
  run: runLibraryMetadataMaintenance,
} = useLibraryMetadataMaintenance();
const {
  state: featureGateState,
  isFeatureEnabled,
  refreshConfirmations,
} = useFeatureGates();
const { state: featureGateAccessState, clearFeatureGateRequest } =
  useFeatureGateAccess();
const {
  state: featureDependencyState,
  refreshDependencies,
  prepareDependency,
  removeDependency,
  repairDependency,
} = useFeatureDependencies();
const musicAnalysisSettings = useMusicAnalysisSettings();
const libraryStorage = useLibraryStorage();
const separationSettings = useSeparationSettings();
const obsIntegrationSettings = useObsIntegrationSettings();
const obsSessionExport = useObsSessionExport();
const windowsIntegrationSettings = useWindowsIntegrationSettings();
const {
  state: playbackHistoryState,
  recentItems,
  initialize: initializePlaybackHistory,
  clear: clearPlaybackHistory,
} = usePlaybackHistory();

const maintenanceMessage = shallowRef('');
const maintenanceTone = shallowRef('muted');
const isClearingPlaybackHistory = shallowRef(false);
const downloadDirUnavailableMessage = computed(() =>
  importState.isDefaultDir
    ? '無法建立預設資料夾。請選擇其他位置。'
    : '設定已保留。請重新連接磁碟，或選擇其他位置。',
);

// Overflow menu for the less-frequent 曲庫位置 actions — same
// open/position/select shape as SettingsDependencyActions.vue's menu,
// inlined here since this is the only settings row (so far) that needs a
// menu but isn't a dependency workflow item.
const isDownloadDirMenuOpen = shallowRef(false);
const downloadDirMenuX = shallowRef(0);
const downloadDirMenuY = shallowRef(0);
const downloadDirMenuItems = computed(() => [
  { id: 'choose', icon: FolderOpen, label: '選擇其他資料夾', value: 'choose' },
  {
    id: 'reset',
    icon: RotateCcw,
    label: '還原預設資料夾',
    value: 'reset',
    disabled: importState.isDefaultDir,
  },
]);

function openCommunityDiscord() {
  window.Utawakui?.openExternalTarget?.('community-discord');
}

function openDownloadDirMenu(event) {
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  downloadDirMenuX.value = rect.right;
  downloadDirMenuY.value = rect.bottom + 4;
  isDownloadDirMenuOpen.value = true;
}

function closeDownloadDirMenu() {
  isDownloadDirMenuOpen.value = false;
}

function handleDownloadDirMenuSelect(actionId) {
  closeDownloadDirMenu();
  if (actionId === 'choose') chooseDownloadDir();
  else if (actionId === 'reset') resetDownloadDir();
}

// Capture (OBS-facing) output device — see usePlayer.js's capture chain.
// state.captureDeviceId/captureError live on usePlayer() (the audio graph
// owns them); device enumeration/persistence lives on useAudioOutput().
// The picker itself is a modal (CaptureDeviceModal.vue), not a context
// menu — real device names run too long for a menu's width without
// ellipsis-truncating them into indistinguishable labels, and picking the
// wrong one silently breaks capture.
const { state: playerState } = usePlayer();
const { devices: captureOutputDevices, captureErrorNotice } = useAudioOutput();

const isCaptureDeviceModalOpen = shallowRef(false);

const captureDeviceLabel = computed(() => {
  if (!playerState.captureDeviceId) return '未選擇';
  const device = captureOutputDevices.value.find(
    (d) => d.deviceId === playerState.captureDeviceId,
  );
  return device?.label || '裝置名稱無法讀取';
});

// One-shot mount-time probe (see refreshSettingsState below) shared by the
// compact ffmpeg row's "可用系統版本" hint and FfmpegSourceModal.vue's
// initial content — a manual re-detect inside the modal has its own local
// state and doesn't write back here.
const systemFfmpegDetection = shallowRef(null);
const isFfmpegSourceModalOpen = shallowRef(false);

const {
  featureGateRows,
  enabledGateCount,
  enableFeature,
  gateActionLabel,
  isGateActionDisabled,
  DEPENDENCY_ADVANCED_ACTIONS,
} = useFeatureGatePresentation({ systemFfmpegDetection });

function isDependencyInstalled(dependencyId) {
  return Boolean(featureDependencyState.byId[dependencyId]?.installed);
}

function isSetupRequestResolved(request = featureGateAccessState.request) {
  if (request?.kind !== 'setup') return false;
  const dependencyId = request.context?.dependencyId;
  if (dependencyId) return isDependencyInstalled(dependencyId);

  const dependencies = getFeatureDependencies(request.featureId);
  return (
    dependencies.length > 0 &&
    dependencies.every((dependency) => isDependencyInstalled(dependency.id))
  );
}

function clearResolvedSetupRequest() {
  const request = featureGateAccessState.request;
  if (isSetupRequestResolved(request)) {
    clearFeatureGateRequest(request.featureId);
  }
}

const featureGateRequestNotice = computed(() => {
  const request = featureGateAccessState.request;
  if (
    !request ||
    (request.kind !== 'setup' && isFeatureEnabled(request.featureId))
  ) {
    return null;
  }
  return {
    title: request.title,
    message: request.message,
    actionLabel: request.actionLabel,
    kind: request.kind,
  };
});

async function detectSystemFfmpeg() {
  if (
    typeof window === 'undefined' ||
    typeof window.Utawakui?.detectSystemFfmpeg !== 'function'
  ) {
    return;
  }
  try {
    systemFfmpegDetection.value = await window.Utawakui.detectSystemFfmpeg();
  } catch {
    // Best-effort hint only — a failed probe just means the row/modal
    // stay in their "尚未偵測" state, not a user-facing error.
  }
}

async function refreshSettingsState() {
  detectSystemFfmpeg();
  refreshAppInfo();
  refreshAppUpdateStatus();
  refreshAppUpdateAutoCheck();
  try {
    await refreshConfig();
  } catch (err) {
    maintenanceMessage.value = recordError(err, {
      code: 'SETTINGS_LOAD_FAILED',
      title: '設定讀取失敗',
      message: '目前無法讀取設定，請再試一次。',
      source: 'settings',
      operation: 'load',
      context: { retryable: true },
    }).message;
    maintenanceTone.value = 'danger';
  }
  refreshConfirmations();
  refreshDependencies();
  refreshDiagnostics();
  initializePlaybackHistory();
  libraryStorage.initialize();
  musicAnalysisSettings.initialize();
  separationSettings.refreshPreference();
  obsIntegrationSettings.refreshSettings();
  windowsIntegrationSettings.refreshPreference();
}

async function handleRemoveMusicAnalysis() {
  const confirmed =
    typeof window === 'undefined' ||
    window.confirm('移除 BPM 分析元件？歌曲與既有分析資料都會保留。');
  if (!confirmed) return;

  await musicAnalysisSettings.remove();
}

async function handleClearObsPassword() {
  const confirmed =
    typeof window === 'undefined' ||
    window.confirm('移除這台電腦上已儲存的 OBS 密碼？');
  if (confirmed) await obsIntegrationSettings.clearPassword();
}

async function handleClearDiagnostics() {
  const confirmed =
    typeof window === 'undefined' ||
    window.confirm('清除這台電腦上的錯誤紀錄？');
  if (confirmed) await clearDiagnostics();
}

async function handleClearPlaybackHistory() {
  const confirmed =
    typeof window === 'undefined' ||
    window.confirm(
      '清除這台電腦上的最近播放紀錄？這不會影響播放佇列、歌單、OBS 場次紀錄或錯誤紀錄。',
    );
  if (!confirmed) return;

  isClearingPlaybackHistory.value = true;
  try {
    await clearPlaybackHistory();
  } finally {
    isClearingPlaybackHistory.value = false;
  }
}

async function handleCleanupLibraryStorage() {
  const confirmed =
    typeof window === 'undefined' ||
    window.confirm('清理去人聲版本？歌曲保留。');
  if (confirmed) await libraryStorage.cleanup();
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

// The diagnostics overflow menu's "回報問題" entry pre-selects a bug report
// and hands the most recent renderer-caught error to the modal as a
// starting point — the user can still edit or delete it before sending.
function handleReportIssueFromDiagnostics() {
  feedback.openReport({
    kind: 'bug',
    errorRecord: recentDiagnosticRecords.value?.[0],
  });
}

async function refreshDependencyStatus() {
  await refreshDependencies();
  clearResolvedSetupRequest();
}

async function handleWorkflowItemAction(itemId) {
  if (itemId === FEATURE_DEPENDENCY_IDS.FFMPEG_GYAN_ESSENTIALS) {
    isFfmpegSourceModalOpen.value = true;
    return;
  }
  if (
    itemId === FEATURE_DEPENDENCY_IDS.YTDLP_PROVIDER_TOOL &&
    featureDependencyState.byId[itemId]?.installed
  ) {
    await repairDependency(itemId);
    await refreshDependencyStatus();
    return;
  }
  if (isKnownFeatureDependency(itemId)) {
    await prepareDependency(itemId);
    clearResolvedSetupRequest();
  }
}

async function handleWorkflowItemAdvancedAction({ item, action }) {
  if (!isKnownFeatureDependency(item.id)) return;

  if (action === DEPENDENCY_ADVANCED_ACTIONS.REFRESH) {
    await refreshDependencyStatus();
    return;
  }

  if (action === DEPENDENCY_ADVANCED_ACTIONS.REPAIR) {
    await repairDependency(item.id);
    await refreshDependencyStatus();
    clearResolvedSetupRequest();
    return;
  }

  if (action === DEPENDENCY_ADVANCED_ACTIONS.REMOVE) {
    const itemTitle = item.title || item.name;
    const confirmed =
      typeof window === 'undefined' ||
      window.confirm(`移除「${itemTitle}」？需要時可重新準備。`);
    if (!confirmed) return;
    await removeDependency(item.id);
    await refreshDependencyStatus();
  }
}

function handleFeatureDependencyNoticeAction() {
  const notice = featureDependencyState.error;
  if (!notice) return;
  if (notice.operation === 'prepare' && notice.context?.dependencyId) {
    prepareDependency(notice.context.dependencyId);
    return;
  }
  refreshDependencies();
}

function handleFeatureGateRequestAction() {
  const request = featureGateAccessState.request;
  if (!request) return;
  if (request.kind === 'setup') {
    refreshDependencies().then(clearResolvedSetupRequest);
    return;
  }
  enableFeature(request.featureId);
}

onMounted(refreshSettingsState);
onUnmounted(() => {
  libraryStorage.dispose();
  musicAnalysisSettings.dispose();
});
</script>

<template>
  <div class="settings-view">
    <UiScrollRegion
      class="settings-view__scroll"
      axis="vertical"
      viewport-class="settings-view__viewport"
    >
      <div class="settings-view__grid">
        <div class="settings-view__column">
          <SettingsBlock title="曲庫與儲存">
            <SettingsActionRow
              :icon="FolderOpen"
              title="曲庫位置"
              :value="importState.downloadDir || '讀取中'"
              :status="
                !importState.isDownloadDirAvailable
                  ? '無法使用'
                  : importState.isDefaultDir
                    ? '預設'
                    : '自訂'
              "
              :status-tone="
                !importState.isDownloadDirAvailable
                  ? 'danger'
                  : importState.isDefaultDir
                    ? 'muted'
                    : 'accent'
              "
              tooltip="下載與匯入的曲目會存放在這裡。"
            >
              <template #actions>
                <UiIconButton
                  :icon="FolderOpen"
                  label="開啟曲庫資料夾"
                  :disabled="!importState.isDownloadDirAvailable"
                  @click="openDownloadDir"
                />
                <UiIconButton
                  :icon="Ellipsis"
                  label="曲庫位置其他操作"
                  aria-haspopup="menu"
                  :aria-expanded="isDownloadDirMenuOpen ? 'true' : 'false'"
                  @click="openDownloadDirMenu"
                />
                <UiContextMenu
                  :open="isDownloadDirMenuOpen"
                  :x="downloadDirMenuX"
                  :y="downloadDirMenuY"
                  :width="184"
                  align-x="right"
                  :items="downloadDirMenuItems"
                  empty-text="沒有可用的操作"
                  @select="handleDownloadDirMenuSelect"
                  @close="closeDownloadDirMenu"
                />
              </template>
            </SettingsActionRow>

            <UiNotice
              v-if="!importState.isDownloadDirAvailable"
              tone="danger"
              title="曲庫位置無法使用"
              :message="downloadDirUnavailableMessage"
              action-label="選擇其他資料夾"
              compact
              @action="chooseDownloadDir"
            />

            <LibraryStorageSettingsRow
              :storage="libraryStorage.storage.value"
              :policy="libraryStorage.policy.value"
              :loading="libraryStorage.loading.value"
              :saving="libraryStorage.saving.value"
              :cleaning="libraryStorage.cleaning.value"
              :error="libraryStorage.error.value"
              :last-cleanup="libraryStorage.lastCleanup.value"
              @set-policy="libraryStorage.setPolicy"
              @cleanup="handleCleanupLibraryStorage"
            />

            <LibraryMetadataSettingsRow
              :is-running="libraryMetadataMaintenanceState.isRunning"
              :message="libraryMetadataMaintenanceMessage"
              :error="libraryMetadataMaintenanceState.error"
              @run="runLibraryMetadataMaintenance"
            />

            <PlaybackHistorySettingsRow
              :record-count="recentItems.length"
              :is-loading="!playbackHistoryState.isInitialized"
              :is-clearing="isClearingPlaybackHistory"
              :error="playbackHistoryState.error ?? ''"
              @clear="handleClearPlaybackHistory"
            />

            <UiNotice
              v-if="maintenanceMessage && maintenanceTone === 'danger'"
              tone="danger"
              title="維護操作未完成"
              :message="maintenanceMessage"
              compact
            />
            <UiHint
              v-else-if="maintenanceMessage"
              :tone="maintenanceTone"
              role="status"
            >
              {{ maintenanceMessage }}
            </UiHint>
          </SettingsBlock>

          <AudioOutputSettingsBlock
            :enabled="Boolean(playerState.captureDeviceId)"
            :device-label="captureDeviceLabel"
            :error-notice="captureErrorNotice"
            @select-device="isCaptureDeviceModalOpen = true"
          />

          <SettingsBlock title="應用程式">
            <WindowsBackgroundSettingsRow
              :behavior="windowsIntegrationSettings.windowCloseBehavior.value"
              :busy="windowsIntegrationSettings.preferenceBusy.value"
              :error="windowsIntegrationSettings.preferenceError.value"
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
              :auto-check-error="appUpdateState.autoCheckError"
              @check="checkForAppUpdate"
              @download="downloadAppUpdate"
              @install="installAppUpdate"
              @set-auto-check="setAppUpdateAutoCheck"
            />
          </SettingsBlock>

          <SettingsBlock title="支援與維護">
            <SettingsActionRow
              :icon="Info"
              title="版本公告"
              :value="`v${announcement.version}`"
              :tooltip="announcement.summary"
            >
              <template #actions>
                <UiIconButton
                  :icon="Info"
                  label="查看版本公告"
                  @click="announcement.reopen"
                />
              </template>
            </SettingsActionRow>

            <SettingsActionRow
              :icon="ExternalLink"
              title="社群 Discord"
              tooltip="在 Discord 查看公告、分享心得，或直接和開發者討論使用回饋。"
            >
              <template #actions>
                <UiIconButton
                  :icon="ExternalLink"
                  label="開啟社群 Discord"
                  @click="openCommunityDiscord"
                />
              </template>
            </SettingsActionRow>

            <FeedbackReportSettingsRow @open="feedback.openReport()" />
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
          </SettingsBlock>
        </div>

        <div class="settings-view__column">
          <SettingsBlock
            title="功能與相依能力"
            summary="額外元件只在需要時下載。"
            :status="`${enabledGateCount} / ${featureGateRows.length}`"
            status-tone="gated"
          >
            <template #actions>
              <UiIconButton
                :icon="RefreshCw"
                :disabled="featureGateState.isLoading"
                label="重新讀取功能狀態"
                @click="refreshConfirmations"
              />
            </template>

            <UiNotice
              v-if="featureGateRequestNotice"
              tone="warning"
              :title="featureGateRequestNotice.title"
              :message="featureGateRequestNotice.message"
              :action-label="featureGateRequestNotice.actionLabel"
              compact
              @action="handleFeatureGateRequestAction"
            />

            <SettingsFeatureGateRow
              v-for="gate in featureGateRows"
              :key="gate.id"
              :gate="gate"
              :items="gate.items"
              :highlighted="
                featureGateAccessState.request?.featureId === gate.id &&
                (featureGateAccessState.request?.kind === 'setup' ||
                  !gate.enabled)
              "
              :action-label="gateActionLabel(gate)"
              :disable-enable-action="isGateActionDisabled(gate)"
              @enable="enableFeature"
              @item-action="handleWorkflowItemAction"
              @item-advanced-action="handleWorkflowItemAdvancedAction"
            >
              <template #items>
                <MusicAnalysisSettingsRow
                  v-if="
                    gate.id === FEATURE_IDS.AUDIO_PROCESSING_FLOW &&
                    gate.enabled
                  "
                  :capability="musicAnalysisSettings.capability.value"
                  :auto-analyze="musicAnalysisSettings.autoAnalyze.value"
                  :capability-busy="musicAnalysisSettings.capabilityBusy.value"
                  :preference-busy="musicAnalysisSettings.preferenceBusy.value"
                  :stage-label="musicAnalysisSettings.stageLabel.value"
                  :capability-error="
                    musicAnalysisSettings.capabilityError.value
                  "
                  :preference-error="
                    musicAnalysisSettings.preferenceError.value
                  "
                  @set-auto-analyze="musicAnalysisSettings.setAutoAnalyze"
                  @prepare="musicAnalysisSettings.prepare"
                  @repair="musicAnalysisSettings.repair"
                  @remove="handleRemoveMusicAnalysis"
                />
                <SeparationGpuSettingsRow
                  v-if="
                    gate.id === FEATURE_IDS.AUDIO_PROCESSING_FLOW &&
                    gate.enabled
                  "
                  :gpu-acceleration="separationSettings.gpuAcceleration.value"
                  :preference-busy="separationSettings.preferenceBusy.value"
                  :preference-error="separationSettings.preferenceError.value"
                  @set-gpu-acceleration="separationSettings.setGpuAcceleration"
                />
                <ObsIntegrationSettingsBlock
                  v-if="
                    gate.id === FEATURE_IDS.OBS_INTEGRATION &&
                    (gate.enabled ||
                      obsIntegrationSettings.hasStoredPassword.value)
                  "
                  :status="obsIntegrationSettings.status"
                  :feature-enabled="gate.enabled"
                  :host="obsIntegrationSettings.host.value"
                  :port="obsIntegrationSettings.port.value"
                  :password="obsIntegrationSettings.password.value"
                  :skip-threshold-seconds="
                    obsIntegrationSettings.skipThresholdSeconds.value
                  "
                  :has-stored-password="
                    obsIntegrationSettings.hasStoredPassword.value
                  "
                  :is-saving="obsIntegrationSettings.isSaving.value"
                  :error="obsIntegrationSettings.error.value"
                  @update:host="obsIntegrationSettings.host.value = $event"
                  @update:port="obsIntegrationSettings.port.value = $event"
                  @update:password="
                    obsIntegrationSettings.password.value = $event
                  "
                  @update:skip-threshold-seconds="
                    obsIntegrationSettings.skipThresholdSeconds.value = $event
                  "
                  @save="obsIntegrationSettings.save"
                  @clear-password="handleClearObsPassword"
                  @retry-connect="obsIntegrationSettings.retryConnect"
                  @export-chapters="obsSessionExport.open()"
                />
              </template>
            </SettingsFeatureGateRow>

            <UiNotice
              v-if="featureGateState.error"
              tone="danger"
              title="功能啟用失敗"
              :message="featureGateState.error"
              compact
            />

            <UiNotice
              v-if="featureDependencyState.error"
              :notice="featureDependencyState.error"
              compact
              @action="handleFeatureDependencyNoticeAction"
            />
          </SettingsBlock>
        </div>
      </div>
    </UiScrollRegion>

    <CaptureDeviceModal
      :open="isCaptureDeviceModalOpen"
      @close="isCaptureDeviceModalOpen = false"
    />

    <FeedbackReportModal />

    <ObsSessionExportModal />

    <FfmpegSourceModal
      :open="isFfmpegSourceModalOpen"
      :initial-detection="systemFfmpegDetection"
      @close="isFfmpegSourceModalOpen = false"
    />
  </div>
</template>

<style scoped>
.settings-view {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
}

.settings-view__scroll {
  min-height: 0;
}

.settings-view__grid {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, var(--ui-settings-column-min-width)), 1fr)
  );
  gap: var(--ui-space-5);
  align-content: start;
}

.settings-view__column {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-settings-column-gap);
}
</style>
