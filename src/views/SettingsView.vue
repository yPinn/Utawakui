<script setup>
import { computed, onMounted, shallowRef } from 'vue';
import {
  CircleAlert,
  Download,
  FolderOpen,
  ListChecks,
  RefreshCw,
  RotateCcw,
  Settings,
  Video,
} from '../icons/index.js';
import SettingsActionRow from '../components/settings/SettingsActionRow.vue';
import SettingsBlock from '../components/settings/SettingsBlock.vue';
import SettingsFeatureGateRow from '../components/settings/SettingsFeatureGateRow.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiHint from '../components/ui/UiHint.vue';
import { getFeatureDependencies } from '../constants/featureDependencies.js';
import { FEATURE_GATES } from '../constants/featureGates.js';
import { useFeatureDependencies } from '../composables/useFeatureDependencies.js';
import { useFeatureGates } from '../composables/useFeatureGates.js';
import { useImportSession } from '../composables/useImportSession.js';
import { useLibrary } from '../composables/useLibrary.js';
import { useYtdlpStatus } from '../composables/useYtdlpStatus.js';
import packageJson from '../../package.json';

const {
  state: importState,
  refreshConfig,
  chooseDownloadDir,
  resetDownloadDir,
} = useImportSession();
const { refreshMetadata: refreshLibraryMetadata } = useLibrary();
const {
  state: featureGateState,
  isFeatureEnabled,
  refreshConfirmations,
  ensureFeatureGate,
} = useFeatureGates();
const {
  state: featureDependencyState,
  refreshDependencies,
  prepareDependency,
} = useFeatureDependencies();
const {
  state: ytdlpState,
  refreshStatus: refreshYtdlpStatus,
  checkForUpdate: checkYtdlpUpdate,
} = useYtdlpStatus();

const isRefreshingMetadata = shallowRef(false);
const maintenanceMessage = shallowRef('');
const maintenanceTone = shallowRef('muted');
const enablingFeatureId = shallowRef(null);
const ytdlpMessage = shallowRef('');

const ytdlpCheckResultLabel = computed(() => {
  if (ytdlpState.lastCheckResult === 'up-to-date') return '已是最新';
  if (ytdlpState.lastCheckResult === 'updated') return '已更新';
  if (ytdlpState.lastCheckResult === 'error') return '檢查失敗';
  return '';
});

const FEATURE_GATE_LABELS = {
  'provider-flow': '外部來源',
  'lyrics-flow': '歌詞來源',
  'audio-processing-flow': '音訊處理',
  'public-output-flow': '對外輸出',
};

const FEATURE_GATE_VALUE_LABELS = {
  'provider-flow': '匯入線上來源',
  'lyrics-flow': '搜尋與保存歌詞',
  'audio-processing-flow': '人聲分離與音訊處理',
  'public-output-flow': 'OBS 畫面與公開輸出',
};

const WORKFLOW_ITEM_GROUP_LABELS = {
  'provider-flow': '下載工具',
  'audio-processing-flow': '需要準備的項目',
  'public-output-flow': '輸出設定',
};

function dependencyWorkflowItem(dependency) {
  const current = featureDependencyState.byId[dependency.id] ?? dependency;
  const isFfmpeg = dependency.id === 'ffmpeg-gyan-essentials';
  const isModel = dependency.kind === 'model';
  const preparing = featureDependencyState.preparingIds.has(dependency.id);
  const installed = Boolean(current.installed);
  const title = isFfmpeg
    ? '音訊轉換工具'
    : isModel
      ? dependency.name
      : dependency.name;
  const status = installed
    ? '已準備'
    : preparing
      ? '準備中'
      : current.canMigrate
        ? '可整理'
        : '尚未準備';
  return {
    ...dependency,
    title,
    description: isFfmpeg
      ? '讓 Utawakui 讀取不同音訊格式，供人聲分離與音訊處理使用。'
      : isModel
        ? '下載後即可在產生人聲分離結果時使用。'
        : '此功能需要先下載的工具或資料。',
    value: dependency.license
      ? `${dependency.version} / ${dependency.license}`
      : dependency.version,
    status,
    statusTone: installed ? 'success' : preparing ? 'info' : 'warning',
    icon: Download,
    actionIcon: Download,
    actionDisabled: installed || preparing,
    actionLabel: installed
      ? `${title}已準備`
      : preparing
        ? `準備${title}中`
        : `準備${title}`,
  };
}

function getProviderWorkflowItems() {
  const hasCheckError =
    ytdlpState.lastCheckResult === 'error' || Boolean(ytdlpState.error);
  return [
    {
      id: 'provider-ytdlp-engine',
      kind: 'tool',
      icon: Download,
      title: '線上來源下載工具',
      description:
        ytdlpMessage.value || '用來把你選定的外部來源保存到本機曲庫。',
      value:
        ytdlpState.version ||
        (ytdlpState.isLoading ? '讀取中' : '尚未讀取版本'),
      status:
        ytdlpCheckResultLabel.value ||
        (ytdlpState.binaryFound ? '可使用' : '找不到工具'),
      statusTone:
        hasCheckError || !ytdlpState.binaryFound ? 'danger' : 'success',
      actionIcon: RefreshCw,
      actionDisabled: ytdlpState.isChecking,
      actionLabel: ytdlpState.isChecking
        ? '檢查下載引擎中'
        : '檢查並更新下載引擎',
    },
  ];
}

function getPublicOutputWorkflowItems() {
  return [
    {
      id: 'public-output-defaults',
      kind: 'planned-setting',
      icon: Video,
      title: 'OBS 輸出預設',
      description: '設定未來 OBS 畫面來源與場次輸出偏好。',
      value: '尚未提供',
      status: '稍後提供',
      statusTone: 'gated',
      actionIcon: Settings,
      actionDisabled: true,
      actionLabel: 'OBS 輸出設定稍後提供',
    },
  ];
}

