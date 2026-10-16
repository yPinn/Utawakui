<script setup>
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import { Ellipsis, FolderOpen, RotateCcw } from '../../icons/index.js';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useAppDiagnostics } from '../../composables/useAppDiagnostics.js';
import { useImportSession } from '../../composables/useImportSession.js';
import { useLibraryStorage } from '../../composables/useLibraryStorage.js';
import { usePlaybackHistory } from '../../composables/usePlaybackHistory.js';
import AppFolderSection from '../layout/AppFolderSection.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import LibraryMetadataSettingsRow from './LibraryMetadataSettingsRow.vue';
import LibraryStorageSettingsRow from './LibraryStorageSettingsRow.vue';
import PlaybackHistorySettingsRow from './PlaybackHistorySettingsRow.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';

const {
  state: importState,
  refreshConfig,
  chooseDownloadDir,
  resetDownloadDir,
  openDownloadDir,
} = useImportSession();
const libraryStorage = useLibraryStorage();
const {
  state: playbackHistoryState,
  recentItems,
  initialize: initializePlaybackHistory,
  clear: clearPlaybackHistory,
} = usePlaybackHistory();
const { confirm: confirmAction } = useAppConfirmation();
const { recordError } = useAppDiagnostics();

const maintenanceMessage = shallowRef('');
const maintenanceTone = shallowRef('muted');
const isClearingPlaybackHistory = shallowRef(false);
const isDownloadDirMenuOpen = shallowRef(false);
const downloadDirMenuAnchorEl = shallowRef(null);

const downloadDirUnavailableMessage = computed(() =>
  importState.isDefaultDir
    ? '無法建立預設資料夾。請選擇其他位置。'
    : '設定已保留。請重新連接磁碟，或選擇其他位置。',
);
const downloadDirMenuAnchor = computed(() => ({
  kind: 'element',
  element: downloadDirMenuAnchorEl.value,
}));
const downloadDirMenuContent = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'directory',
      items: [
        {
          id: 'choose',
          kind: 'action',
          icon: FolderOpen,
          label: '選擇其他資料夾',
          value: 'choose',
        },
        {
          id: 'reset',
          kind: 'action',
          icon: RotateCcw,
          label: '還原預設資料夾',
          value: 'reset',
          disabled: importState.isDefaultDir,
        },
      ],
    },
  ],
  emptyText: '沒有可用的操作',
}));

function openDownloadDirMenu(event) {
  event.stopPropagation();
  downloadDirMenuAnchorEl.value = event.currentTarget;
  isDownloadDirMenuOpen.value = true;
}

function closeDownloadDirMenu() {
  isDownloadDirMenuOpen.value = false;
  downloadDirMenuAnchorEl.value = null;
}

function handleDownloadDirMenuSelect(actionId) {
  closeDownloadDirMenu();
  if (actionId === 'choose') chooseDownloadDir();
  else if (actionId === 'reset') resetDownloadDir();
}

async function handleClearPlaybackHistory() {
  const confirmed = await confirmAction({
    title: '清除最近播放紀錄？',
    message: '這台電腦上的最近播放紀錄會被清除。',
    detail: '這不會影響播放佇列、播放清單、OBS 場次紀錄或錯誤紀錄。',
    confirmLabel: '清除播放紀錄',
    intent: 'danger',
  });
  if (!confirmed) return;

  isClearingPlaybackHistory.value = true;
  try {
    await clearPlaybackHistory();
  } finally {
    isClearingPlaybackHistory.value = false;
  }
}

async function handleCleanupLibraryStorage() {
  const confirmed = await confirmAction({
    title: '清理去人聲版本？',
    message: '已產生的去人聲音訊會被清除。',
    detail: '原始歌曲會保留，之後可以重新產生。',
    confirmLabel: '清理版本',
    intent: 'danger',
  });
  if (confirmed) await libraryStorage.cleanup();
}

async function initializeSection() {
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
  initializePlaybackHistory();
  libraryStorage.initialize();
}

onMounted(initializeSection);
onUnmounted(() => libraryStorage.dispose());
</script>

<template>
  <AppFolderSection
    id="settings-library"
    class="settings-library-section"
    title="曲庫與儲存"
    tabindex="-1"
  >
    <SettingsDocumentItem
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
      guidance="切換位置不會搬移既有曲目。"
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
        <UiActionMenu
          :open="isDownloadDirMenuOpen"
          :anchor="downloadDirMenuAnchor"
          size="sm"
          :content="downloadDirMenuContent"
          @select="handleDownloadDirMenuSelect"
          @close="closeDownloadDirMenu"
        />
      </template>
    </SettingsDocumentItem>

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

    <LibraryMetadataSettingsRow />

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
  </AppFolderSection>
</template>

<style scoped>
.settings-library-section {
  min-inline-size: 0;
  scroll-margin-block-start: var(--ui-space-4);
}

.settings-library-section:focus {
  outline: none;
}
</style>
