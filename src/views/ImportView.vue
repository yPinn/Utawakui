<script setup>
import { onMounted } from 'vue';
import {
  Download,
  FolderOpen,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from '@lucide/vue';
import UiButton from '../components/ui/UiButton.vue';
import UiPageHeader from '../components/ui/UiPageHeader.vue';
import UiTrackRow from '../components/ui/UiTrackRow.vue';
import { useImportSession } from '../composables/useImportSession.js';

const {
  state,
  playlistStats,
  visiblePlaylistTracks,
  selectablePlaylistTracks,
  allSelected,
  canRetryFailed,
  filterOptions,
  confirmImportLabel,
  canUseConfirmButton,
  resolveSource,
  confirmImport,
  clearPreview,
  toggleSelectAll,
  selectMissingTracks,
  retryFailedTracks,
  getTrackStatusLabel,
  getTrackStatusClass,
  refreshConfig,
  chooseDownloadDir,
  resetDownloadDir,
} = useImportSession();

onMounted(() => {
  refreshConfig();
});
</script>

<template>
  <div class="import-page">
    <UiPageHeader title="Import" />

    <section class="import-setup" aria-labelledby="import-source-title">
      <div class="source-panel">
        <div class="section-heading">
          <h2 id="import-source-title" class="section-heading__title">
            匯入來源
          </h2>
          <p class="section-heading__meta">先建立預覽，確認後才下載</p>
        </div>

        <div class="source-row">
          <input
            v-model="state.input"
            class="source-row__input"
            aria-label="YouTube 單曲或播放清單 URL"
            placeholder="貼上 YouTube 單曲或播放清單 URL"
            :disabled="state.isResolving || state.isImporting"
            @keydown.enter="resolveSource"
          />
          <UiButton
            :icon="Search"
            class="source-row__action"
            variant="accent"
            :disabled="state.isResolving || state.isImporting"
            @click="resolveSource"
          >
            {{ state.isResolving ? '解析中' : '建立預覽' }}
          </UiButton>
        </div>

        <p
          v-if="state.status"
          :class="`status status--${state.statusType}`"
          role="status"
        >
          {{ state.status }}
        </p>
      </div>

      <div class="download-location">
        <div class="section-heading">
          <h2 class="section-heading__title">下載位置</h2>
          <p class="section-heading__meta">
            {{ state.isDefaultDir ? '預設資料夾' : '自訂資料夾' }}
          </p>
        </div>
        <p class="download-location__path" :title="state.downloadDir">
          {{ state.downloadDir }}
        </p>
        <div class="download-location__actions">
          <UiButton
            :icon="FolderOpen"
            class="download-location__button"
            @click="chooseDownloadDir"
          >
            選擇資料夾
          </UiButton>
          <UiButton
            :icon="RotateCcw"
            class="download-location__button"
            @click="resetDownloadDir"
          >
            回到預設
          </UiButton>
        </div>
      </div>
    </section>

    <section
      v-if="state.sourceKind === 'single'"
      class="preview-panel"
      aria-labelledby="single-preview-title"
    >
      <div class="preview-panel__header">
        <div>
          <h2 id="single-preview-title" class="preview-panel__title">
            單曲預覽
          </h2>
          <p class="preview-panel__meta">
            目前只確認來源有效；按下確認匯入後才會下載音訊。
          </p>
        </div>
        <UiButton
          :icon="X"
          :disabled="state.isImporting"
          aria-label="清除預覽"
          title="清除預覽"
          @click="clearPreview"
        />
      </div>

      <ul
        v-if="state.singleTrack"
        class="preview-tracks preview-tracks--single"
      >
        <UiTrackRow class="preview-track" :track="state.singleTrack">
          <template #trail>
            <span
              class="track-status"
              :class="`track-status--${getTrackStatusClass(state.singleTrack)}`"
              :title="getTrackStatusLabel(state.singleTrack)"
            >
              {{ getTrackStatusLabel(state.singleTrack) }}
            </span>
          </template>
        </UiTrackRow>
      </ul>

      <div class="preview-footer">
        <span class="preview-footer__note"
          >此快照只保存在目前應用程式工作階段。</span
        >
        <UiButton
          :icon="Download"
          variant="accent"
          :disabled="!canUseConfirmButton"
          @click="confirmImport"
        >
          {{ confirmImportLabel }}
        </UiButton>
      </div>
    </section>

    <section
      v-else-if="state.sourceKind === 'playlist' && state.playlistTracks"
      class="preview-panel"
      aria-labelledby="playlist-preview-title"
    >
      <div class="preview-panel__header">
        <div>
          <h2 id="playlist-preview-title" class="preview-panel__title">
            播放清單預覽
          </h2>
          <p class="preview-panel__meta">
            {{ playlistStats.total }} 首曲目，{{
              playlistStats.downloadableSelected
            }}
            首會在確認後匯入。
          </p>
        </div>
        <UiButton
          :icon="X"
          :disabled="state.isImporting"
          aria-label="清除預覽"
          title="清除預覽"
          @click="clearPreview"
        />
      </div>

      <div class="snapshot-summary" aria-label="預覽摘要">
        <span>
          <strong>{{ playlistStats.total }}</strong>
          全部
        </span>
        <span>
          <strong>{{ playlistStats.downloadableSelected }}</strong>
          待匯入
        </span>
        <span>
          <strong>{{ playlistStats.alreadyDownloaded }}</strong>
          已存在
        </span>
        <span v-if="playlistStats.done > 0">
          <strong>{{ playlistStats.done }}</strong>
          本次完成
        </span>
        <span v-if="playlistStats.error > 0" class="snapshot-summary__danger">
          <strong>{{ playlistStats.error }}</strong>
          失敗
        </span>
      </div>

      <div class="preview-tools">
        <div class="filter-tabs" aria-label="篩選預覽曲目">
          <button
            v-for="filter in filterOptions"
            :key="filter.key"
            type="button"
            class="filter-tab"
            :class="{ 'filter-tab--active': state.activeFilter === filter.key }"
            :aria-pressed="state.activeFilter === filter.key"
            @click="state.activeFilter = filter.key"
          >
            <span>{{ filter.label }}</span>
            <span class="filter-tab__count">{{ filter.count }}</span>
          </button>
        </div>

        <div class="preview-tools__actions">
          <UiButton :disabled="state.isImporting" @click="selectMissingTracks">
            選取未下載
          </UiButton>
          <UiButton
            :disabled="
              state.isImporting || selectablePlaylistTracks.length === 0
            "
            @click="toggleSelectAll"
          >
            {{ allSelected ? '取消全選' : '全選' }}
          </UiButton>
          <UiButton
            :icon="RefreshCw"
            :disabled="!canRetryFailed"
            @click="retryFailedTracks"
          >
            重試失敗
          </UiButton>
        </div>
      </div>

      <ul class="preview-tracks">
        <UiTrackRow
          v-for="track in visiblePlaylistTracks"
          :key="track.id"
          class="preview-track"
          :class="{
            'preview-track--complete':
              track.alreadyDownloaded || track.status === 'done',
          }"
          :track="track"
        >
          <template #lead>
            <input
              v-model="track.selected"
              class="preview-track__checkbox"
              type="checkbox"
              :disabled="
                state.isImporting ||
                track.alreadyDownloaded ||
                track.status === 'done'
              "
              :aria-label="track.title"
            />
          </template>
          <template #trail>
            <span
              class="track-status"
              :class="`track-status--${getTrackStatusClass(track)}`"
              :title="track.error || getTrackStatusLabel(track)"
            >
              {{ getTrackStatusLabel(track) }}
            </span>
          </template>
        </UiTrackRow>
      </ul>

      <p v-if="visiblePlaylistTracks.length === 0" class="empty-state">
        這個篩選沒有曲目
      </p>

      <div class="preview-footer">
        <span class="preview-footer__note">
          預覽不會寫入資料庫或下載資料夾；只有確認匯入才會建立本機音訊。
        </span>
        <UiButton
          :icon="Download"
          variant="accent"
          :disabled="!canUseConfirmButton"
          @click="confirmImport"
        >
          {{ confirmImportLabel }}
        </UiButton>
      </div>
    </section>

    <section v-else class="empty-panel" aria-label="Import empty state">
      <p>貼上來源後先建立預覽快照；切換頁面再回來，預覽仍會保留。</p>
    </section>
  </div>
