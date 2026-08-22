<script setup>
import { computed, useTemplateRef } from 'vue';
import {
  ArrowDownToLine,
  BadgeCheck,
  Check,
  CircleAlert,
  CircleDashed,
  CircleX,
  Download,
  Library,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  SquareCheckBig,
  X,
} from '../../icons/index.js';
import { useImportSession } from '../../composables/useImportSession.js';
import { useRovingRadioGroup } from '../../composables/useRovingRadioGroup.js';
import {
  candidateId,
  candidateSourceLabel,
  identityArtistLabel,
  identityStatusClass,
  identityStatusLabel,
  identityTitle,
} from '../../utils/importCandidateDisplay.js';
import {
  downloadFailureHint,
  downloadFailureLabel,
  downloadFailureTone,
} from '../../utils/downloadFailureDisplay.js';
import ImportCandidateOption from './ImportCandidateOption.vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';

const IDENTITY_STATUS_ICONS = {
  identified: BadgeCheck,
  review: CircleAlert,
  pending: CircleDashed,
};

const IDENTITY_STATUS_TONES = {
  identified: 'success',
  review: 'warning',
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
  downloading: 'info',
  done: 'success',
  downloaded: 'muted',
  error: 'danger',
};

const {
  state,
  playlistStats,
  dominantFailureCode,
  visiblePlaylistTracks,
  selectablePlaylistTracks,
  allSelected,
  canRetryFailed,
  filterOptions,
  confirmImportLabel,
  canUseConfirmButton,
  setInput,
  setActiveFilter,
  setTrackSelected,
  resolveSource,
  confirmImport,
  clearPreview,
  selectImportCandidate,
  toggleSelectAll,
  selectMissingTracks,
  retryFailedTracks,
  getTrackStatusLabel,
  getTrackStatusClass,
} = useImportSession();

const STATUS_TONES = { success: 'success', error: 'danger' };
const statusTone = computed(() => STATUS_TONES[state.statusType] || 'muted');
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

const candidateGroupRef = useTemplateRef('candidateGroup');
const { tabindexFor, handleKeydown: handleCandidateGroupKeydown } =
  useRovingRadioGroup(candidateGroupRef, selectImportCandidate);

function isSelectedCandidate(candidate) {
  return candidateId(candidate) === state.selectedCandidateId;
}

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

// Combines the classified label + hint for the tooltip; raw stderr never
// reaches the renderer (see electron/main.js's classifyingFailures).
function trackStatusIconLabel(track) {
  if (track.status === 'error' && track.errorCode) {
    return `${downloadFailureLabel(track.errorCode)}｜${downloadFailureHint(track.errorCode)}`;
  }
  return getTrackStatusLabel(track);
}
</script>

<template>
  <section
    class="provider-import-panel"
    aria-labelledby="provider-import-title"
  >
    <div class="provider-import-panel__header">
      <div class="section-heading">
        <h2 id="provider-import-title" class="section-heading__title">
          外部來源
        </h2>
        <p class="section-heading__meta">YouTube / YouTube Music</p>
      </div>
    </div>

    <div class="source-row">
      <div class="source-row__input-wrap">
        <input
          :value="state.input"
          class="source-row__input"
          aria-label="YouTube 或 YouTube Music 連結"
          placeholder="貼上歌曲、MV 或播放清單連結"
          :disabled="state.isResolving || state.isImporting"
          @input="setInput($event.target.value)"
          @keydown.enter="resolveSource"
        />
        <UiButton
          v-if="state.input"
          :icon="X"
          class="source-row__clear"
          aria-label="清除輸入內容"
          title="清除輸入內容"
          :disabled="state.isResolving || state.isImporting"
          @click="setInput('')"
        />
      </div>
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

    <UiNotice
      v-if="state.status && state.statusType === 'error'"
      tone="danger"
      title="外部來源操作未完成"
      :message="state.status"
      compact
    />
    <UiHint
      v-else-if="state.status"
      :tone="statusTone"
      role="status"
      style="min-height: var(--ui-space-4)"
    >
      {{ state.status }}
    </UiHint>
    <UiHint v-if="state.failureHint" tone="muted" role="status">
      {{ state.failureHint }}
    </UiHint>

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
              <UiChip>
                {{
                  candidateSourceLabel(selectedCandidate || state.singleTrack)
                }}
              </UiChip>
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
            @click="setActiveFilter(filter.key)"
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
              :checked="track.selected"
              class="preview-track__checkbox"
              type="checkbox"
              :disabled="state.isImporting || track.status === 'done'"
              :aria-label="track.title"
              @change="setTrackSelected(track.id, $event.target.checked)"
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
              :label="trackStatusIconLabel(track)"
            />
          </template>
        </UiTrackRow>
      </ul>

      <UiHint v-if="visiblePlaylistTracks.length === 0" padded center>
        沒有符合目前篩選的曲目
      </UiHint>
      <UiHint
        v-else-if="dominantFailureCode"
        :tone="downloadFailureTone(dominantFailureCode)"
        role="status"
      >
        {{ downloadFailureHint(dominantFailureCode) }}
      </UiHint>

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

    <section v-else class="provider-empty-panel" aria-label="外部來源起始畫面">
      <p>貼上連結後先預覽，確認無誤再下載。</p>
    </section>
  </section>
