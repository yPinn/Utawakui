<script setup>
import { computed } from 'vue';
import { SquareCheckBig } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import AppFeatureNoticeDocument from './AppFeatureNoticeDocument.vue';
import { useFeatureGates } from '../../composables/useFeatureGates.js';

const { state, pendingFeature, confirmPendingFeature, cancelPendingFeature } =
  useFeatureGates();

const isOpen = computed(() => Boolean(pendingFeature.value));
const title = computed(
  () => pendingFeature.value?.documentTitle || '功能啟用說明',
);
</script>

<template>
  <UiModal
    :open="isOpen"
    :title="title"
    size="wide"
    max-block-size="medium"
    presentation="document"
    :close-disabled="state.isSaving"
    @close="cancelPendingFeature"
  >
    <AppFeatureNoticeDocument v-if="pendingFeature" :feature="pendingFeature">
      <UiNotice
        v-if="state.error"
        tone="danger"
        title="功能未啟用"
        :message="state.error"
        compact
      />
    </AppFeatureNoticeDocument>
    <template v-if="pendingFeature" #footer>
      <UiButton :disabled="state.isSaving" @click="cancelPendingFeature">
        暫不啟用
      </UiButton>
      <UiButton
        :icon="SquareCheckBig"
        variant="accent"
        :disabled="state.isSaving"
        @click="confirmPendingFeature"
      >
        {{ state.isSaving ? '啟用中…' : '確認並啟用' }}
      </UiButton>
    </template>
  </UiModal>
</template>