</template>

<style scoped>
.import-page {
  --import-control-height: calc(var(--ui-space-5) + var(--ui-space-4));
  --import-top-panel-min-height: calc(
    var(--ui-space-5) + var(--ui-space-5) + var(--ui-space-5) +
      var(--ui-space-4)
  );
  --import-track-row-min-height: calc(
    var(--ui-space-5) + var(--ui-space-5) + var(--ui-space-2)
  );

  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.import-setup {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(280px, 0.8fr);
  gap: var(--ui-space-4);
  align-items: stretch;
  padding-top: var(--ui-space-2);
}

.source-panel,
.download-location,
.preview-panel,
.empty-panel {
  min-width: 0;
  padding: var(--ui-space-3);
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
}

.source-panel,
.download-location {
  display: flex;
  flex-direction: column;
  min-height: var(--import-top-panel-min-height);
}

.section-heading,
.preview-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.section-heading {
  align-items: baseline;
  margin-bottom: var(--ui-space-2);
}

.section-heading__title,
.preview-panel__title {
  margin: 0;
  font-size: var(--ui-text-md);
  font-weight: var(--ui-font-weight-strong);
  color: var(--ui-text);
}

.section-heading__meta,
.preview-panel__meta,
.preview-footer__note,
.empty-panel,
.status {
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}

.section-heading__meta {
  margin: 0;
  text-align: right;
}

.source-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  min-height: var(--import-control-height);
}

