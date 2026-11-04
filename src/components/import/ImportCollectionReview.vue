<script setup>
import { computed, shallowRef, useTemplateRef, watch } from 'vue';
import { ArrowLeft, ListChecks } from '../../icons/index.js';
import { useImportSession } from '../../composables/useImportSession.js';
import {
  downloadFailureHint,
  downloadFailureTone,
} from '../../utils/downloadFailureDisplay.js';
import PreparationReviewLayout from '../preparation/PreparationReviewLayout.vue';
import ImportCollectionExecutionList from './ImportCollectionExecutionList.vue';
import ImportCollectionSelectionList from './ImportCollectionSelectionList.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import { t } from '../../utils/i18n.js';

const {
  state,
  playlistStats,
  dominantFailureCode,
  allSelected,
  canRetryFailed,
  setTrackSelected,
  cancelTrackDownload,
  toggleSelectAll,
  retryFailedTracks,
} = useImportSession();

const selectionOpen = shallowRef(false);
const reviewLayout = useTemplateRef('reviewLayout');
const hasExecution = computed(() =>
  (state.playlistTracks ?? []).some((track) =>
    ['downloading', 'done', 'error'].includes(track.status),
  ),
);
const executionMode = computed(
  () => state.isImporting || (hasExecution.value && !selectionOpen.value),
);

watch(
  () => state.isImporting,
  (busy) => {
    if (busy) selectionOpen.value = false;
  },
);
watch(
  () => state.playlistTracks,
  () => {
    selectionOpen.value = false;
  },
);
watch(
  [executionMode, () => state.playlistTracks],
  () => reviewLayout.value?.scrollTo({ top: 0 }),
  { flush: 'post' },
);
</script>

<template>
  <PreparationReviewLayout
    ref="reviewLayout"
    :source="state.playlistTitle || t('import.execution.untitledList')"
    :count="playlistStats.total"
    :entity-kind="state.collectionKind === 'album' ? 'album' : 'playlist'"
    :release-type="state.collectionReleaseType || 'unknown'"
    :release-date="state.collectionReleaseDate"
    :cover-url="state.collectionThumbnailUrl || ''"
    :tracks="state.playlistTracks || []"
    :list-label="t('import.collection.listLabel')"
    :aria-label="t('import.collection.reviewLabel')"
  >
    <template v-if="hasExecution && !state.isImporting" #actions>
      <UiIconButton
        :icon="executionMode ? ArrowLeft : ListChecks"
        :label="
          t(
            executionMode
              ? 'import.collection.backToSelection'
              : 'import.collection.viewProgress',
          )
        "
        @click="selectionOpen = !selectionOpen"
      />
    </template>
    <ImportCollectionExecutionList
      v-if="executionMode"
      :tracks="state.playlistTracks"
      :retry-disabled="!canRetryFailed"
      @cancel="cancelTrackDownload"
      @retry-failed="retryFailedTracks"
    />
    <ImportCollectionSelectionList
      v-else
      :tracks="state.playlistTracks || []"
      :busy="state.isImporting"
      :all-selected="allSelected"
      @select-track="setTrackSelected"
      @toggle-select-all="toggleSelectAll"
    />
    <template v-if="dominantFailureCode" #notice>
      <UiHint :tone="downloadFailureTone(dominantFailureCode)" role="status">
        {{ downloadFailureHint(dominantFailureCode) }}
      </UiHint>
    </template>
  </PreparationReviewLayout>
</template>
