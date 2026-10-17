<script setup>
import { shallowRef } from 'vue';
import { Plus } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import PerformanceSessionReviewPane from './PerformanceSessionReviewPane.vue';
import UiTextField from '../ui/UiTextField.vue';

defineProps({
  saving: { type: Boolean, default: false },
  validationError: { type: Object, default: null },
});

const emit = defineEmits(['cancel', 'create']);
const displayTitle = shallowRef('');
const displayArtist = shallowRef('');

function create() {
  if (!displayTitle.value.trim()) return;
  emit('create', {
    displayTitle: displayTitle.value,
    displayArtist: displayArtist.value,
  });
}
</script>

<template>
  <PerformanceSessionReviewPane
    class="performance-session-manual"
    aria-labelledby="performance-session-manual-title"
    body-label="新增手動項目內容"
  >
    <div class="performance-session-manual__body">
      <header class="performance-session-manual__header">
        <p class="performance-session-manual__eyebrow">其他音訊來源</p>
        <h2
          id="performance-session-manual-title"
          class="performance-session-manual__title"
        >
          新增手動項目
        </h2>
        <p class="performance-session-manual__description">
          適用自行伴奏或外部播放；若由 Utawakui 播放，請先匯入曲庫。
        </p>
      </header>

      <UiNotice
        v-if="validationError"
        tone="warning"
        title="尚未加入"
        :message="validationError.message"
        compact
      />

      <form class="performance-session-manual__form" @submit.prevent="create">
        <UiTextField
          id="performance-session-manual-display-title"
          v-model="displayTitle"
          label="曲名／項目名稱"
          hint="只用於本場顯示，不會建立曲庫歌曲。"
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
        @click="create"
      >
        加入場次
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

.performance-session-manual__eyebrow,
.performance-session-manual__title,
.performance-session-manual__description {
  margin: 0;
}

.performance-session-manual__eyebrow,
.performance-session-manual__description {
  color: var(--ui-color-text-muted);
}

.performance-session-manual__eyebrow {
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.performance-session-manual__title {
  margin-top: var(--ui-space-1);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.performance-session-manual__description {
  margin-top: var(--ui-space-2);
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-body-weight);
  line-height: var(--ui-type-body-line-height);
}

.performance-session-manual__form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
</style>
