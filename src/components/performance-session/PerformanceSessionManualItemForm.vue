<script setup>
import { shallowRef } from 'vue';
import { Plus } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiHint from '../ui/UiHint.vue';
import PerformanceSessionReviewPane from './PerformanceSessionReviewPane.vue';
import UiTextField from '../ui/UiTextField.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  saving: { type: Boolean, default: false },
  validationError: { type: Object, default: null },
});

const emit = defineEmits(['cancel', 'create']);
const displayTitle = shallowRef('');
const displayArtist = shallowRef('');

function create() {
  if (props.saving || !displayTitle.value.trim()) return;
  emit('create', {
    displayTitle: displayTitle.value,
    displayArtist: displayArtist.value,
  });
}
</script>

<template>
  <PerformanceSessionReviewPane
    class="performance-session-manual"
    :title="t('session.manualForm.title')"
    :saving="saving"
    :body-label="t('session.manualForm.bodyLabel')"
    @close="emit('cancel')"
  >
    <div class="performance-session-manual__body">
      <UiHint>
        {{ t('session.manualForm.intro') }}
      </UiHint>

      <UiNotice
        v-if="validationError"
        tone="warning"
        :title="t('session.manualForm.notAdded')"
        :message="validationError.message"
        compact
      />

      <form
        id="performance-session-manual-form"
        class="performance-session-manual__form"
        @submit.prevent="create"
      >
        <UiTextField
          id="performance-session-manual-display-title"
          v-model="displayTitle"
          :label="t('session.manualForm.name')"
          :hint="t('session.manualForm.nameHint')"
          :maxlength="200"
          required
        />
        <UiTextField
          id="performance-session-manual-display-artist"
          v-model="displayArtist"
          :label="t('session.manualForm.secondLine')"
          :hint="t('session.manualForm.secondLineHint')"
          :maxlength="200"
        />
      </form>
    </div>
    <template #actions>
      <UiButton :disabled="saving" @click="emit('cancel')">{{
        t('session.manualForm.cancel')
      }}</UiButton>
      <UiButton
        :icon="Plus"
        variant="accent"
        :disabled="saving || !displayTitle.trim()"
        type="submit"
        form="performance-session-manual-form"
      >
        {{ t('session.manualForm.add') }}
      </UiButton>
    </template>
  </PerformanceSessionReviewPane>
</template>

<style scoped>
.performance-session-manual__body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.performance-session-manual__form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
</style>