</template>

<style scoped>
.provider-import-panel {
  --import-control-height: calc(var(--ui-space-5) + var(--ui-space-4));
  --import-track-row-min-height: var(--ui-track-row-min-height);
  --import-preview-list-max-height: calc(var(--ui-space-5) * 15);
  --import-checkbox-size: var(--ui-space-4);

  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  min-width: 0;
  padding: var(--ui-space-3);
  background: var(--ui-color-surface);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
}

.provider-import-panel__header,
.section-heading,
.preview-panel__header,
.source-summary__bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.provider-import-panel__header {
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
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-strong);
}

.section-heading__title,
.preview-panel__title {
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-title);
}

.source-summary__title {
  flex: 0 0 auto;
  font-size: var(--ui-font-size-sm);
}

.section-heading__meta,
.preview-panel__meta,
.provider-empty-panel {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}

.section-heading__meta {
  margin: 0;
}

.source-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  min-height: var(--import-control-height);
}

.source-row__input-wrap {
  position: relative;
  flex: 1;
  min-width: calc(var(--ui-space-5) * 8);
}

.source-row__input {
  width: 100%;
  padding: var(--ui-space-2) var(--ui-space-3);
  padding-right: calc(var(--ui-icon-button-size-md) + var(--ui-space-2));
  min-height: var(--import-control-height);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
}

.source-row__input::placeholder {
  color: var(--ui-color-text-muted);
}

.source-row__input:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.source-row__input:disabled {
  color: var(--ui-color-text-muted);
  opacity: var(--ui-opacity-disabled);
}

.source-row__clear {
  position: absolute;
  top: 50%;
  right: var(--ui-space-1);
  transform: translateY(-50%);
}

.source-row__action {
  min-height: var(--import-control-height);
}

.preview-panel {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  min-width: 0;
  padding: var(--ui-space-3);
  background: var(--ui-color-canvas);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
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
  border-top: var(--ui-border-width) solid var(--ui-color-border);
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
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
  cursor: pointer;
}

.filter-tab:hover {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.filter-tab--active {
  background: var(--ui-color-accent);
  color: var(--ui-color-accent-contrast);
}

.filter-tab--danger:not(.filter-tab--active) {
  color: var(--ui-color-danger);
}

.filter-tab--active.filter-tab--danger {
  background: var(--ui-color-danger);
  color: var(--ui-color-danger-contrast);
}

.filter-tab:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.filter-tab__count {
  font-variant-numeric: tabular-nums;
  opacity: var(--ui-opacity-muted);
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
  background: var(--ui-color-surface);
}

.preview-track--complete {
  color: var(--ui-color-text-muted);
}

.preview-track__checkbox {
  width: var(--import-checkbox-size);
  height: var(--import-checkbox-size);
  margin: 0;
  accent-color: var(--ui-color-accent);
}

.provider-empty-panel p {
  margin: 0;
}

.preview-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-3);
  padding-top: var(--ui-space-2);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

@media (max-width: 900px) {
  .provider-import-panel__header,
  .preview-tools {
    align-items: stretch;
    flex-direction: column;
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
}
</style>
