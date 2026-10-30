<script setup>
import { onMounted } from 'vue';
import { useAutoErrorReport } from '../../composables/useAutoErrorReport.js';
import UiButton from '../ui/UiButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiModal from '../ui/UiModal.vue';
import { t } from '../../utils/i18n.js';

const { state, initialize, respond } = useAutoErrorReport();

onMounted(initialize);
</script>

<template>
  <UiModal
    :open="Boolean(state.prompt)"
    :title="t('autoReport.title')"
    size="notice"
    @close="respond('dismiss')"
  >
    <div v-if="state.prompt" class="auto-error-report">
      <p class="auto-error-report__lead">
        {{
          state.prompt.occurrences > 1
            ? t('autoReport.leadRepeated', {
                error: state.prompt.title,
                count: state.prompt.occurrences,
              })
            : t('autoReport.lead', { error: state.prompt.title })
        }}
      </p>
      <p class="auto-error-report__scope">
        {{ t('autoReport.scope') }}
      </p>
      <UiDisclosure
        v-if="state.prompt.message"
        :label="t('autoReport.viewDetails')"
      >
        <p class="auto-error-report__message">{{ state.prompt.message }}</p>
      </UiDisclosure>
    </div>
    <template #footer>
      <UiButton
        variant="ghost"
        :disabled="state.busy"
        @click="respond('never')"
        >{{ t('autoReport.never') }}</UiButton
      >
      <UiButton :disabled="state.busy" @click="respond('once')">{{
        t('autoReport.once')
      }}</UiButton>
      <UiButton
        variant="accent"
        :loading="state.busy"
        @click="respond('always')"
        >{{ t('autoReport.always') }}</UiButton
      >
    </template>
  </UiModal>
</template>

<style scoped>
.auto-error-report {
  display: grid;
  gap: var(--ui-space-3);
}

.auto-error-report__lead,
.auto-error-report__scope,
.auto-error-report__message {
  margin: 0;
}

.auto-error-report__scope {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}

.auto-error-report__message {
  font-size: var(--ui-type-caption-size);
  overflow-wrap: anywhere;
}
</style>