.source-row__input {
  box-sizing: border-box;
  flex: 1;
  min-width: 180px;
  padding: var(--ui-space-2) var(--ui-space-3);
  min-height: var(--import-control-height);
  background: var(--ui-bg);
  color: var(--ui-text);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  font-family: var(--font-ui);
  font-size: var(--ui-text-sm);
}

.source-row__input::placeholder {
  color: var(--ui-text-muted);
}

.source-row__input:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 1px;
}

.source-row__input:disabled {
  opacity: 0.65;
}

.source-row__action,
.download-location__button {
  min-height: var(--import-control-height);
}

.status {
  min-height: 1.3em;
  margin: var(--ui-space-2) 0 0;
}

.status--success {
  color: var(--ui-text);
}

.status--error {
  color: var(--ui-danger);
  font-weight: var(--ui-font-weight-strong);
}

.download-location__path {
  min-height: 1.4em;
  margin: 0 0 auto;
  color: var(--ui-text);
  font-size: var(--ui-text-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.download-location__actions,
.preview-tools,
.preview-tools__actions,
.snapshot-summary,
.filter-tabs {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

.download-location__actions {
  margin-top: var(--ui-space-2);
}

.preview-panel {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.preview-panel__meta {
  margin: var(--ui-space-1) 0 0;
}

.snapshot-summary {
  gap: var(--ui-space-3);
}

.snapshot-summary span {
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}

.snapshot-summary strong {
  color: var(--ui-text);
  font-weight: var(--ui-font-weight-strong);
}

.snapshot-summary__danger,
.snapshot-summary__danger strong {
  color: var(--ui-danger);
}

.preview-tools {
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.filter-tabs {
  gap: var(--ui-space-1);
}

.filter-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  min-height: 28px;
  padding: 0 var(--ui-space-2);
  border: none;
  border-radius: var(--ui-radius);
  background: transparent;
  color: var(--ui-text-muted);
  font-family: var(--font-ui);
  font-size: var(--ui-text-sm);
  cursor: pointer;
}

.filter-tab:hover {
  background: var(--ui-surface-hover);
  color: var(--ui-text);
}

.filter-tab--active {
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.filter-tab:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 1px;
}

.filter-tab__count {
  font-variant-numeric: tabular-nums;
  opacity: 0.78;
}

.preview-tools__actions {
  justify-content: flex-end;
  gap: var(--ui-space-1);
}

.preview-tracks {
  list-style: none;
  margin: 0;
  padding: var(--ui-space-1) 0;
  max-height: 360px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.preview-tracks--single {
  max-height: none;
}

.preview-track {
  min-height: var(--import-track-row-min-height);
  background: var(--ui-bg);
}

.preview-track--complete {
  color: var(--ui-text-muted);
}

.preview-track__checkbox {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--ui-accent);
}

.track-status {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 5em;
  max-width: 9em;
  min-height: calc(var(--ui-space-5) - var(--ui-space-1));
  padding: 2px var(--ui-space-2);
  border-radius: var(--ui-radius);
  color: var(--ui-text-muted);
  background: var(--ui-surface-hover);
  font-size: var(--ui-text-sm);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-status--downloading {
  color: var(--ui-accent);
}

.track-status--done,
.track-status--downloaded {
  color: var(--ui-text);
}

.track-status--error {
  color: var(--ui-danger);
}

.empty-state,
.empty-panel p {
  margin: 0;
}

.empty-state {
  padding: var(--ui-space-4);
  color: var(--ui-text-muted);
  text-align: center;
  font-size: var(--ui-text-sm);
}

.preview-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding-top: var(--ui-space-2);
  border-top: 1px solid var(--ui-border);
}

.preview-footer__note {
  min-width: 0;
}

@media (max-width: 920px) {
  .import-setup {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .source-row,
  .preview-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .preview-tools {
    align-items: stretch;
  }

  .preview-tools__actions {
    justify-content: flex-start;
  }
}
</style>
