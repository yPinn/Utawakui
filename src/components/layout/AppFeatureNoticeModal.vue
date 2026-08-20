<script setup>
import { computed } from 'vue';
import { SquareCheckBig } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import { useFeatureGates } from '../../composables/useFeatureGates.js';

const { state, pendingFeature, confirmPendingFeature, cancelPendingFeature } =
  useFeatureGates();

const isOpen = computed(() => Boolean(pendingFeature.value));
const title = computed(() => pendingFeature.value?.title || '啟用功能');
const body = computed(() => pendingFeature.value?.body || []);
</script>

<template>
  <UiModal
    :open="isOpen"
    :title="title"
    size="notice"
    @close="cancelPendingFeature"
  >
    <div v-if="pendingFeature" class="feature-notice">
      <p class="feature-notice__summary">
        {{ pendingFeature.summary }}
      </p>

      <ul class="feature-notice__list">
        <li v-for="line in body" :key="line" class="feature-notice__item">
          {{ line }}
        </li>
      </ul>

      <UiHint v-if="state.error" tone="danger" role="status">
        {{ state.error }}
      </UiHint>

      <div class="feature-notice__actions">
        <UiButton :disabled="state.isSaving" @click="cancelPendingFeature">
          {{ pendingFeature.cancelLabel }}
        </UiButton>
        <UiButton
          :icon="SquareCheckBig"
          variant="accent"
          :disabled="state.isSaving"
          @click="confirmPendingFeature"
        >
          {{ state.isSaving ? '啟用中...' : pendingFeature.confirmLabel }}
        </UiButton>
      </div>
    </div>
  </UiModal>
</template>

<style scoped>
.feature-notice {
  display: grid;
  gap: var(--ui-space-3);
}

.feature-notice__summary {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-body);
}

.feature-notice__list {
  display: grid;
  gap: var(--ui-space-2);
  margin: 0;
  padding-left: var(--ui-space-4);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-body);
}

.feature-notice__item {
  padding-left: var(--ui-space-1);
}

.feature-notice__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
}
</style>
