<script setup>
import { computed } from 'vue';
import { Download, Square } from '../../icons/index.js';
import { useImportSession } from '../../composables/useImportSession.js';
import ImportCollectionReview from './ImportCollectionReview.vue';
import UiButton from '../ui/UiButton.vue';
import UiModal from '../ui/UiModal.vue';

defineProps({
  open: { type: Boolean, default: false },
  closeDisabled: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);
const { state, canUseConfirmButton, confirmImportLabel, confirmImport } =
  useImportSession();

const modalTitle = computed(() =>
  state.collectionKind === 'album' ? '確認匯入專輯' : '確認匯入播放清單',
);
const confirmIcon = computed(() => (state.isImporting ? Square : Download));
</script>

<template>
  <UiModal
    :open="open"
    :title="modalTitle"
    size="wide"
    max-block-size="medium"
    :close-disabled="closeDisabled"
    @close="emit('close')"
  >
    <ImportCollectionReview />
    <template #footer>
      <UiButton
        :icon="confirmIcon"
        variant="accent"
        :disabled="!canUseConfirmButton"
        @click="confirmImport"
      >
        {{ confirmImportLabel }}
      </UiButton>
    </template>
  </UiModal>
</template>
