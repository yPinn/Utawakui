<script setup>
import { computed, shallowRef, watch } from 'vue';
import {
  Download,
  ExternalLink,
  FolderPlus,
  RefreshCw,
  Search,
  Square,
} from '../../icons/index.js';
import { useImportSession } from '../../composables/useImportSession.js';
import { useLocalImport } from '../../composables/useLocalImport.js';
import {
  candidateId,
  playbackKindLabel,
} from '../../utils/importCandidateDisplay.js';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import ImportReviewModal from './ImportReviewModal.vue';
import ImportSourceRow from './ImportSourceRow.vue';

const props = defineProps({
  active: { type: Boolean, default: false },
});
const {
  state: localImportState,
  conversionReviewMessage,
  convertPendingFiles,
  importFiles,
} = useLocalImport();
const {
  state,
  playlistStats,
  setInput,
  resolveSource,
  openYoutubeMusicSearch,
  selectImportCandidate,
  confirmImport,
  getTrackStatusClass,
} = useImportSession();

const reviewOpen = shallowRef(false);
const sourceBusy = computed(
  () => state.isResolving || state.isOpeningDiscovery || state.isImporting,
);
const showLocalStatus = computed(
  () =>
    Boolean(localImportState.message) &&
    !localImportState.conversionReview &&
    (localImportState.statusType !== 'success' ||
      localImportState.imported.length === 0 ||
      localImportState.skipped.length > 0),
);
const candidateRows = computed(() => {
  const candidates = state.singleResolution?.candidates;
  const sourceRows = candidates?.length ? candidates : [state.singleTrack];
  return sourceRows.filter(Boolean).map((candidate) => {
    const version = playbackKindLabel(candidate.playbackKind);
    return {
      source: candidate,
      track: {
        id: candidateId(candidate) || state.singleTrack?.id || state.input,
        title: candidate.title || state.singleTrack?.title || '未命名歌曲',
        artist: [candidate.artist || state.singleTrack?.artist, version]
          .filter(Boolean)
          .join(' · '),
        duration: candidate.duration || state.singleTrack?.duration,
        thumbnailUrl:
          candidate.thumbnailUrl || state.singleTrack?.thumbnailUrl || '',
      },
    };
  });
});
const collectionSummary = computed(() => ({
  id: state.collectionSource?.id || 'import-collection',
  title: state.playlistTitle || '未命名清單',
  artist: `${state.collectionKind === 'album' ? '專輯' : '播放清單'} · ${playlistStats.value.total} 首`,
  thumbnailUrl: state.collectionThumbnailUrl || '',
}));
const collectionStatus = computed(() => {
  if (state.isImporting) return 'downloading';
  if (state.statusType === 'error' && playlistStats.value.error > 0) {
    return 'error';
  }
  if (state.statusType === 'success' && playlistStats.value.completedLike > 0) {
    return 'done';
  }
  return 'pending';
});
const externalObjectOwnsSuccess = computed(() => {
  if (state.sourceKind === 'single')
    return state.singleTrack?.status === 'done';
  if (state.sourceKind === 'playlist') return collectionStatus.value === 'done';
  return false;
});
const showExternalStatus = computed(
  () =>
    Boolean(state.status) &&
    !(state.statusType === 'success' && externalObjectOwnsSuccess.value),
);

function statusForCandidate(candidate) {
  const id = candidateId(candidate);
  if (id === state.selectedCandidateId && state.singleTrack) {
    return getTrackStatusClass(state.singleTrack);
  }
  return candidate.alreadyDownloaded
    ? 'downloaded'
    : candidate.status || 'pending';
}

function actionForCandidate(candidate) {
  const status = statusForCandidate(candidate);
  if (status === 'downloading') {
    return {
      icon: Square,
      label: `停止下載 ${candidate.title || '這首歌曲'}`,
    };
  }
  if (status === 'pending') {
    return {
      icon: Download,
      label: `下載 ${candidate.title || '這首歌曲'}`,
    };
  }
  if (status === 'error') {
    return {
      icon: RefreshCw,
      label: `重試 ${candidate.title || '這首歌曲'}`,
    };
  }
  return { icon: null, label: '' };
}

function candidateActionDisabled(candidate) {
  if (statusForCandidate(candidate) === 'downloading') return false;
  return sourceBusy.value;
}

async function downloadCandidate(candidate) {
  const status = statusForCandidate(candidate);
  if (sourceBusy.value && status !== 'downloading') return;
  const id = candidateId(candidate);
  if (status !== 'downloading' && id && state.singleResolution) {
    selectImportCandidate(id);
  }
  await confirmImport();
}

function openCollectionReview() {
  reviewOpen.value = true;
}

