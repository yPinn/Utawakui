<script setup>
import { computed, onMounted, shallowRef } from 'vue';
import {
  CircleAlert,
  Ellipsis,
  FolderOpen,
  ListChecks,
  RefreshCw,
  RotateCcw,
} from '../icons/index.js';
import SettingsActionRow from '../components/settings/SettingsActionRow.vue';
import SettingsBlock from '../components/settings/SettingsBlock.vue';
import SettingsFeatureGateRow from '../components/settings/SettingsFeatureGateRow.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiContextMenu from '../components/ui/UiContextMenu.vue';
import UiHint from '../components/ui/UiHint.vue';
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
import { useAppDiagnostics } from '../composables/useAppDiagnostics.js';
import { useLibrary } from '../composables/useLibrary.js';
import { useYtdlpStatus } from '../composables/useYtdlpStatus.js';
import packageJson from '../../package.json';

const {
  state: importState,
  refreshConfig,
  chooseDownloadDir,
  resetDownloadDir,
  openDownloadDir,
} = useImportSession();
const { state: diagnosticsState } = useAppDiagnostics();
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
const {
  state: ytdlpState,
  refreshStatus: refreshYtdlpStatus,
  checkForUpdate: checkYtdlpUpdate,
} = useYtdlpStatus();

const isRefreshingMetadata = shallowRef(false);
const maintenanceMessage = shallowRef('');
const maintenanceTone = shallowRef('muted');
const ytdlpMessage = shallowRef('');

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

const {
  featureGateRows,
  enabledGateCount,
  enableFeature,
  gateActionLabel,
  isGateActionDisabled,
  DEPENDENCY_ADVANCED_ACTIONS,
} = useFeatureGatePresentation({ ytdlpMessage });

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

const diagnosticsRows = computed(() => {
  const recordCount = diagnosticsState.records.length;
  return [
    {
      id: 'runtime-log',
      icon: ListChecks,
      title: '使用記錄',
      description: '保留近期操作與錯誤狀態，協助排查播放、匯入或音訊處理問題。',
      value: recordCount > 0 ? `${recordCount} 筆近期記錄` : '尚無近期記錄',
      status: recordCount > 0 ? '已記錄' : '待命',
      tone: recordCount > 0 ? 'warning' : 'muted',
    },
    {
      id: 'error-report-bundle',
      icon: CircleAlert,
      title: '回報資料包',
      description: '整理必要的錯誤資訊與環境摘要；不包含你的音樂檔案。',
      value: '不含媒體檔案',
      status: '待開放',
      tone: 'gated',
    },
  ];
});

const appUpdateRows = [
  {
    id: 'app-version',
    icon: RefreshCw,
    title: 'Utawakui 版本',
    description: '檢查是否有新版安裝程式可用。',
    value: packageJson.version ? `v${packageJson.version}` : '目前版本',
    status: '待開放',
    tone: 'warning',
  },
];

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
    maintenanceMessage.value = `重新整理失敗：${err.message}`;
    maintenanceTone.value = 'danger';
  } finally {
    isRefreshingMetadata.value = false;
  }
}

async function refreshSettingsState() {
  try {
    await refreshConfig();
  } catch (err) {
    maintenanceMessage.value = `讀取設定失敗：${err.message}`;
    maintenanceTone.value = 'danger';
  }
  refreshConfirmations();
  refreshDependencies();
  refreshYtdlpStatus();
}

async function refreshDependencyStatus(itemId) {
  await refreshDependencies();
  if (itemId === FEATURE_DEPENDENCY_IDS.YTDLP_PROVIDER_TOOL) {
    await refreshYtdlpStatus();
  }
  clearResolvedSetupRequest();
}

async function checkForYtdlpUpdate() {
  ytdlpMessage.value = '';
  await checkYtdlpUpdate();
  if (ytdlpState.error || ytdlpState.lastCheckResult === 'error') {
    ytdlpMessage.value = ytdlpState.error || '檢查更新失敗，請確認網路連線';
    return;
  }
  ytdlpMessage.value =
    ytdlpState.lastCheckResult === 'updated'
      ? `已更新至 ${ytdlpState.version}`
      : '已是最新版本';
}

async function handleWorkflowItemAction(itemId) {
  if (
    itemId === FEATURE_DEPENDENCY_IDS.YTDLP_PROVIDER_TOOL &&
    featureDependencyState.byId[itemId]?.installed
  ) {
    await checkForYtdlpUpdate();
    return;
  }
  if (isKnownFeatureDependency(itemId)) {
    await prepareDependency(itemId);
    if (itemId === FEATURE_DEPENDENCY_IDS.YTDLP_PROVIDER_TOOL) {
      await refreshYtdlpStatus();
    }
    clearResolvedSetupRequest();
  }
}

