<script setup>
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import { Ellipsis, FolderOpen, RotateCcw } from '../../icons/index.js';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useImportSession } from '../../composables/useImportSession.js';
import { useLibraryStorage } from '../../composables/useLibraryStorage.js';
import { usePlaybackHistory } from '../../composables/usePlaybackHistory.js';
import SettingsSection from './SettingsSection.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
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
  refresh: refreshPlaybackHistory,
  clear: clearPlaybackHistory,
} = usePlaybackHistory();
const { confirm: confirmAction } = useAppConfirmation();
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
  if (actionId === 'choose') chooseDownloadDir({ notifyFailure: true });
  else if (actionId === 'reset') resetDownloadDir({ notifyFailure: true });
}

async function handleClearPlaybackHistory() {
  const confirmed = await confirmAction({
    title: '清除最近播放紀錄？',
    message: '最近播放紀錄會被清除。',
    detail: '播放佇列、播放清單、OBS 場次與錯誤紀錄會保留。',
    confirmLabel: '清除播放紀錄',
    intent: 'danger',
  });
  if (!confirmed) return;

  await clearPlaybackHistory();
}

async function handleCleanupLibraryStorage() {
  const confirmed = await confirmAction({
    title: '清除去人聲版本？',
    message: '所有去人聲版本都會被清除。',
    detail: '原始歌曲會保留，之後可以重新產生。',
    confirmLabel: '清除版本',
    intent: 'danger',
  });
  if (confirmed) await libraryStorage.cleanup();
}

async function initializeSection() {
  await Promise.all([
    refreshConfig(),
    initializePlaybackHistory(),
    libraryStorage.initialize(),
  ]);
}

onMounted(initializeSection);
onUnmounted(() => libraryStorage.dispose());
</script>

<template>
  <SettingsSection
    id="settings-library"
    class="settings-library-section"
    title="曲庫與儲存"
    tabindex="-1"
  >
    <SettingsDocumentItem
      :icon="FolderOpen"
      title="曲庫位置"
      :value="
        importState.downloadDir ||
        (importState.configError ? '尚未確認曲庫位置' : '讀取中')
      "
      :status="
        importState.configError
          ? '無法讀取'
          : !importState.isDownloadDirAvailable
            ? '無法使用'
            : importState.isDefaultDir
              ? '預設'
              : '自訂'
      "
      :status-tone="
        importState.configError
          ? 'warning'
          : !importState.isDownloadDirAvailable
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
          @click="openDownloadDir({ notifyFailure: true })"
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
      v-if="!importState.configError && !importState.isDownloadDirAvailable"
      tone="danger"
      title="曲庫位置無法使用"
      :message="downloadDirUnavailableMessage"
      action-label="選擇其他資料夾"
      compact
      @action="chooseDownloadDir({ notifyFailure: true })"
    />

    <UiNotice
      v-if="importState.configError"
      tone="danger"
      title="曲庫位置無法讀取"
      :message="importState.configError"
      action-label="重新讀取"
      compact
      @action="refreshConfig()"
    />

    <LibraryStorageSettingsRow
      :storage="libraryStorage.storage.value"
      :policy="libraryStorage.policy.value"
      :loading="libraryStorage.loading.value"
      :saving="libraryStorage.saving.value"
      :cleaning="libraryStorage.cleaning.value"
      :error="libraryStorage.saveError.value"
      :read-error="libraryStorage.readError.value"
      @refresh="libraryStorage.refresh"
      @set-policy="libraryStorage.setPolicy"
      @cleanup="handleCleanupLibraryStorage"
    />

    <UiDisclosure
      class="settings-library-section__details settings-section__disclosure"
      label="曲目資訊與播放紀錄"
      :open="Boolean(playbackHistoryState.error)"
    >
      <LibraryMetadataSettingsRow />

      <PlaybackHistorySettingsRow
        :record-count="recentItems.length"
        :is-loading="
          !playbackHistoryState.isInitialized || playbackHistoryState.isReading
        "
        :is-clearing="playbackHistoryState.isClearing"
        :error="playbackHistoryState.error || ''"
        :read-error="playbackHistoryState.readError || ''"
        @clear="handleClearPlaybackHistory"
        @refresh="refreshPlaybackHistory"
      />
    </UiDisclosure>
  </SettingsSection>
</template>

<style scoped>
.settings-library-section__details {
  border-block-end: 0;
}
</style>
