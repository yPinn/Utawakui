<script setup>
import { computed, onMounted, shallowRef } from 'vue';
import {
  CircleAlert,
  Check,
  Download,
  FolderOpen,
  Library,
  ListChecks,
  ListMusic,
  RefreshCw,
  RotateCcw,
  Settings,
} from '../icons/index.js';
import SettingsActionRow from '../components/settings/SettingsActionRow.vue';
import SettingsBlock from '../components/settings/SettingsBlock.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiHint from '../components/ui/UiHint.vue';
import { FEATURE_GATES } from '../constants/featureGates.js';
import { useFeatureGates } from '../composables/useFeatureGates.js';
import { useImportSession } from '../composables/useImportSession.js';
import { useLibrary } from '../composables/useLibrary.js';
import { useYtdlpStatus } from '../composables/useYtdlpStatus.js';

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
  state: ytdlpState,
  refreshStatus: refreshYtdlpStatus,
  checkForUpdate: checkYtdlpUpdate,
} = useYtdlpStatus();

const isRefreshingMetadata = shallowRef(false);
const maintenanceMessage = shallowRef('');
const maintenanceTone = shallowRef('muted');
const enablingFeatureId = shallowRef(null);
const ytdlpMessage = shallowRef('');
const ytdlpMessageTone = shallowRef('muted');

const ytdlpCheckResultLabel = computed(() => {
  if (ytdlpState.lastCheckResult === 'up-to-date') return '已是最新';
  if (ytdlpState.lastCheckResult === 'updated') return '已更新';
  if (ytdlpState.lastCheckResult === 'error') return '檢查失敗';
  return '';
});

const basicFeatureRows = [
  {
    id: 'local-library',
    icon: Library,
    title: '本機曲庫',
    value: '曲目 / 封面 / 曲目資訊',
    status: '已啟用',
    tone: 'success',
    description: '本機曲目與素材整理是預設核心功能。',
  },
  {
    id: 'setlist-player',
    icon: ListMusic,
    title: '歌單與播放',
    value: '歌單 / 佇列 / 播放列',
    status: '已啟用',
    tone: 'success',
    description: '歌單、播放佇列與底部播放列屬於預設操作面。',
  },
  {
    id: 'local-settings',
    icon: Settings,
    title: '本機設定',
    value: '路徑 / 主題 / 視窗狀態',
    status: '已啟用',
    tone: 'success',
    description: '只保存在這台電腦，不寫入歌單或未來 preset。',
  },
];

const FEATURE_GATE_LABELS = {
  'provider-flow': '外部來源',
  'lyrics-flow': '歌詞來源',
  'audio-processing-flow': '音訊處理',
  'public-output-flow': '對外輸出',
};

const FEATURE_GATE_VALUE_LABELS = {
  'provider-flow': '匯入 / 候選版本',
  'lyrics-flow': '搜尋 / 保存歌詞',
  'audio-processing-flow': '分離 / 產生音訊',
  'public-output-flow': 'OBS / 公開呈現',
};