function getFeatureWorkflowItems(featureId) {
  const dependencyItems = getFeatureDependencies(featureId).map(
    dependencyWorkflowItem,
  );
  if (featureId === 'provider-flow') {
    return [...getProviderWorkflowItems(), ...dependencyItems];
  }
  if (featureId === 'public-output-flow') {
    return [...getPublicOutputWorkflowItems(), ...dependencyItems];
  }
  return dependencyItems;
}

const featureGateRows = computed(() =>
  Object.values(FEATURE_GATES).map((gate) => {
    const enabled = isFeatureEnabled(gate.id);
    const items = getFeatureWorkflowItems(gate.id);
    const isBusy =
      featureGateState.pendingFeatureId === gate.id ||
      enablingFeatureId.value === gate.id;
    return {
      id: gate.id,
      title: FEATURE_GATE_LABELS[gate.id] ?? gate.title,
      description: gate.summary,
      value: FEATURE_GATE_VALUE_LABELS[gate.id] ?? gate.category,
      status: enabled ? '已啟用' : '未啟用',
      tone: enabled ? 'success' : 'gated',
      icon: enabled ? ListChecks : CircleAlert,
      enabled,
      isBusy,
      items,
      itemGroupLabel: WORKFLOW_ITEM_GROUP_LABELS[gate.id] ?? '準備項目',
      itemsHint:
        items.length > 0
          ? '建議在直播前先準備這些項目，避免使用時臨時等待下載或設定。'
          : '',
    };
  }),
);

const enabledGateCount = computed(
  () => featureGateRows.value.filter((row) => row.status === '已啟用').length,
);

const diagnosticsRows = [
  {
    id: 'runtime-log',
    icon: ListChecks,
    title: '使用記錄',
    description: '保留近期操作與錯誤狀態，協助排查播放、匯入或音訊處理問題。',
    value: '尚未提供',
    status: '稍後提供',
    tone: 'warning',
  },
  {
    id: 'error-report-bundle',
    icon: CircleAlert,
    title: '回報資料包',
    description: '整理必要的錯誤資訊與環境摘要；不包含你的音樂檔案。',
    value: '不含媒體檔案',
    status: '稍後提供',
    tone: 'gated',
  },
];

const appUpdateRows = [
  {
    id: 'app-version',
    icon: RefreshCw,
    title: 'Utawakui 版本',
    description: '檢查是否有新版安裝程式可用。',
    value: packageJson.version ? `v${packageJson.version}` : '目前版本',
    status: '稍後提供',
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

async function enableFeature(featureId) {
  if (isFeatureEnabled(featureId) || enablingFeatureId.value) return;
  enablingFeatureId.value = featureId;
  try {
    await ensureFeatureGate(featureId);
  } finally {
    enablingFeatureId.value = null;
  }
}

function gateActionLabel(gate) {
  if (gate.enabled) return '已啟用';
  if (featureGateState.pendingFeatureId === gate.id) return '等待確認';
  if (enablingFeatureId.value === gate.id || featureGateState.isSaving) {
    return '處理中';
  }
  return '啟用';
}

function isGateActionDisabled(gate) {
  return (
    gate.enabled ||
    Boolean(enablingFeatureId.value) ||
    Boolean(featureGateState.pendingFeatureId) ||
    featureGateState.isSaving
  );
}

function handleWorkflowItemAction(itemId) {
  if (itemId === 'provider-ytdlp-engine') {
    checkForYtdlpUpdate();
    return;
  }
  if (featureDependencyState.byId[itemId]) {
    prepareDependency(itemId);
  }
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
            scale="prominent"
          >
            <template #actions>
              <UiButton
                :icon="FolderOpen"
                aria-label="選擇曲庫資料夾"
                title="選擇曲庫資料夾"
                @click="chooseDownloadDir"
              />
              <UiButton
                :icon="RotateCcw"
                :disabled="importState.isDefaultDir"
                aria-label="還原預設曲庫資料夾"
                title="還原預設曲庫資料夾"
                @click="resetDownloadDir"
              />
            </template>
          </SettingsActionRow>

          <SettingsActionRow
            :icon="RefreshCw"
            title="曲目資訊整理"
            value="已保存的來源資訊"
            :status="isRefreshingMetadata ? '執行中' : '可執行'"
            :status-tone="isRefreshingMetadata ? 'info' : 'success'"
            tooltip="從已保存的來源資訊補齊專輯與年份等曲目資訊。"
            scale="prominent"
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
          status="稍後提供"
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

        <SettingsBlock
          title="診斷與回報"
          status="稍後提供"
          status-tone="warning"
        >
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
            啟用你需要的進階功能，並在直播前準備需要下載的項目
          </p>
        </header>

        <SettingsBlock
          title="進階功能"
          summary="啟用後才會使用線上來源、音訊處理或 OBS 輸出；需要下載的項目會顯示在功能下方。"
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

          <SettingsFeatureGateRow
            v-for="gate in featureGateRows"
            :key="gate.id"
            :gate="gate"
            :items="gate.items"
            :item-group-label="gate.itemGroupLabel"
            :action-label="gateActionLabel(gate)"
            :disable-enable-action="isGateActionDisabled(gate)"
            @enable="enableFeature"
            @item-action="handleWorkflowItemAction"
          />

          <UiHint v-if="featureGateState.error" tone="danger" role="alert">
            {{ featureGateState.error }}
          </UiHint>

          <UiHint
            v-if="featureDependencyState.error"
            tone="danger"
            role="alert"
          >
            {{ featureDependencyState.error }}
          </UiHint>
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
  gap: var(--ui-space-4);
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
