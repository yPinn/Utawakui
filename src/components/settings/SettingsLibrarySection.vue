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
import { t } from '../../utils/i18n.js';

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
    ? t('librarySettings.location.defaultUnavailable')
    : t('librarySettings.location.customUnavailable'),
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
          label: t('librarySettings.location.choose'),
          value: 'choose',
        },
        {
          id: 'reset',
          kind: 'action',
          icon: RotateCcw,
          label: t('librarySettings.location.reset'),
          value: 'reset',
          disabled: importState.isDefaultDir,
        },
      ],
    },
  ],
  emptyText: t('librarySettings.location.noActions'),
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
    title: t('librarySettings.history.clearTitle'),
    message: t('librarySettings.history.clearMessage'),
    detail: t('librarySettings.history.clearDetail'),
    confirmLabel: t('librarySettings.history.clear'),
    intent: 'danger',
  });
  if (!confirmed) return;

  await clearPlaybackHistory();
}

async function handleCleanupLibraryStorage() {
  const confirmed = await confirmAction({
    title: t('librarySettings.storage.cleanupTitle'),
    message: t('librarySettings.storage.cleanupMessage'),
    detail: t('librarySettings.storage.cleanupDetail'),
    confirmLabel: t('librarySettings.storage.cleanupConfirm'),
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
    :title="t('librarySettings.section')"
    tabindex="-1"
  >
    <SettingsDocumentItem
      :icon="FolderOpen"
      :title="t('librarySettings.location.title')"
      :value="
        importState.downloadDir ||
        t(
          importState.configError
            ? 'librarySettings.location.unconfirmed'
            : 'librarySettings.reading',
        )
      "
      :status="
        importState.configError
          ? t('librarySettings.unreadable')
          : !importState.isDownloadDirAvailable
            ? t('librarySettings.location.unavailable')
            : importState.isDefaultDir
              ? t('librarySettings.location.default')
              : t('librarySettings.location.custom')
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
      :guidance="t('librarySettings.location.guidance')"
    >
      <template #actions>
        <UiIconButton
          :icon="FolderOpen"
          :label="t('librarySettings.location.open')"
          :disabled="!importState.isDownloadDirAvailable"
          @click="openDownloadDir({ notifyFailure: true })"
        />
        <UiIconButton
          :icon="Ellipsis"
          :label="t('librarySettings.location.more')"
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
      :title="t('librarySettings.location.unavailableTitle')"
      :message="downloadDirUnavailableMessage"
      :action-label="t('librarySettings.location.choose')"
      compact
      @action="chooseDownloadDir({ notifyFailure: true })"
    />

    <UiNotice
      v-if="importState.configError"
      tone="danger"
      :title="t('librarySettings.location.unreadableTitle')"
      :message="importState.configError"
      :action-label="t('librarySettings.reload')"
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
      class="settings-section__disclosure"
      :label="t('librarySettings.details')"
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
