<script setup>
import { computed } from 'vue';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import UiButton from '../ui/UiButton.vue';
import UiModal from '../ui/UiModal.vue';

const confirmation = useAppConfirmation();
const request = computed(() => confirmation.state.request);
const isOpen = computed(() => Boolean(request.value));
const title = computed(() => request.value?.title || '確認操作');
</script>

<template>
  <UiModal
    :open="isOpen"
    :title="title"
    size="notice"
    :selectable="false"
    @close="confirmation.cancel"
  >
    <div v-if="request" class="app-confirmation">
      <div v-if="request.subject" class="app-confirmation__summary">
        <strong class="app-confirmation__subject">{{ request.subject }}</strong>
        <span v-if="request.meta" class="app-confirmation__meta">
          {{ request.meta }}
        </span>
      </div>
      <div class="app-confirmation__copy">
        <p class="app-confirmation__message">{{ request.message }}</p>
        <p v-if="request.detail" class="app-confirmation__detail">
          {{ request.detail }}
        </p>
      </div>
    </div>

    <template v-if="request" #footer>
      <UiButton variant="secondary" @click="confirmation.cancel">
        {{ request.cancelLabel }}
      </UiButton>
      <UiButton
        variant="accent"
        :intent="request.intent"
        @click="confirmation.accept"
      >
        {{ request.confirmLabel }}
      </UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.app-confirmation {
  display: grid;
  gap: var(--ui-space-3);
}

.app-confirmation__summary {
  min-inline-size: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ui-space-1) var(--ui-space-3);
}

.app-confirmation__subject {
  min-inline-size: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
  overflow-wrap: anywhere;
}

.app-confirmation__meta {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  font-variant-numeric: tabular-nums;
}

.app-confirmation__copy {
  display: grid;
  gap: var(--ui-space-2);
}

.app-confirmation__message,
.app-confirmation__detail {
  margin: 0;
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-body);
}

.app-confirmation__message {
  color: var(--ui-color-text);
}

.app-confirmation__detail {
  color: var(--ui-color-text-muted);
}
</style>
