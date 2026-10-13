<script setup>
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';

defineProps({
  readingScale: {
    type: String,
    default: 'desk',
    validator: (value) => ['near', 'desk', 'stage'].includes(value),
  },
});

defineEmits(['update:readingScale']);

const readingScaleItems = [
  { id: 'near', label: '近' },
  { id: 'desk', label: '桌面' },
  { id: 'stage', label: '舞台' },
];
</script>

<template>
  <section class="performer-display-controls" aria-label="顯示設定">
    <span class="performer-display-controls__label">閱讀</span>
    <UiSegmentedControl
      :items="readingScaleItems"
      :model-value="readingScale"
      aria-label="閱讀距離"
      @update:model-value="$emit('update:readingScale', $event)"
    />
  </section>
</template>

<style scoped>
.performer-display-controls {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.performer-display-controls__label {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.performer-display-controls :deep(.ui-segmented-control__option) {
  min-block-size: var(--ui-performer-action-min-block-size);
}
</style>
