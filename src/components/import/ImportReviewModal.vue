<script setup>
import { computed, shallowRef } from 'vue';
import { Download, RefreshCw, Square } from '../../icons/index.js';
import { useImportSession } from '../../composables/useImportSession.js';
import { isImportBatchRunning } from '../../utils/importBatch.js';
import ImportCollectionReview from './ImportCollectionReview.vue';
import ImportBatchReview from './ImportBatchReview.vue';
import UiButton from '../ui/UiButton.vue';
import UiModal from '../ui/UiModal.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  batch: { type: Object, default: null },
});
const emit = defineEmits(['close', 'submitted']);
const {
  state,
  canUseConfirmButton,
  confirmImportLabel,
  submitImport,
  cancelBatch,
  retryBatch,
} = useImportSession();
const submitting = shallowRef(false);
const albumTitleKey = computed(() => {
  const type = props.batch?.releaseType || state.collectionReleaseType;
  return ['single', 'ep', 'album'].includes(type) ? type : 'work';
});
const modalTitle = computed(() =>
  props.batch?.kind === 'single'
    ? t('import.review.titles.song')
    : (props.batch?.collectionKind || state.collectionKind) === 'album'
      ? t(`import.review.titles.${albumTitleKey.value}`)
      : t('import.review.titles.playlist'),
);
const running = computed(() => isImportBatchRunning(props.batch));
const actionLabel = computed(() =>
  props.batch
    ? props.batch.phase === 'finalizing'
      ? t('import.review.finalizing')
      : running.value
        ? t('import.review.stopBatch')
        : t('import.review.retryUnfinished')
    : confirmImportLabel.value,
);
const actionIcon = computed(() =>
  props.batch ? (running.value ? Square : RefreshCw) : Download,
);
const disabled = computed(
  () =>
    submitting.value ||
    (props.batch
      ? props.batch.phase === 'finalizing' ||
        (props.batch.cancelRequested && running.value)
      : !canUseConfirmButton.value),
);
async function confirm() {
  if (disabled.value) return;
  if (props.batch) {
    if (running.value) await cancelBatch(props.batch.id);
    else await retryBatch(props.batch.id);
    return;
  }
  submitting.value = true;
  try {
    const id = await submitImport();
    if (id) emit('submitted', id);
  } finally {
    submitting.value = false;
  }
}
</script>
<template>
  <UiModal
    :open="open"
    :title="modalTitle"
    size="wide"
    max-block-size="medium"
    body-mode="workspace"
    :selectable="false"
    @close="emit('close')"
  >
    <ImportBatchReview v-if="batch" :batch="batch" />
    <ImportCollectionReview v-else />
    <template v-if="!batch || batch.phase !== 'completed'" #footer>
      <UiButton
        :icon="actionIcon"
        variant="accent"
        :disabled="disabled"
        :loading="submitting"
        :loading-label="t('import.review.adding')"
        @click="confirm"
        >{{ actionLabel }}</UiButton
      >
    </template>
  </UiModal>
</template>
