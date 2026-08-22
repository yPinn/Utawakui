<script setup>
import { computed } from 'vue';
import { FolderPlus, ICON_SIZE, Music } from '../icons/index.js';
import ProviderImportPanel from '../components/import/ProviderImportPanel.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiHint from '../components/ui/UiHint.vue';
import UiNotice from '../components/ui/UiNotice.vue';
import UiPageHeader from '../components/ui/UiPageHeader.vue';
import { useLocalImport } from '../composables/useLocalImport.js';

const { state: localImportState, importFiles } = useLocalImport();

const LOCAL_STATUS_TONES = {
  success: 'success',
  error: 'danger',
};
const localStatusTone = computed(
  () => LOCAL_STATUS_TONES[localImportState.statusType] || 'muted',
);
</script>

<template>
  <div class="import-view">
    <UiPageHeader title="匯入" />

    <section class="local-import-panel" aria-labelledby="local-import-title">
      <div class="local-import-panel__top">
        <div class="section-heading">
          <h2 id="local-import-title" class="section-heading__title">
            本機音訊
          </h2>
          <p class="section-heading__meta">複製到 Utawakui 曲庫</p>
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

      <UiNotice
        v-if="
          localImportState.message && localImportState.statusType === 'error'
        "
        tone="danger"
        title="本機匯入未完成"
        :message="localImportState.message"
        action-label="重試"
        compact
        @action="importFiles"
      />
      <UiHint
        v-else-if="localImportState.message"
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
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-title);
}

.section-heading__meta,
.local-import-action__meta {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}

.section-heading__meta,
.local-import-action__meta {
  margin: 0;
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
  line-height: var(--ui-line-height-label);
}

@media (max-width: 900px) {
  .local-import-panel__top {
    align-items: stretch;
    flex-direction: column;
  }
}

@media (max-width: 680px) {
  .local-import-action {
    align-items: stretch;
    flex-wrap: wrap;
  }
}
</style>
