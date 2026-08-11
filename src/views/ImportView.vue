<script setup>
import { computed, onMounted, useTemplateRef } from 'vue';
import {
  Download,
  FolderOpen,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from '@lucide/vue';
import ImportCandidateOption from '../components/import/ImportCandidateOption.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiPageHeader from '../components/ui/UiPageHeader.vue';
import UiTrackRow from '../components/ui/UiTrackRow.vue';
import { useImportSession } from '../composables/useImportSession.js';
import { useRovingRadioGroup } from '../composables/useRovingRadioGroup.js';
import {
  candidateId,
  candidateSourceLabel,
  identityArtistLabel,
  identityStatusClass,
  identityStatusLabel,
  identityTitle,
} from '../utils/importCandidateDisplay.js';

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
  selectImportCandidate,
  toggleSelectAll,
  selectMissingTracks,
  retryFailedTracks,
  getTrackStatusLabel,
  getTrackStatusClass,
  refreshConfig,
  chooseDownloadDir,
  resetDownloadDir,
} = useImportSession();

const singleResolution = computed(() => state.singleResolution);
const recommendedCandidate = computed(
  () => singleResolution.value?.recommendedCandidate ?? null,
);
const recommendedCandidateId = computed(() =>
  candidateId(recommendedCandidate.value),
);
const selectedCandidate = computed(() => {
  const selectedId = state.selectedCandidateId;
  return (
    singleResolution.value?.candidates?.find(
      (candidate) => candidateId(candidate) === selectedId,
    ) ||
    recommendedCandidate.value ||
    null
  );
});
const sourceCandidate = computed(() => singleResolution.value?.source ?? null);
const candidateOptions = computed(
  () => singleResolution.value?.candidates ?? [],
);
const sourceDiffersFromSelection = computed(() => {
  const source = sourceCandidate.value;
  const selected = selectedCandidate.value;
  if (!source || !selected) return false;
  return (
    (source.playbackVideoId || source.id) !==
    (selected.playbackVideoId || selected.id)
  );
});
const singleFooterNote = computed(() => {
  if (!state.singleTrack) return '';
  if (state.singleTrack.alreadyDownloaded) return '此音源已在曲庫中。';
  if (sourceDiffersFromSelection.value) {
    return '會下載較適合播放的版本；你貼上的影片只用來比對歌曲。';
  }
  return '會下載目前顯示的版本。';
});

function isSelectedCandidate(candidate) {
  return candidateId(candidate) === state.selectedCandidateId;
}

const candidateGroupRef = useTemplateRef('candidateGroup');
const { tabindexFor, handleKeydown: handleCandidateGroupKeydown } =
  useRovingRadioGroup(candidateGroupRef, selectImportCandidate);

function trackIdentityFor(track) {
  return track?.trackIdentity || null;
}

function displayTitleForTrack(track) {
  return identityTitle(trackIdentityFor(track), track?.title);
}

function displayArtistForTrack(track) {
  return identityArtistLabel(trackIdentityFor(track), track?.artist);
}

function identityClassForTrack(track) {
  return `identity-chip--${identityStatusClass(trackIdentityFor(track))}`;
}

onMounted(() => {
  refreshConfig();
});
</script>

