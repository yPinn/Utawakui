<script setup>
import { computed } from 'vue';
import { useImportSession } from '../../composables/useImportSession.js';
import {
  importBatchProgress,
  isImportBatchRunning,
} from '../../utils/importBatch.js';
import PreparationReviewLayout from '../preparation/PreparationReviewLayout.vue';
import UiHint from '../ui/UiHint.vue';
import ImportCollectionExecutionList from './ImportCollectionExecutionList.vue';
import { t } from '../../utils/i18n.js';
const props = defineProps({ batch: { type: Object, required: true } });
const { cancelTrackDownload, retryBatch } = useImportSession();
const progress = computed(() => importBatchProgress(props.batch));
const hint = computed(() =>
  progress.value.total > 0
    ? t('import.batchReview.progress', {
        phase: progress.value.phaseLabel,
        processed: progress.value.processed,
        total: progress.value.total,
      })
    : progress.value.phaseLabel,
);
</script>
<template>
  <PreparationReviewLayout
    :source="batch.title"
    :count="batch.tracks.length"
    :entity-kind="
      batch.kind === 'single' || batch.collectionKind === 'album'
        ? 'album'
        : 'playlist'
    "
    :release-type="
      batch.kind === 'single' ? 'single' : batch.releaseType || 'unknown'
    "
    :release-date="batch.releaseDate"
    :cover-url="batch.thumbnailUrl || ''"
    :tracks="batch.tracks"
    :hint="hint"
    :list-label="t('import.batchReview.listLabel')"
  >
    <ImportCollectionExecutionList
      :tracks="batch.tracks"
      :retry-disabled="isImportBatchRunning(batch)"
      @cancel="cancelTrackDownload($event, batch.id)"
      @retry-failed="retryBatch(batch.id)"
    />
    <template
      v-if="batch.saveError || batch.setupRequired || batch.cancelError"
      #notice
    >
      <UiHint tone="warning" role="status">{{
        t(
          batch.cancelError
            ? 'import.batchReview.cancelFailed'
            : batch.saveError
              ? 'import.batchReview.saveFailed'
              : 'import.batchReview.providerNotReady',
        )
      }}</UiHint>
    </template>
  </PreparationReviewLayout>
</template>
