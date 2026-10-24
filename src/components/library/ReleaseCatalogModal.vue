<script setup>
import { computed } from 'vue';
import { useReleaseCatalog } from '../../composables/useReleaseCatalog.js';
import { releaseTypeLabel } from '../../utils/releasePresentation.js';
import UiModal from '../ui/UiModal.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiRadioGroup from '../ui/UiRadioGroup.vue';
const catalog = useReleaseCatalog();
const { state } = catalog;
const candidates = computed(() =>
  state.candidates.map((entry) => ({
    id: entry.candidateId,
    label: entry.title,
    description: [entry.artist, entry.year].filter(Boolean).join(' · '),
  })),
);
const slots = computed(() =>
  (state.preview?.rows ?? []).map((row) => ({
    id: row.position,
    label: `${row.position}. ${row.title || '來源未提供曲名'}`,
    description: row.artist,
  })),
);
</script>

<template>
  <UiModal
    :open="state.open"
    title="補齊專輯資料"
    size="wide"
    max-block-size="medium"
    :close-disabled="state.busy"
    @close="catalog.close"
  >
    <div class="release-catalog-modal">
      <p>{{ state.track?.title }}</p>
      <UiHint
        >查詢候選專輯，再選擇所屬發行與這份本地音源對應的曲目位置。</UiHint
      >
      <div class="release-catalog-modal__actions">
        <UiButton :disabled="state.busy" @click="catalog.search"
          >查詢候選專輯</UiButton
        >
      </div>
      <UiHint v-if="state.busy" role="status">正在查詢專輯資料…</UiHint>
      <UiHint v-if="state.error" tone="danger" role="alert">{{
        state.error
      }}</UiHint>
      <UiHint v-if="state.message" role="status">{{ state.message }}</UiHint>
      <UiRadioGroup
        v-if="candidates.length"
        name="release-candidate"
        legend="選擇所屬發行"
        :items="candidates"
        :model-value="state.candidateId"
        :disabled="state.busy"
        @update:model-value="catalog.preview"
      />
      <template v-if="state.preview">
        <p>
          {{ state.preview.title }} · {{ releaseTypeLabel(state.preview.type)
          }}<template v-if="state.preview.year">
            · {{ state.preview.year }}</template
          >
        </p>
        <UiHint v-if="state.preview.completeness !== 'complete'"
          >來源曲目表未完整，僅能確認已取得的位置。</UiHint
        >
        <UiRadioGroup
          name="release-slot"
          legend="這份本地音源對應哪一首？"
          :items="slots"
          :model-value="state.position ?? ''"
          :disabled="state.busy"
          @update:model-value="catalog.setPosition"
        />
        <UiButton
          v-if="state.preview.hasMore"
          :disabled="state.busy"
          @click="catalog.preview(state.candidateId, state.preview.nextOffset)"
          >顯示更多曲目</UiButton
        >
      </template>
    </div>
    <template #footer>
      <UiButton :disabled="state.busy" @click="catalog.close">關閉</UiButton>
      <UiButton
        variant="primary"
        :disabled="state.busy || !Number.isInteger(state.position)"
        @click="catalog.accept"
        >確認曲目關聯</UiButton
      >
    </template>
  </UiModal>
</template>

<style scoped>
.release-catalog-modal {
  display: grid;
  gap: var(--ui-space-4);
}
.release-catalog-modal__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
</style>
