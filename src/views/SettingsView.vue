<script setup>
import { computed, onMounted, shallowRef } from 'vue';
import { Ellipsis, FolderOpen, RefreshCw, RotateCcw } from '../icons/index.js';
import AppUpdateSettingsRow from '../components/settings/AppUpdateSettingsRow.vue';
import AudioOutputSettingsBlock from '../components/settings/AudioOutputSettingsBlock.vue';
import CaptureDeviceModal from '../components/settings/CaptureDeviceModal.vue';
import DiagnosticsSettingsBlock from '../components/settings/DiagnosticsSettingsBlock.vue';
import FfmpegSourceModal from '../components/settings/FfmpegSourceModal.vue';
import SettingsActionRow from '../components/settings/SettingsActionRow.vue';
import SettingsBlock from '../components/settings/SettingsBlock.vue';
import SettingsFeatureGateRow from '../components/settings/SettingsFeatureGateRow.vue';
import UiContextMenu from '../components/ui/UiContextMenu.vue';
import UiHint from '../components/ui/UiHint.vue';
import UiIconButton from '../components/ui/UiIconButton.vue';
import UiNotice from '../components/ui/UiNotice.vue';
import {
  FEATURE_DEPENDENCY_IDS,
  getFeatureDependencies,
  isKnownFeatureDependency,
} from '../constants/featureDependencies.js';
import { useFeatureDependencies } from '../composables/useFeatureDependencies.js';
import { useFeatureGateAccess } from '../composables/useFeatureGateAccess.js';
import { useFeatureGatePresentation } from '../composables/useFeatureGatePresentation.js';
import { useFeatureGates } from '../composables/useFeatureGates.js';
import { useImportSession } from '../composables/useImportSession.js';
import { useAppInfo } from '../composables/useAppInfo.js';
import { useAppDiagnostics } from '../composables/useAppDiagnostics.js';
import { useAppUpdate } from '../composables/useAppUpdate.js';
import { useAudioOutput } from '../composables/useAudioOutput.js';
import { useLibrary } from '../composables/useLibrary.js';
import { usePersistentDiagnostics } from '../composables/usePersistentDiagnostics.js';
import { usePlayer } from '../composables/usePlayer.js';

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
} = usePersistentDiagnostics();
const { recordError } = useAppDiagnostics();
const { state: appInfoState, refreshAppInfo } = useAppInfo();
const {
  state: appUpdateState,
  refreshAppUpdateStatus,
  checkForAppUpdate,
  downloadAppUpdate,
  installAppUpdate,
} = useAppUpdate();
const { refreshMetadata: refreshLibraryMetadata } = useLibrary();
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

const isRefreshingMetadata = shallowRef(false);
const maintenanceMessage = shallowRef('');
const maintenanceTone = shallowRef('muted');

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

async function refreshMetadata() {
  isRefreshingMetadata.value = true;
  maintenanceMessage.value = '';
  maintenanceTone.value = 'muted';
  try {
    const updated = await refreshLibraryMetadata();
    maintenanceMessage.value =
      updated > 0 ? `已補齊 ${updated} 首曲目的專輯資訊` : '沒有需要補齊的資訊';
    maintenanceTone.value = 'success';
  } catch (err) {
    maintenanceMessage.value = recordError(err, {
      code: 'LIBRARY_METADATA_REFRESH_FAILED',
      title: '曲目資訊整理未完成',
      message: '目前無法整理曲目資訊，請再試一次。',
      source: 'settings',
      operation: 'refresh-library-metadata',
      context: { retryable: true },
    }).message;
    maintenanceTone.value = 'danger';
  } finally {
    isRefreshingMetadata.value = false;
  }
}

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
}

