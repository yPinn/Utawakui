<script setup>
import { computed } from 'vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import { t } from '../../utils/i18n.js';

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
const labels = {
  off: t('performer.display.readings.off'),
  furigana: t('performer.display.readings.furigana'),
  romaji: t('performer.display.readings.romaji'),
};
const readingItems = computed(() =>
  props.readingVariants.map((id) => ({ id, label: labels[id] })),
);

const readingScaleItems = [
  { id: 'near', label: t('performer.display.distance.near') },
  { id: 'desk', label: t('performer.display.distance.desk') },
  { id: 'stage', label: t('performer.display.distance.stage') },
];
</script>

<template>
  <section
    class="performer-display-controls"
    :aria-label="t('performer.display.label')"
  >
    <div v-if="readingItems.length" class="performer-display-controls__group">
      <span class="performer-display-controls__label">{{
        t('performer.display.reading')
      }}</span>
      <UiSegmentedControl
        :items="readingItems"
        :model-value="readingVariant"
        :aria-label="t('performer.display.readingLabel')"
        :disabled="disabled"
        :aria-busy="preparing"
        @update:model-value="$emit('update:readingVariant', $event)"
        @reselect="$emit('update:readingVariant', $event)"
      />
      <UiNotice v-if="error" :message="error" tone="danger" compact />
      <UiHint v-else-if="preparing" role="status">{{
        t('performer.display.preparing')
      }}</UiHint>
    </div>
    <div class="performer-display-controls__group">
      <span class="performer-display-controls__label">{{
        t('performer.display.distanceTitle')
      }}</span>
      <UiSegmentedControl
        :items="readingScaleItems"
        :model-value="readingScale"
        :aria-label="t('performer.display.distanceLabel')"
        @update:model-value="$emit('update:readingScale', $event)"
      />
    </div>
    <slot />
  </section>
</template>

<style scoped>
.performer-display-controls {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
}
.performer-display-controls__group {
  display: grid;
  gap: var(--ui-space-1);
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
