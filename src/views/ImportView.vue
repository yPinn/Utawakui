<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  FolderOpen,
  FolderPlus,
  ICON_SIZE,
  Music,
  RefreshCw,
  RotateCcw,
} from '../icons/index.js';
import ProviderImportPanel from '../components/import/ProviderImportPanel.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiChip from '../components/ui/UiChip.vue';
import UiHint from '../components/ui/UiHint.vue';
import UiPageHeader from '../components/ui/UiPageHeader.vue';
import { useImportSession } from '../composables/useImportSession.js';
import { useLibrary } from '../composables/useLibrary.js';
import { useLocalImport } from '../composables/useLocalImport.js';

const {
  state: importState,
  refreshConfig,
  chooseDownloadDir,
  resetDownloadDir,
} = useImportSession();
const { state: localImportState, importFiles } = useLocalImport();
const { refreshMetadata: refreshLibraryMetadata } = useLibrary();

const isRefreshingMetadata = ref(false);
const metadataRefreshMessage = ref('');

const LOCAL_STATUS_TONES = {
  success: 'success',
  error: 'danger',
};
const localStatusTone = computed(
  () => LOCAL_STATUS_TONES[localImportState.statusType] || 'muted',
);

async function refreshMetadata() {
  isRefreshingMetadata.value = true;
  metadataRefreshMessage.value = '';
  try {
    const updated = await refreshLibraryMetadata();
    metadataRefreshMessage.value =
      updated > 0 ? `已補齊 ${updated} 首曲目的專輯資訊` : '沒有需要補齊的資訊';
  } catch (err) {
    metadataRefreshMessage.value = `重新整理失敗：${err.message}`;
  } finally {
    isRefreshingMetadata.value = false;
  }
}

onMounted(() => {
  refreshConfig();
});
</script>

<template>
  <div class="import-view">
    <UiPageHeader title="匯入">
      <template #actions>
        <UiButton
          :icon="RefreshCw"
          :disabled="isRefreshingMetadata"
          @click="refreshMetadata"
        >
          {{ isRefreshingMetadata ? '重新整理中...' : '重新整理曲目資訊' }}
        </UiButton>
      </template>
    </UiPageHeader>

    <UiHint v-if="metadataRefreshMessage" tone="text" role="status">
      {{ metadataRefreshMessage }}
    </UiHint>

    <section class="local-import-panel" aria-labelledby="local-import-title">
      <div class="local-import-panel__top">
        <div class="section-heading">
          <h2 id="local-import-title" class="section-heading__title">
            本機音訊
          </h2>
          <p class="section-heading__meta">複製到 Utawakui 曲庫</p>
        </div>

        <div class="download-inline" aria-label="曲庫位置">
          <span class="download-inline__label">曲庫</span>
          <span class="download-inline__path" :title="importState.downloadDir">
            {{ importState.downloadDir }}
          </span>
          <UiChip class="download-inline__mode">
            {{ importState.isDefaultDir ? '預設' : '自訂' }}
          </UiChip>
          <UiButton
            :icon="FolderOpen"
            aria-label="選擇資料夾"
            title="選擇資料夾"
            @click="chooseDownloadDir"
          />
          <UiButton
            :icon="RotateCcw"
            aria-label="改回預設資料夾"
            title="改回預設資料夾"
            @click="resetDownloadDir"
          />
        </div>
      </div>

      <div class="local-import-action">
        <div class="local-import-action__icon" aria-hidden="true">
          <Music :size="ICON_SIZE" />
        </div>
        <div class="local-import-action__copy">
          <h3 class="local-import-action__title">選擇音訊檔</h3>
          <p class="local-import-action__meta">
            MP3、M4A、WEBM、OPUS、WAV、FLAC
          </p>
        </div>
        <UiButton
          :icon="FolderPlus"
          variant="accent"
          :disabled="localImportState.isImporting"
          @click="importFiles"
        >
          {{ localImportState.isImporting ? '匯入中...' : '複製到曲庫' }}
        </UiButton>
      </div>

      <UiHint
        v-if="localImportState.message"
        :tone="localStatusTone"
        role="status"
      >
        {{ localImportState.message }}
      </UiHint>
    </section>

    <ProviderImportPanel />
  </div>
</template>

<style scoped>
.import-view {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.local-import-panel {
  display: grid;
  gap: var(--ui-space-3);
  min-width: 0;
  padding: var(--ui-space-3);
  background: var(--ui-color-surface);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
}

.local-import-panel__top,
.section-heading,
.local-import-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.section-heading {
  min-width: 0;
  align-items: baseline;
}

.section-heading__title,
.local-import-action__title {
  margin: 0;
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-strong);
}

.section-heading__title {
  font-size: var(--ui-font-size-md);
}

.section-heading__meta,
.download-inline,
.local-import-action__meta {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.section-heading__meta,
.local-import-action__meta {
  margin: 0;
}

.download-inline {
  display: grid;
  grid-template-columns:
    auto minmax(calc(var(--ui-space-5) * 6), 1fr)
    auto auto auto;
  align-items: center;
  gap: var(--ui-space-2);
  min-width: min(calc(var(--ui-space-5) * 22), 50%);
}

.download-inline__label,
.download-inline__mode {
  flex: 0 0 auto;
}

.download-inline__path {
  min-width: 0;
  color: var(--ui-color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-import-action {
  justify-content: flex-start;
  min-height: calc(var(--ui-track-row-min-height) + var(--ui-space-3));
  padding-top: var(--ui-space-2);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.local-import-action__icon {
  display: grid;
  place-items: center;
  flex: 0 0 var(--ui-track-row-thumb-size);
  width: var(--ui-track-row-thumb-size);
  height: var(--ui-track-row-thumb-size);
  color: var(--ui-color-accent);
  background: var(--ui-color-accent-soft);
  border-radius: var(--ui-radius-sm);
}

.local-import-action__copy {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: var(--ui-space-1);
}

.local-import-action__title {
  font-size: var(--ui-font-size-sm);
}

@media (max-width: 900px) {
  .local-import-panel__top {
    align-items: stretch;
    flex-direction: column;
  }

  .download-inline {
    min-width: 0;
    width: 100%;
  }
}

@media (max-width: 680px) {
  .local-import-action {
    align-items: stretch;
    flex-wrap: wrap;
  }

  .download-inline {
    grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  }
}
</style>