async function handleClearDiagnostics() {
  const confirmed =
    typeof window === 'undefined' ||
    window.confirm('清除這台電腦上的使用記錄？');
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
  refreshDiagnostics();
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
      window.confirm(
        `移除「${itemTitle}」的本機準備項目？之後需要時可以再重新準備。`,
      );
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
</script>

<template>
  <div class="settings-view">
    <div class="settings-view__grid">
      <section
        class="settings-view__column"
        aria-labelledby="settings-content-title"
      >
        <header class="settings-view__column-header">
          <h2 id="settings-content-title" class="settings-view__column-title">
            本機設定
          </h2>
        </header>

        <SettingsBlock title="本機曲庫">
          <SettingsActionRow
            :icon="FolderOpen"
            title="曲庫位置"
            :value="importState.downloadDir || '讀取中'"
            :status="importState.isDefaultDir ? '預設' : '自訂'"
            :status-tone="importState.isDefaultDir ? 'muted' : 'accent'"
            tooltip="下載與本機匯入的曲目都會整理到這個資料夾。"
          >
            <template #actions>
              <UiIconButton
                :icon="FolderOpen"
                label="開啟曲庫資料夾"
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

          <SettingsActionRow
            :icon="RefreshCw"
            title="曲目資訊整理"
            value="補齊專輯與年份"
            :status="isRefreshingMetadata ? '執行中' : '可用'"
            :status-tone="isRefreshingMetadata ? 'info' : 'success'"
            tooltip="從已保存的來源資訊補齊專輯與年份等曲目資訊。"
          >
            <template #actions>
              <UiIconButton
                :icon="RefreshCw"
                :disabled="isRefreshingMetadata"
                label="重新整理曲目資訊"
                @click="refreshMetadata"
              />
            </template>
          </SettingsActionRow>

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

        <CaptureDeviceModal
          :open="isCaptureDeviceModalOpen"
          @close="isCaptureDeviceModalOpen = false"
        />

        <FfmpegSourceModal
          :open="isFfmpegSourceModalOpen"
          :initial-detection="systemFfmpegDetection"
          @close="isFfmpegSourceModalOpen = false"
        />

        <SettingsBlock title="維護">
          <DiagnosticsSettingsBlock
            :record-count="persistentDiagnosticsState.recordCount"
            :is-loading="persistentDiagnosticsState.isLoading"
            :notice="persistentDiagnosticsState.notice"
            @refresh="refreshDiagnostics"
            @open-folder="openDiagnosticsFolder"
            @clear="handleClearDiagnostics"
            @notice-action="handleDiagnosticsNoticeAction"
          />

          <AppUpdateSettingsRow
            :current-version="
              appInfoState.currentVersion || appUpdateState.currentVersion
            "
            :enabled="appUpdateState.enabled"
            :phase="appUpdateState.phase"
            :available-version="appUpdateState.availableVersion"
            :progress="appUpdateState.progress"
            :error="appUpdateState.error"
            :info-error="appInfoState.error"
            @check="checkForAppUpdate"
            @download="downloadAppUpdate"
            @install="installAppUpdate"
          />
        </SettingsBlock>
      </section>

      <section
        class="settings-view__column"
        aria-labelledby="settings-status-title"
      >
        <header class="settings-view__column-header">
          <h2 id="settings-status-title" class="settings-view__column-title">
            進階功能準備
          </h2>
          <p class="settings-view__column-summary">
            啟用流程，並準備需要下載的項目
          </p>
        </header>

        <SettingsBlock
          title="進階功能"
          summary="只啟用你需要的流程；工具與模型會列在下方。"
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
          />

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
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  height: 100%;
  min-height: 0;
  overflow: auto;
}

.settings-view__grid {
  min-height: 100%;
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

.settings-view__column-header {
  min-width: 0;
  display: grid;
  gap: var(--ui-settings-column-header-gap);
}

.settings-view__column-title,
.settings-view__column-summary {
  margin: 0;
}

.settings-view__column-title {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-heavy);
  line-height: var(--ui-line-height-headline);
  text-wrap: balance;
}

.settings-view__column-summary {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}
</style>
