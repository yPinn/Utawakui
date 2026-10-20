<script setup>
import { computed } from 'vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';

const props = defineProps({
  readingVariant: { type: String, default: 'off' },
  readingVariants: { type: Array, default: () => [] },
  preparing: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  error: { type: String, default: '' },
  readingScale: {
    type: String,
    default: 'desk',
    validator: (value) => ['near', 'desk', 'stage'].includes(value),
  },
});

defineEmits(['update:readingScale', 'update:readingVariant']);
const labels = { off: '關閉', furigana: '假名', romaji: '羅馬字' };
const readingItems = computed(() =>
  props.readingVariants.map((id) => ({ id, label: labels[id] })),
);

const readingScaleItems = [
  { id: 'near', label: '近' },
  { id: 'desk', label: '桌面' },
  { id: 'stage', label: '舞台' },
];
</script>

<template>
  <section class="performer-display-controls" aria-label="顯示設定">
    <div v-if="readingItems.length" class="performer-display-controls__group">
      <span class="performer-display-controls__label">讀音</span>
      <UiSegmentedControl
        :items="readingItems"
        :model-value="readingVariant"
        aria-label="歌詞讀音顯示"
        :disabled="disabled"
        :aria-busy="preparing"
        @update:model-value="$emit('update:readingVariant', $event)"
        @reselect="$emit('update:readingVariant', $event)"
      />
      <UiNotice v-if="error" :message="error" tone="danger" compact />
      <UiHint v-else-if="preparing" role="status">正在準備讀音…</UiHint>
    </div>
    <div class="performer-display-controls__group">
      <span class="performer-display-controls__label">閱讀</span>
      <UiSegmentedControl
        :items="readingScaleItems"
        :model-value="readingScale"
        aria-label="閱讀距離"
        @update:model-value="$emit('update:readingScale', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.performer-display-controls {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-4);
  padding: var(--ui-space-2);
}
.performer-display-controls__group {
  display: grid;
  gap: var(--ui-space-2);
}

.performer-display-controls__label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.performer-display-controls :deep(.ui-segmented-control__option) {
  min-block-size: var(--ui-performer-action-min-block-size);
}
</style>
