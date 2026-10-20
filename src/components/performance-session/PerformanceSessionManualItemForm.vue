<script setup>
import { shallowRef } from 'vue';
import { Plus } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiHint from '../ui/UiHint.vue';
import PerformanceSessionReviewPane from './PerformanceSessionReviewPane.vue';
import UiTextField from '../ui/UiTextField.vue';

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
    title="新增手動項目"
    :saving="saving"
    body-label="新增手動項目內容"
    @close="emit('cancel')"
  >
    <div class="performance-session-manual__body">
      <UiHint>
        適用自行伴奏或外部播放；若由 Utawakui 播放，請先匯入曲庫。
      </UiHint>

      <UiNotice
        v-if="validationError"
        tone="warning"
        title="尚未加入"
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
          label="曲名／項目名稱"
          hint="只用於這份安排，不會建立曲庫歌曲。"
          :maxlength="200"
          required
        />
        <UiTextField
          id="performance-session-manual-display-artist"
          v-model="displayArtist"
          label="第二行（選填）"
          hint="可填原唱、演出者或版本資訊；留空則不顯示。"
          :maxlength="200"
        />
      </form>
    </div>
    <template #actions>
      <UiButton :disabled="saving" @click="emit('cancel')">取消</UiButton>
      <UiButton
        :icon="Plus"
        variant="accent"
        :disabled="saving || !displayTitle.trim()"
        type="submit"
        form="performance-session-manual-form"
      >
        加入待唱
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