<template>
  <div class="import-page">
    <UiPageHeader title="匯入" />

    <section class="import-control" aria-labelledby="import-source-title">
      <div class="import-control__top">
        <div class="section-heading">
          <h2 id="import-source-title" class="section-heading__title">
            智慧匯入
          </h2>
          <p class="section-heading__meta">貼上連結後，自動比對可下載版本</p>
        </div>

        <div class="download-inline" aria-label="下載位置">
          <span class="download-inline__label">下載到</span>
          <span class="download-inline__path" :title="state.downloadDir">
            {{ state.downloadDir }}
          </span>
          <span class="download-inline__mode">
            {{ state.isDefaultDir ? '預設' : '自訂' }}
          </span>
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

      <div class="source-row">
        <input
          v-model="state.input"
          class="source-row__input"
          aria-label="YouTube 或 YouTube Music 連結"
          placeholder="貼上歌曲、MV 或播放清單連結"
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
          {{ state.isResolving ? '搜尋中' : '搜尋版本' }}
        </UiButton>
      </div>

      <p
        v-if="state.status"
        :class="`status status--${state.statusType}`"
        role="status"
      >
        {{ state.status }}
      </p>
    </section>

    <section
      v-if="state.sourceKind === 'single'"
      class="preview-panel preview-panel--single"
      aria-labelledby="single-preview-title"
    >
      <div class="preview-panel__header">
        <div>
          <h2 id="single-preview-title" class="preview-panel__title">
            選擇下載版本
          </h2>
          <p class="preview-panel__meta">
            {{
              sourceDiffersFromSelection
                ? '會下載較適合播放的版本'
                : '會下載你貼上的來源'
            }}
          </p>
        </div>
        <UiButton
          :icon="X"
          :disabled="state.isImporting"
          aria-label="關閉預覽"
          title="關閉預覽"
          @click="clearPreview"
        />
      </div>

      <div v-if="state.singleTrack" class="single-source-stack">
        <section class="source-summary" aria-labelledby="recommended-source">
          <div class="source-summary__bar">
            <h3 id="recommended-source" class="source-summary__title">
              準備下載
            </h3>
            <div class="candidate-chips">
              <span class="candidate-chip">
                {{
                  candidateSourceLabel(selectedCandidate || state.singleTrack)
                }}
              </span>
            </div>
          </div>

          <ul class="preview-tracks preview-tracks--single">
            <UiTrackRow
              class="preview-track"
              :track="state.singleTrack"
              :title="displayTitleForTrack(state.singleTrack)"
              :artist="displayArtistForTrack(state.singleTrack)"
            >
              <template #trail>
                <span
                  v-if="trackIdentityFor(state.singleTrack)"
                  class="identity-chip"
                  :class="identityClassForTrack(state.singleTrack)"
                >
                  {{ identityStatusLabel(trackIdentityFor(state.singleTrack)) }}
                </span>
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

          <p class="selected-source-note">
            {{
              sourceDiffersFromSelection
                ? '系統已替你找到較接近音樂平台的版本。'
                : '目前會下載你貼上的來源。'
            }}
          </p>
        </section>

        <section
          v-if="candidateOptions.length > 1"
          class="candidate-picker"
          aria-labelledby="candidate-picker-title"
        >
          <div class="section-heading">
            <h3 id="candidate-picker-title" class="source-summary__title">
              可選版本
            </h3>
            <p class="section-heading__meta">已依適合播放程度排序</p>
          </div>

          <div
            ref="candidateGroup"
            class="candidate-options"
            role="radiogroup"
            aria-label="選擇下載版本"
            @keydown="handleCandidateGroupKeydown"
          >
            <ImportCandidateOption
              v-for="candidate in candidateOptions"
              :key="candidateId(candidate)"
              :candidate="candidate"
              :disabled="state.isImporting"
              :recommended="candidateId(candidate) === recommendedCandidateId"
              :selected="isSelectedCandidate(candidate)"
              :tabindex="
                tabindexFor(candidateId(candidate), state.selectedCandidateId)
              "
              @select="selectImportCandidate"
            />
          </div>
        </section>
      </div>

      <div class="preview-footer">
        <span class="preview-footer__note">{{ singleFooterNote }}</span>
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
            {{ state.playlistTitle }}
          </h2>
          <p class="preview-panel__meta">
            {{ playlistStats.total }} 首，{{
              playlistStats.downloadableSelected
            }}
            首將下載
          </p>
        </div>
        <UiButton
          :icon="X"
          :disabled="state.isImporting"
          aria-label="關閉預覽"
          title="關閉預覽"
          @click="clearPreview"
        />
      </div>

      <div class="snapshot-summary" aria-label="播放清單統計">
        <span>
          <strong>{{ playlistStats.total }}</strong>
          全部
        </span>
        <span>
          <strong>{{ playlistStats.downloadableSelected }}</strong>
          將下載
        </span>
        <span>
          <strong>{{ playlistStats.alreadyDownloaded }}</strong>
          已存在
        </span>
        <span v-if="playlistStats.done > 0">
          <strong>{{ playlistStats.done }}</strong>
          完成
        </span>
        <span v-if="playlistStats.error > 0" class="snapshot-summary__danger">
          <strong>{{ playlistStats.error }}</strong>
          失敗
        </span>
      </div>

      <div class="preview-tools">
        <div class="filter-tabs" aria-label="預覽篩選">
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
          :title="displayTitleForTrack(track)"
          :artist="displayArtistForTrack(track)"
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
              v-if="trackIdentityFor(track)"
              class="identity-chip"
              :class="identityClassForTrack(track)"
            >
              {{ identityStatusLabel(trackIdentityFor(track)) }}
            </span>
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
        沒有符合目前篩選的曲目
      </p>

      <div class="preview-footer">
        <span class="preview-footer__note">
          播放清單會逐首下載；之後會加入更精準的音源比對。
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

    <section v-else class="empty-panel" aria-label="匯入起始畫面">
      <p>貼上連結後先預覽，確認無誤再下載。</p>
    </section>
  </div>
</template>