async function handleWorkflowItemAdvancedAction({ item, action }) {
  if (!isKnownFeatureDependency(item.id)) return;

  if (action === DEPENDENCY_ADVANCED_ACTIONS.REFRESH) {
    await refreshDependencyStatus(item.id);
    return;
  }

  if (action === DEPENDENCY_ADVANCED_ACTIONS.REPAIR) {
    await repairDependency(item.id);
    await refreshDependencyStatus(item.id);
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
    await refreshDependencyStatus(item.id);
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
            本機內容與診斷
          </h2>
          <p class="settings-view__column-summary">
            曲庫位置、更新檢查與維護工具
          </p>
        </header>

        <SettingsBlock title="本機曲庫" status="本機" status-tone="success">
          <SettingsActionRow
            :icon="FolderOpen"
            title="曲庫位置"
            :value="importState.downloadDir || '讀取中'"
            :status="importState.isDefaultDir ? '預設' : '自訂'"
            :status-tone="importState.isDefaultDir ? 'muted' : 'accent'"
            tooltip="下載與本機匯入的曲目都會整理到這個資料夾。"
          >
            <template #actions>
              <UiButton
                :icon="FolderOpen"
                aria-label="開啟曲庫資料夾"
                title="開啟曲庫資料夾"
                @click="openDownloadDir"
              />
              <UiButton
                :icon="Ellipsis"
                aria-label="曲庫位置其他操作"
                title="曲庫位置其他操作"
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
            value="已保存的來源資訊"
            :status="isRefreshingMetadata ? '執行中' : '可用'"
            :status-tone="isRefreshingMetadata ? 'info' : 'success'"
            tooltip="從已保存的來源資訊補齊專輯與年份等曲目資訊。"
          >
            <template #actions>
              <UiButton
                :icon="RefreshCw"
                :disabled="isRefreshingMetadata"
                aria-label="重新整理曲目資訊"
                title="重新整理曲目資訊"
                @click="refreshMetadata"
              />
            </template>
          </SettingsActionRow>

          <UiHint
            v-if="maintenanceMessage"
            :tone="maintenanceTone"
            :role="maintenanceTone === 'danger' ? 'alert' : 'status'"
          >
            {{ maintenanceMessage }}
          </UiHint>
        </SettingsBlock>

        <SettingsBlock
          title="應用程式更新"
          status="待開放"
          status-tone="warning"
        >
          <SettingsActionRow
            v-for="row in appUpdateRows"
            :key="row.id"
            :icon="row.icon"
            :title="row.title"
            :value="row.value"
            :status="row.status"
            :status-tone="row.tone"
            :tooltip="row.description"
          >
            <template #actions>
              <UiButton
                :icon="RefreshCw"
                disabled
                aria-disabled="true"
                aria-label="檢查更新稍後提供"
                title="檢查更新稍後提供"
              />
            </template>
          </SettingsActionRow>
        </SettingsBlock>

        <SettingsBlock title="診斷與回報" status="待開放" status-tone="warning">
          <SettingsActionRow
            v-for="row in diagnosticsRows"
            :key="row.id"
            :icon="row.icon"
            :title="row.title"
            :value="row.value"
            :status="row.status"
            :status-tone="row.tone"
            :tooltip="row.description"
          >
            <template #actions>
              <UiButton
                :icon="CircleAlert"
                disabled
                aria-disabled="true"
                aria-label="稍後提供"
                title="稍後提供"
              />
            </template>
          </SettingsActionRow>
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
            <UiButton
              :icon="RefreshCw"
              :disabled="featureGateState.isLoading"
              aria-label="重新讀取功能狀態"
              title="重新讀取功能狀態"
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
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
  gap: var(--ui-space-5);
  align-content: start;
}

.settings-view__column {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-3);
}

.settings-view__column-header {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
  /* On top of the column's own space-3 gap, so the header reads as this
     column's heading — grouped tightly with its own summary line, then set
     apart from the SettingsBlocks below — rather than sitting at the same
     distance as the blocks are from each other. */
  margin-bottom: var(--ui-space-2);
}

.settings-view__column-title,
.settings-view__column-summary {
  margin: 0;
}

.settings-view__column-title {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.settings-view__column-summary {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}
</style>
