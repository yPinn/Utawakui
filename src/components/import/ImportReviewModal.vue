<script setup>
import { computed, shallowRef } from 'vue';
import { releaseTypeLabel } from '../../utils/releasePresentation.js';
import { Download, RefreshCw, Square } from '../../icons/index.js';
import { useImportSession } from '../../composables/useImportSession.js';
import { isImportBatchRunning } from '../../utils/importBatch.js';
import ImportCollectionReview from './ImportCollectionReview.vue';
import ImportBatchReview from './ImportBatchReview.vue';
import UiButton from '../ui/UiButton.vue';
import UiModal from '../ui/UiModal.vue';

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
const modalTitle = computed(() =>
  props.batch?.kind === 'single'
    ? '匯入歌曲'
    : (props.batch?.collectionKind || state.collectionKind) === 'album'
      ? `匯入${['single', 'ep', 'album'].includes(props.batch?.releaseType || state.collectionReleaseType) ? releaseTypeLabel(props.batch?.releaseType || state.collectionReleaseType) : '作品'}`
      : '匯入播放清單',
);
const running = computed(() => isImportBatchRunning(props.batch));
const actionLabel = computed(() =>
  props.batch
    ? props.batch.phase === 'finalizing'
      ? '正在整理清單'
      : running.value
        ? '停止這批'
        : '重試未完成工作'
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
        loading-label="加入中"
        @click="confirm"
        >{{ actionLabel }}</UiButton
      >
    </template>
  </UiModal>
</template>