watch(
  () => props.active,
  (active) => {
    if (!active) reviewOpen.value = false;
  },
);

watch(
  () => state.isImporting,
  (isImporting, wasImporting) => {
    if (
      reviewOpen.value &&
      wasImporting &&
      !isImporting &&
      state.statusType === 'success'
    ) {
      reviewOpen.value = false;
    }
  },
);
</script>

<template>
  <div class="import-dock-content">
    <ImportReviewModal
      :open="reviewOpen"
      :close-disabled="state.isImporting"
      @close="reviewOpen = false"
    />

    <AppRightDockSection heading="本機音訊">
      <template #trailing>
        <UiIconButton
          :icon="FolderPlus"
          label="選擇音訊檔"
          :disabled="
            localImportState.isImporting || localImportState.isConverting
          "
          :aria-busy="
            localImportState.isImporting || localImportState.isConverting
          "
          @click="importFiles"
        />
      </template>

      <UiNotice
        v-if="localImportState.conversionReview"
        tone="warning"
        title="需要相容轉檔"
        :message="conversionReviewMessage"
        action-label="轉成 FLAC 並匯入"
        :action-disabled="localImportState.isConverting"
        compact
        @action="convertPendingFiles"
      />

      <UiNotice
        v-if="showLocalStatus && localImportState.statusType === 'error'"
        tone="danger"
        title="本機匯入未完成"
        :message="localImportState.message"
        action-label="重試"
        compact
        @action="importFiles"
      />
      <UiHint
        v-else-if="showLocalStatus"
        :tone="localImportState.statusType === 'success' ? 'success' : 'muted'"
        role="status"
      >
        {{ localImportState.message }}
      </UiHint>

      <ul
        v-if="localImportState.imported.length"
        class="import-dock-content__rows"
        aria-label="本機匯入結果"
      >
        <ImportSourceRow
          v-for="track in localImportState.imported"
          :key="track.id"
          :track="track"
          status="done"
        />
      </ul>
    </AppRightDockSection>

    <AppRightDockSection heading="外部來源" divided>
      <template #trailing>
        <UiIconButton
          :icon="ExternalLink"
          label="到 YT Music 尋找更多結果"
          :disabled="!state.input.trim() || sourceBusy"
          @click="openYoutubeMusicSearch"
        />
      </template>
      <form
        class="import-dock-content__source-form"
        @submit.prevent="resolveSource"
      >
        <UiSearchBox
          :model-value="state.input"
          label="歌曲名稱或外部來源連結"
          placeholder="搜尋歌名、歌手或貼上連結"
          :disabled="sourceBusy"
          @update:model-value="setInput"
        />
        <UiIconButton
          :icon="Search"
          label="搜尋外部來源"
          variant="accent"
          :disabled="!state.input.trim() || sourceBusy"
          :aria-busy="state.isResolving"
          @click="resolveSource"
        />
      </form>

      <UiNotice
        v-if="showExternalStatus && state.statusType === 'error'"
        tone="danger"
        title="外部來源操作未完成"
        :message="state.status"
        compact
      />
      <UiHint
        v-else-if="showExternalStatus"
        :tone="state.statusType === 'success' ? 'success' : 'muted'"
        role="status"
      >
        {{ state.status }}
      </UiHint>
      <UiHint v-if="state.failureHint" tone="muted" role="status">
        {{ state.failureHint }}
      </UiHint>

      <ul
        v-if="state.sourceKind === 'single' && candidateRows.length"
        class="import-dock-content__rows"
        aria-label="可下載的音源"
      >
        <ImportSourceRow
          v-for="entry in candidateRows"
          :key="entry.track.id"
          :track="entry.track"
          :status="statusForCandidate(entry.source)"
          :action-icon="actionForCandidate(entry.source).icon"
          :action-label="actionForCandidate(entry.source).label"
          :action-disabled="candidateActionDisabled(entry.source)"
          @action="downloadCandidate(entry.source)"
        />
      </ul>

      <ul
        v-else-if="state.sourceKind === 'playlist'"
        class="import-dock-content__rows"
        aria-label="待確認的匯入清單"
      >
        <ImportSourceRow
          :track="collectionSummary"
          :status="collectionStatus"
          row-action
          :action-label="`檢視 ${collectionSummary.title}`"
          :action-disabled="state.isImporting"
          @action="openCollectionReview"
        />
      </ul>
    </AppRightDockSection>
  </div>
</template>

<style scoped>
.import-dock-content {
  display: grid;
  gap: var(--ui-right-dock-section-gap);
  min-inline-size: 0;
}

.import-dock-content__source-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
  min-inline-size: 0;
}

.import-dock-content__rows {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