const featureGateRows = computed(() =>
  Object.values(FEATURE_GATES).map((gate) => {
    const enabled = isFeatureEnabled(gate.id);
    return {
      id: gate.id,
      title: FEATURE_GATE_LABELS[gate.id] ?? gate.title,
      description: gate.summary,
      value: FEATURE_GATE_VALUE_LABELS[gate.id] ?? gate.category,
      status: enabled ? '已啟用' : '未啟用',
      tone: enabled ? 'success' : 'gated',
      icon: enabled ? Check : CircleAlert,
      enabled,
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
    title: '應用程式記錄',
    description: '收集主行程、渲染端、音訊處理與匯入流程的診斷紀錄。',
    value: '記錄保存 / 保留期限',
    status: '規劃中',
    tone: 'warning',
  },
  {
    id: 'error-report-bundle',
    icon: CircleAlert,
    title: '錯誤回報包',
    description: '打包錯誤訊息、環境摘要與必要設定快照；不包含媒體檔案。',
    value: '隱私邊界 / IPC',
    status: '待接線',
    tone: 'gated',
  },
];

const preferenceRows = [
  {
    id: 'theme',
    icon: Settings,
    title: '控制台主題',
    description: '使用頂部按鈕切換亮暗主題；不提供使用者自定義控制台主題。',
    value: '亮 / 暗',
    status: '已實作',
    tone: 'success',
  },
  {
    id: 'output-defaults',
    icon: Settings,
    title: 'OBS 輸出預設',
    description: '未來保存 OBS Browser Source、場次模式與公開輸出偏好。',
    value: 'Browser Source / 場次模式',
    status: '規劃中',
    tone: 'gated',
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
  refreshYtdlpStatus();
}

async function checkForYtdlpUpdate() {
  ytdlpMessage.value = '';
  ytdlpMessageTone.value = 'muted';
  await checkYtdlpUpdate();
  if (ytdlpState.error || ytdlpState.lastCheckResult === 'error') {
    ytdlpMessage.value = ytdlpState.error || '檢查更新失敗，請確認網路連線';
    ytdlpMessageTone.value = 'danger';
    return;
  }
  ytdlpMessage.value =
    ytdlpState.lastCheckResult === 'updated'
      ? `已更新至 ${ytdlpState.version}`
      : '已是最新版本';
  ytdlpMessageTone.value = 'success';
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

onMounted(refreshSettingsState);
</script>

<template>
  <div class="settings-view">
    <div class="settings-view__grid">
      <section
        class="settings-view__column"
        aria-labelledby="settings-status-title"
      >
        <header class="settings-view__column-header">
          <h2 id="settings-status-title" class="settings-view__column-title">
            功能狀態
          </h2>
          <p class="settings-view__column-summary">基本功能與進階功能門檻</p>
        </header>

        <SettingsBlock title="基本功能" status="核心" status-tone="success">
          <SettingsActionRow
            v-for="row in basicFeatureRows"
            :key="row.id"
            :icon="row.icon"
            :title="row.title"
            :value="row.value"
            :status="row.status"
            :status-tone="row.tone"
            :tooltip="row.description"
            scale="compact"
          />
        </SettingsBlock>

        <SettingsBlock
          title="功能門檻"
          :status="`${enabledGateCount} / ${featureGateRows.length}`"
          status-tone="gated"
        >
          <template #actions>
            <UiButton
              :icon="RefreshCw"
              :disabled="featureGateState.isLoading"
              aria-label="重新讀取功能門檻狀態"
              title="重新讀取功能門檻狀態"
              @click="refreshConfirmations"
            />
          </template>

          <SettingsActionRow
            v-for="gate in featureGateRows"
            :key="gate.id"
            :icon="gate.icon"
            :title="gate.title"
            :value="gate.value"
            :status="gate.status"
            :status-tone="gate.tone"
            :tooltip="gate.description"
            scale="compact"
          >
            <template #actions>
              <UiButton
                :icon="Check"
                :disabled="
                  gate.enabled ||
                  Boolean(enablingFeatureId) ||
                  Boolean(featureGateState.pendingFeatureId) ||
                  featureGateState.isSaving
                "
                :aria-label="`${gateActionLabel(gate)}${gate.title}`"
                :title="`${gateActionLabel(gate)}${gate.title}`"
                @click="enableFeature(gate.id)"
              />
            </template>
          </SettingsActionRow>

          <UiHint v-if="featureGateState.error" tone="danger" role="alert">
            {{ featureGateState.error }}
          </UiHint>
        </SettingsBlock>
      </section>

      <section
        class="settings-view__column"
        aria-labelledby="settings-content-title"
      >
        <header class="settings-view__column-header">
          <h2 id="settings-content-title" class="settings-view__column-title">
            設定內容
          </h2>
          <p class="settings-view__column-summary">本機路徑、預設值與診斷</p>
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
            value="本機 info.json"
            :status="isRefreshingMetadata ? '執行中' : '可執行'"
            :status-tone="isRefreshingMetadata ? 'info' : 'success'"
            tooltip="從已下載的本機 info.json 資訊檔補齊專輯與年份等曲目資訊。"
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
          title="下載引擎"
          :status="ytdlpState.binaryFound ? '正常' : '找不到執行檔'"
          :status-tone="ytdlpState.binaryFound ? 'success' : 'danger'"
        >
          <SettingsActionRow
            :icon="Download"
            title="yt-dlp 版本"
            :value="
              ytdlpState.version || (ytdlpState.isLoading ? '讀取中' : '未知')
            "
            :status="ytdlpCheckResultLabel"
            status-tone="muted"
            tooltip="此更新只影響目前安裝，重新執行 npm install 會被還原。"
            scale="prominent"
          >
            <template #actions>
              <UiButton
                :icon="RefreshCw"
                :disabled="ytdlpState.isChecking"
                aria-label="檢查並更新 yt-dlp"
                title="檢查並更新 yt-dlp"
                @click="checkForYtdlpUpdate"
              />
            </template>
          </SettingsActionRow>

          <UiHint
            v-if="ytdlpMessage"
            :tone="ytdlpMessageTone"
            :role="ytdlpMessageTone === 'danger' ? 'alert' : 'status'"
          >
            {{ ytdlpMessage }}
          </UiHint>
        </SettingsBlock>

        <SettingsBlock title="介面與輸出">
          <SettingsActionRow
            v-for="row in preferenceRows"
            :key="row.id"
            :icon="row.icon"
            :title="row.title"
            :value="row.value"
            :status="row.status"
            :status-tone="row.tone"
            :tooltip="row.description"
          />
        </SettingsBlock>

        <SettingsBlock title="診斷與回報" status="規劃中" status-tone="warning">
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
                aria-label="尚未接線"
                title="尚未接線"
              />
            </template>
          </SettingsActionRow>
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
