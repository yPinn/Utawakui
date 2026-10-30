<script setup>
import { computed } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  remember: { type: Boolean, default: false },
  isResponding: { type: Boolean, default: false },
  pendingAction: { type: String, default: '' },
  activeWork: { type: String, default: '' },
  presentation: { type: String, default: 'decision' },
  errorTitle: { type: String, default: '' },
  error: { type: String, default: '' },
});

const emit = defineEmits(['close', 'decision', 'update:remember']);
const hasActiveSeparation = computed(() => props.activeWork === 'separation');
const isErrorPresentation = computed(() => props.presentation === 'error');
const modalTitle = computed(() =>
  isErrorPresentation.value
    ? props.errorTitle || t('windowClose.errorTitle')
    : t(
        hasActiveSeparation.value
          ? 'windowClose.separationTitle'
          : 'windowClose.title',
      ),
);
</script>

<template>
  <UiModal
    :open="open"
    :title="modalTitle"
    size="notice"
    @close="emit('close')"
  >
    <div class="window-close-decision">
      <UiNotice
        v-if="isErrorPresentation"
        tone="danger"
        :title="errorTitle"
        :message="error"
        compact
      />

      <div v-else class="window-close-decision__copy">
        <p class="window-close-decision__question">
          {{
            t(
              hasActiveSeparation
                ? 'windowClose.modal.separationQuestion'
                : 'windowClose.modal.backgroundQuestion',
            )
          }}
        </p>
        <p class="window-close-decision__detail">
          {{
            t(
              hasActiveSeparation
                ? 'windowClose.modal.separationDetail'
                : 'windowClose.modal.backgroundDetail',
            )
          }}
        </p>
      </div>

      <UiCheckbox
        v-if="!isErrorPresentation && !hasActiveSeparation"
        id="window-close-remember"
        :model-value="remember"
        :label="t('windowClose.remember')"
        :disabled="isResponding"
        @update:model-value="emit('update:remember', $event)"
      />

      <UiNotice
        v-if="!isErrorPresentation && error"
        tone="danger"
        :title="t('windowClose.errorTitle')"
        :message="error"
        compact
      />

      <div class="window-close-decision__actions">
        <UiButton
          v-if="isErrorPresentation"
          variant="accent"
          @click="emit('close')"
        >
          {{ t('common.close') }}
        </UiButton>
        <UiButton
          v-if="!isErrorPresentation"
          :disabled="isResponding"
          @click="emit('close')"
        >
          {{ t('common.cancel') }}
        </UiButton>
        <UiButton
          v-if="!isErrorPresentation"
          :intent="hasActiveSeparation ? 'danger' : 'neutral'"
          :disabled="isResponding"
          :loading="pendingAction === 'quit'"
          :loading-label="t('windowClose.modal.quitting')"
          @click="emit('decision', 'quit')"
        >
          {{
            t(
              hasActiveSeparation
                ? 'windowClose.modal.stopAndQuit'
                : 'windowClose.modal.quit',
            )
          }}
        </UiButton>
        <UiButton
          v-if="!isErrorPresentation"
          variant="accent"
          :disabled="isResponding"
          :loading="pendingAction === 'tray'"
          :loading-label="t('ui.button.loading')"
          @click="emit('decision', 'tray')"
        >
          {{
            t(
              hasActiveSeparation
                ? 'windowClose.modal.continueProcessing'
                : 'windowClose.modal.background',
            )
          }}
        </UiButton>
      </div>
    </div>
  </UiModal>
</template>

<style scoped>
.window-close-decision {
  display: grid;
  gap: var(--ui-space-4);
}

.window-close-decision__copy {
  display: grid;
  gap: var(--ui-space-2);
}

.window-close-decision__question,
.window-close-decision__detail {
  margin: 0;
  line-height: var(--ui-type-body-line-height);
}

.window-close-decision__question {
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-font-weight-semibold);
}

.window-close-decision__detail {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-body-compact-size);
}

.window-close-decision__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}
</style>
