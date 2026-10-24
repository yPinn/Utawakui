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
const props = defineProps({ batch: { type: Object, required: true } });
const { cancelTrackDownload, retryBatch } = useImportSession();
const progress = computed(() => importBatchProgress(props.batch));
const hint = computed(() =>
  progress.value.total > 0
    ? `${progress.value.phaseLabel} · 已處理 ${progress.value.processed}／${progress.value.total} 首`
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
    list-label="已確認的匯入曲目"
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
        batch.cancelError
          ? '停止下載未完成，工作仍在執行。請再試一次。'
          : batch.saveError
            ? '曲目已下載，但清單未儲存。請重試；已完成的歌曲不會再次下載。'
            : '外部來源尚未準備完成，請到設定完成準備後重試。'
      }}</UiHint>
    </template>
  </PreparationReviewLayout>
</template>
