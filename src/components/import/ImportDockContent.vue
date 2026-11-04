<script setup>
import { computed, shallowRef, watch } from 'vue';
import { useLibraryArtwork } from '../../composables/useLibraryArtwork.js';
import {
  releaseMetadataLabel,
  releaseYearFromDate,
} from '../../utils/releasePresentation.js';
import {
  Download,
  ExternalLink,
  FolderPlus,
  RefreshCw,
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
import ImportSourceField from './ImportSourceField.vue';
import ImportReviewModal from './ImportReviewModal.vue';
import ImportSourceRow from './ImportSourceRow.vue';
import ImportActivityMonitor from './ImportActivityMonitor.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  active: { type: Boolean, default: false },
});
const {
  state: localImportState,
  conversionReviewMessage,
  skippedResults,
  convertPendingFiles,
  importFiles,
} = useLocalImport();
const {
  state,
  activity,
  currentBatchId,
  cancelBatch,
  retryBatch,
  dismissBatch,
  playlistStats,
  setInput,
  resolveSource,
  openYoutubeMusicSearch,
  selectImportCandidate,
  confirmImport,
  getTrackStatusClass,
} = useImportSession();

const reviewOpen = shallowRef(false);
const { collectionArtwork } = useLibraryArtwork();
const reviewBatchId = shallowRef(null);
const reviewBatch = computed(
  () =>
    activity.batches.find((batch) => batch.id === reviewBatchId.value) || null,
);
const monitorBatches = computed(() => {
  const latestComplete = [...activity.batches]
    .reverse()
    .find((batch) => batch.phase === 'completed');
  return activity.batches.filter(
    (batch) => batch.phase !== 'completed' || batch === latestComplete,
  );
});
const sourceBusy = computed(
  () => state.isResolving || state.isOpeningDiscovery,
);
const showLocalStatus = computed(
  () =>
    Boolean(localImportState.message) &&
    !localImportState.summaryNotified &&
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
        title:
          candidate.title ||
          state.singleTrack?.title ||
          t('import.execution.untitledSong'),
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
const collectionSummary = computed(() =>
  collectionArtwork(
    {
      id: state.collectionSource?.id || 'import-collection',
      title: state.playlistTitle || t('import.execution.untitledList'),
      artist: t(
        'import.dock.collectionMeta',
        {
          kind:
            state.collectionKind === 'album'
              ? releaseMetadataLabel(
                  state.collectionReleaseType,
                  releaseYearFromDate(state.collectionReleaseDate),
                )
              : t('import.dock.playlist'),
          count: playlistStats.value.total,
        },
        playlistStats.value.total,
      ),
      thumbnailUrl: state.collectionThumbnailUrl || '',
    },
    state.collectionSource,
  ),
);
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
      label: t('import.dock.stopNamed', {
        title: candidate.title || t('import.dock.thisSong'),
      }),
    };
  }
  if (status === 'pending') {
    return {
      icon: Download,
      label: t('import.dock.downloadNamed', {
        title: candidate.title || t('import.dock.thisSong'),
      }),
    };
  }
  if (status === 'error') {
    return {
      icon: RefreshCw,
      label: t('import.dock.retryNamed', {
        title: candidate.title || t('import.dock.thisSong'),
      }),
    };
  }
  return { icon: null, label: '' };
}

function candidateActionDisabled(candidate) {
  if (statusForCandidate(candidate) === 'downloading') return false;
  return sourceBusy.value || state.isImporting;
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
  reviewBatchId.value = state.isImporting ? currentBatchId.value : null;
  reviewOpen.value = true;
}

function openBatchReview(batchId) {
  reviewBatchId.value = batchId;
  reviewOpen.value = true;
}

function handleSubmitted(batchId) {
  reviewBatchId.value = batchId;
}

function dismissWork(batchId) {
  if (reviewBatchId.value === batchId) reviewOpen.value = false;
  dismissBatch(batchId);
}

watch(
  () => props.active,
  (active) => {
    if (!active) reviewOpen.value = false;
  },
);
</script>

<template>
  <div class="import-dock-content">
    <ImportReviewModal
      :open="reviewOpen"
      :batch="reviewBatch"
      @close="reviewOpen = false"
      @submitted="handleSubmitted"
    />

    <AppRightDockSection :heading="t('import.dock.localAudio')">
      <template #trailing>
        <UiIconButton
          :icon="FolderPlus"
          :label="t('import.dock.chooseFiles')"
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
        :title="t('import.dock.needsConversion')"
        :message="conversionReviewMessage"
        :action-label="t('import.dock.convertAndImport')"
        :action-disabled="localImportState.isConverting"
        compact
        @action="convertPendingFiles"
      />

      <UiNotice
        v-if="showLocalStatus && localImportState.statusType === 'error'"
        tone="danger"
        :title="t('import.dock.localFailed')"
        :message="localImportState.message"
        :action-label="t('import.dock.retry')"
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
        v-if="skippedResults?.length"
        class="import-dock-content__rows"
        :aria-label="t('import.dock.skippedFiles')"
      >
        <li v-for="(item, index) in skippedResults" :key="index">
          <UiHint>{{ item.filename }} · {{ item.message }}</UiHint>
        </li>
      </ul>

      <ul
        v-if="localImportState.imported.length"
        class="import-dock-content__rows"
        :aria-label="t('import.dock.localResults')"
      >
        <ImportSourceRow
          v-for="track in localImportState.imported"
          :key="track.id"
          :track="track"
          status="done"
        />
      </ul>
    </AppRightDockSection>

    <AppRightDockSection :heading="t('import.dock.external')" divided>
      <template #trailing>
        <UiIconButton
          :icon="ExternalLink"
          :label="t('import.dock.moreOnYtMusic')"
          :disabled="!state.input.trim() || sourceBusy"
          @click="openYoutubeMusicSearch"
        />
      </template>
      <ImportSourceField
        :model-value="state.input"
        :active="active"
        :busy="sourceBusy"
        :resolving="state.isResolving"
        @update:model-value="setInput"
        @resolve="resolveSource"
      />

      <UiNotice
        v-if="showExternalStatus && state.statusType === 'error'"
        tone="danger"
        :title="t('import.dock.externalFailed')"
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
        :aria-label="t('import.dock.candidates')"
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
        :aria-label="t('import.dock.pendingList')"
      >
        <ImportSourceRow
          :track="collectionSummary"
          :status="collectionStatus"
          row-action
          :action-label="
            t('import.dock.reviewNamed', { title: collectionSummary.title })
          "
          @action="openCollectionReview"
        />
      </ul>
    </AppRightDockSection>
    <ImportActivityMonitor
      v-for="batch in monitorBatches"
      :key="batch.id"
      :batch="batch"
      @review="openBatchReview"
      @cancel="cancelBatch"
      @retry="retryBatch"
      @dismiss="dismissWork"
    />
  </div>
</template>

<style scoped>
.import-dock-content {
  display: grid;
  gap: var(--ui-right-dock-section-gap);
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
