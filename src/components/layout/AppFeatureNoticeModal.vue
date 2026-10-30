<script setup>
import { computed } from 'vue';
import { SquareCheckBig } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import AppFeatureNoticeDocument from './AppFeatureNoticeDocument.vue';
import { useFeatureGates } from '../../composables/useFeatureGates.js';
import { t } from '../../utils/i18n.js';

const { state, pendingFeature, confirmPendingFeature, cancelPendingFeature } =
  useFeatureGates();

const isOpen = computed(() => Boolean(pendingFeature.value));
const title = computed(
  () => pendingFeature.value?.documentTitle || t('shell.featureNotice.title'),
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
        v-if="state.confirmError"
        tone="danger"
        :title="t('shell.featureNotice.disabledTitle')"
        :message="state.confirmError"
        compact
      />
    </AppFeatureNoticeDocument>
    <template v-if="pendingFeature" #footer>
      <UiButton :disabled="state.isSaving" @click="cancelPendingFeature">
        {{ t('shell.featureNotice.decline') }}
      </UiButton>
      <UiButton
        :icon="SquareCheckBig"
        variant="accent"
        :disabled="state.isSaving"
        @click="confirmPendingFeature"
      >
        {{
          t(
            state.isSaving
              ? 'shell.featureNotice.enabling'
              : 'shell.featureNotice.confirm',
          )
        }}
      </UiButton>
    </template>
  </UiModal>
</template>