<style scoped>
.import-page {
  --import-border-width: calc(var(--ui-space-1) / 4);
  --import-control-height: calc(var(--ui-space-5) + var(--ui-space-4));
  --import-track-row-min-height: calc(
    var(--ui-space-5) + var(--ui-space-5) + var(--ui-space-2)
  );
  --import-preview-list-max-height: calc(var(--ui-space-5) * 15);
  --import-checkbox-size: var(--ui-space-4);
  --import-status-min-width: calc(var(--ui-space-5) * 3);
  --import-status-max-width: calc(var(--ui-space-5) * 6);

  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.import-control,
.preview-panel,
.empty-panel {
  min-width: 0;
  padding: var(--ui-space-3);
  background: var(--ui-surface);
  border: var(--import-border-width) solid var(--ui-border);
  border-radius: var(--ui-radius);
}

.import-control {
  display: grid;
  gap: var(--ui-space-2);
}

.import-control__top,
.section-heading,
.preview-panel__header,
.source-summary__bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.import-control__top {
  align-items: center;
}

.section-heading {
  min-width: 0;
  align-items: baseline;
}

.section-heading__title,
.preview-panel__title,
.source-summary__title {
  margin: 0;
  color: var(--ui-text);
  font-weight: var(--ui-font-weight-strong);
}

.section-heading__title,
.preview-panel__title {
  font-size: var(--ui-text-md);
}

.source-summary__title {
  flex: 0 0 auto;
  font-size: var(--ui-text-sm);
}

.section-heading__meta,
.preview-panel__meta,
.preview-footer__note,
.empty-panel,
.status,
.download-inline,
.candidate-chip {
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}

.section-heading__meta {
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
  color: var(--ui-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.download-inline__mode {
  padding: calc(var(--ui-space-1) / 2) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-bg);
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
  min-width: calc(var(--ui-space-5) * 8);
  padding: var(--ui-space-2) var(--ui-space-3);
  min-height: var(--import-control-height);
  background: var(--ui-bg);
  color: var(--ui-text);
  border: var(--import-border-width) solid var(--ui-border);
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

.source-row__action {
  min-height: var(--import-control-height);
}

.status {
  min-height: var(--ui-space-4);
  margin: 0;
}

.status--success {
  color: var(--ui-text);
}

.status--error {
  color: var(--ui-danger);
  font-weight: var(--ui-font-weight-strong);
}

.preview-panel {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.preview-panel__meta {
  margin: var(--ui-space-1) 0 0;
}

.single-source-stack {
  display: grid;
  gap: var(--ui-space-3);
}

.source-summary {
  display: grid;
  gap: var(--ui-space-2);
}

.candidate-picker {
  display: grid;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-3);
  border-top: var(--import-border-width) solid var(--ui-border);
}

.candidate-chips,
.candidate-options,
.preview-tools,
.preview-tools__actions,
.snapshot-summary,
.filter-tabs {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

.candidate-chips {
  justify-content: flex-end;
  gap: var(--ui-space-1);
}

.candidate-options {
  flex-direction: column;
  gap: var(--ui-space-1);
}

.candidate-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-1);
  min-height: calc(var(--ui-space-5) - var(--ui-space-1));
  padding: calc(var(--ui-space-1) / 2) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-bg);
  color: var(--ui-text-muted);
  white-space: nowrap;
}

.candidate-chip span {
  color: var(--ui-text);
}

.selected-source-note {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
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
  min-height: calc(var(--ui-space-5) + var(--ui-space-1));
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
  max-height: var(--import-preview-list-max-height);
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
  width: var(--import-checkbox-size);
  height: var(--import-checkbox-size);
  margin: 0;
  accent-color: var(--ui-accent);
}

.track-status {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--import-status-min-width);
  max-width: var(--import-status-max-width);
  min-height: calc(var(--ui-space-5) - var(--ui-space-1));
  padding: calc(var(--ui-space-1) / 2) var(--ui-space-2);
  border-radius: var(--ui-radius);
  color: var(--ui-text-muted);
  background: var(--ui-surface-hover);
  font-size: var(--ui-text-sm);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.identity-chip {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--import-status-min-width);
  max-width: var(--import-status-max-width);
  min-height: calc(var(--ui-space-5) - var(--ui-space-1));
  padding: calc(var(--ui-space-1) / 2) var(--ui-space-2);
  border-radius: var(--ui-radius);
  color: var(--ui-text-muted);
  background: var(--ui-bg);
  font-size: var(--ui-text-sm);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.identity-chip--identified {
  color: var(--ui-accent);
}

.identity-chip--review {
  color: var(--ui-danger);
}

.identity-chip--pending {
  color: var(--ui-text-muted);
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
  border-top: var(--import-border-width) solid var(--ui-border);
}

.preview-footer__note {
  min-width: 0;
}

@media (max-width: 920px) {
  .import-control__top,
  .preview-tools {
    align-items: stretch;
    flex-direction: column;
  }

  .download-inline {
    min-width: 0;
    width: 100%;
  }
}

@media (max-width: 680px) {
  .source-row,
  .preview-footer,
  .source-summary__bar {
    align-items: stretch;
    flex-direction: column;
  }

  .preview-tools__actions,
  .candidate-chips {
    justify-content: flex-start;
  }

  .download-inline {
    grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  }
}
</style>
