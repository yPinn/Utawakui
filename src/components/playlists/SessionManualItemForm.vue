<script setup>
import { shallowRef } from 'vue';
import { Plus } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
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
  <section class="session-manual" aria-labelledby="session-manual-title">
    <UiScrollRegion class="session-manual__body-scroll">
      <div class="session-manual__body">
        <header class="session-manual__header">
          <p class="session-manual__eyebrow">其他音訊來源</p>
          <h2 id="session-manual-title" class="session-manual__title">
            新增手動項目
          </h2>
          <p class="session-manual__description">
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

        <form class="session-manual__form" @submit.prevent="create">
          <UiTextField
            id="session-manual-display-title"
            v-model="displayTitle"
            label="曲名／項目名稱"
            hint="只用於本場顯示，不會建立曲庫歌曲。"
            :maxlength="200"
            required
          />
          <UiTextField
            id="session-manual-display-artist"
            v-model="displayArtist"
            label="第二行（選填）"
            hint="可填原唱、演出者或版本資訊；留空則不顯示。"
            :maxlength="200"
          />
        </form>
      </div>
    </UiScrollRegion>

    <div class="session-manual__actions">
      <UiButton :disabled="saving" @click="emit('cancel')">取消</UiButton>
      <UiButton
        :icon="Plus"
        variant="accent"
        :disabled="saving || !displayTitle.trim()"
        @click="create"
      >
        加入場次
      </UiButton>
    </div>
  </section>
</template>

<style scoped>
.session-manual {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.session-manual__body-scroll {
  flex: 1;
  min-height: 0;
}

.session-manual__body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  padding: var(--ui-space-4);
}

.session-manual__eyebrow,
.session-manual__title,
.session-manual__description {
  margin: 0;
}

.session-manual__eyebrow,
.session-manual__description {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.session-manual__eyebrow {
  font-weight: var(--ui-font-weight-semibold);
}

.session-manual__title {
  margin-top: var(--ui-space-1);
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-heading);
}

.session-manual__description {
  margin-top: var(--ui-space-2);
  line-height: var(--ui-line-height-body);
}

.session-manual__form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.session-manual__actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}
</style>
