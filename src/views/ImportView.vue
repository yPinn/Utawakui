<script setup>
import { computed, onMounted, useTemplateRef } from 'vue';
import {
  ArrowDownToLine,
  BadgeCheck,
  Check,
  CircleAlert,
  CircleDashed,
  CircleX,
  Download,
  FolderOpen,
  Library,
  ListChecks,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  SquareCheckBig,
  X,
} from '@lucide/vue';
import ImportCandidateOption from '../components/import/ImportCandidateOption.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiPageHeader from '../components/ui/UiPageHeader.vue';
import UiStatusIcon from '../components/ui/UiStatusIcon.vue';
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

// Icon + tone lookups for the row-level status badges (see #trail below).
// Kept component-local rather than in
// importCandidateDisplay.js/useImportSession.js — those are plain-Node-
// testable modules, and importing @lucide/vue's Vue components into them
// would pull a UI dependency into pure logic layers.
const IDENTITY_STATUS_ICONS = {
  identified: BadgeCheck,
  review: CircleAlert,
  pending: CircleDashed,
};

const IDENTITY_STATUS_TONES = {
  identified: 'accent',
  review: 'danger',
  pending: 'muted',
};

const TRACK_STATUS_ICONS = {
  pending: ArrowDownToLine,
  downloading: Loader2,
  done: Check,
  downloaded: Library,
  error: CircleX,
};

const TRACK_STATUS_TONES = {
  pending: 'muted',
  downloading: 'accent',
  done: 'accent',
  downloaded: 'muted',
  error: 'danger',
};

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

function identityIconFor(track) {
  return (
    IDENTITY_STATUS_ICONS[identityStatusClass(trackIdentityFor(track))] ||
    CircleDashed
  );
}

function identityToneFor(track) {
  return (
    IDENTITY_STATUS_TONES[identityStatusClass(trackIdentityFor(track))] ||
    'muted'
  );
}

function trackStatusIconFor(track) {
  return TRACK_STATUS_ICONS[getTrackStatusClass(track)] || ArrowDownToLine;
}

function trackStatusToneFor(track) {
  return TRACK_STATUS_TONES[getTrackStatusClass(track)] || 'muted';
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
                <UiStatusIcon
                  v-if="trackIdentityFor(state.singleTrack)"
                  :icon="identityIconFor(state.singleTrack)"
                  :tone="identityToneFor(state.singleTrack)"
                  :label="
                    identityStatusLabel(trackIdentityFor(state.singleTrack))
                  "
                />
                <UiStatusIcon
                  :icon="trackStatusIconFor(state.singleTrack)"
                  :tone="trackStatusToneFor(state.singleTrack)"
                  :spinning="
                    getTrackStatusClass(state.singleTrack) === 'downloading'
                  "
                  :label="getTrackStatusLabel(state.singleTrack)"
                />
              </template>
            </UiTrackRow>
          </ul>
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
            {{ state.collectionKind === 'album' ? '專輯' : '播放清單' }} ·
            {{ playlistStats.total }} 首
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

      <div class="preview-tools">
        <div class="filter-tabs" aria-label="預覽篩選">
          <button
            v-for="filter in filterOptions"
            :key="filter.key"
            type="button"
            class="filter-tab"
            :class="{
              'filter-tab--active': state.activeFilter === filter.key,
              'filter-tab--danger': filter.key === 'failed' && filter.count > 0,
            }"
            :aria-pressed="state.activeFilter === filter.key"
            @click="state.activeFilter = filter.key"
          >
            <span>{{ filter.label }}</span>
            <span class="filter-tab__count">{{ filter.count }}</span>
          </button>
        </div>

        <div class="preview-tools__actions">
          <UiButton
            :icon="ListChecks"
            :disabled="state.isImporting"
            @click="selectMissingTracks"
          >
            選取未下載
          </UiButton>
          <UiButton
            :icon="SquareCheckBig"
            :active="allSelected"
            :disabled="
              state.isImporting || selectablePlaylistTracks.length === 0
            "
            :aria-pressed="allSelected"
            @click="toggleSelectAll"
          >
            {{ allSelected ? '取消全選' : '全選' }}
          </UiButton>
          <UiButton
            v-if="playlistStats.error > 0"
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
              :disabled="state.isImporting || track.status === 'done'"
              :aria-label="track.title"
            />
          </template>
          <template #trail>
            <UiStatusIcon
              v-if="trackIdentityFor(track)"
              :icon="identityIconFor(track)"
              :tone="identityToneFor(track)"
              :label="identityStatusLabel(trackIdentityFor(track))"
            />
            <UiStatusIcon
              :icon="trackStatusIconFor(track)"
              :tone="trackStatusToneFor(track)"
              :spinning="getTrackStatusClass(track) === 'downloading'"
              :label="track.error || getTrackStatusLabel(track)"
            />
          </template>
        </UiTrackRow>
      </ul>

      <p v-if="visiblePlaylistTracks.length === 0" class="empty-state">
        沒有符合目前篩選的曲目
      </p>

      <div class="preview-footer">
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

.filter-tab--danger:not(.filter-tab--active) {
  color: var(--ui-danger);
}

.filter-tab--active.filter-tab--danger {
  background: var(--ui-danger);
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
  justify-content: flex-end;
  gap: var(--ui-space-3);
  padding-top: var(--ui-space-2);
  border-top: var(--import-border-width) solid var(--ui-border);
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
