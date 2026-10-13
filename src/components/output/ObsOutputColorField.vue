<script setup>
import { computed } from 'vue';
import {
  MAX_OUTPUT_SAVED_COLORS,
  normalizeOutputRecentColors,
  normalizeOutputSavedColors,
} from '../../../shared/outputColorPreferences.mjs';
import ObsColorSwatchRail from './ObsColorSwatchRail.vue';
import UiButton from '../ui/UiButton.vue';
import UiColorField from '../ui/UiColorField.vue';

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: String, required: true },
  recentColors: { type: Array, default: () => [] },
  savedColors: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:modelValue', 'commit', 'toggleSavedColor']);

const normalizedRecentColors = computed(() =>
  normalizeOutputRecentColors(props.recentColors),
);
const normalizedValue = computed(() => String(props.modelValue).toLowerCase());
const normalizedSavedColors = computed(() =>
  normalizeOutputSavedColors(props.savedColors),
);
const currentIsSaved = computed(() =>
  normalizedSavedColors.value.includes(normalizedValue.value),
);
const savedPaletteIsFull = computed(
  () =>
    normalizedSavedColors.value.length >= MAX_OUTPUT_SAVED_COLORS &&
    !currentIsSaved.value,
);
const savedActionLabel = computed(() => {
  if (currentIsSaved.value) return '移除常用';
  if (savedPaletteIsFull.value) return '常用已滿';
  return '加入常用';
});
const savedActionAriaLabel = computed(() => {
  const color = normalizedValue.value.toUpperCase();
  if (currentIsSaved.value) return `從常用色移除 ${color}`;
  if (savedPaletteIsFull.value) {
    return `常用色已滿（最多 ${MAX_OUTPUT_SAVED_COLORS} 色）`;
  }
  return `加入常用色 ${color}`;
});

function selectColor(color) {
  emit('update:modelValue', color);
  emit('commit', color);
}

function toggleSavedColor() {
  if (savedPaletteIsFull.value) return;
  emit('toggleSavedColor', normalizedValue.value);
}
</script>

<template>
  <div class="obs-output-color-field">
    <UiColorField
      :id="id"
      :label="label"
      :model-value="modelValue"
      label-hidden
      @update:model-value="emit('update:modelValue', $event)"
      @commit="emit('commit', $event)"
    />

    <div
      class="obs-output-color-field__shelf"
      role="group"
      aria-label="Output 色票"
    >
      <div class="obs-output-color-field__shelf-header">
        <span class="obs-output-color-field__shelf-title">色票</span>
        <UiButton
          class="obs-output-color-field__shelf-action"
          variant="ghost"
          :disabled="savedPaletteIsFull"
          :active="currentIsSaved"
          :aria-label="savedActionAriaLabel"
          :aria-pressed="currentIsSaved"
          @click="toggleSavedColor"
        >
          {{ savedActionLabel }}
        </UiButton>
      </div>

      <ObsColorSwatchRail
        label="常用"
        selection-label="常用色票"
        aria-label="Output 常用色票"
        source="saved"
        :colors="normalizedSavedColors"
        :model-value="normalizedValue"
        empty-label="尚未加入"
        @select="selectColor"
      />

      <ObsColorSwatchRail
        v-if="normalizedRecentColors.length > 0"
        label="最近"
        selection-label="最近色票"
        aria-label="最近使用色票"
        source="recent"
        :colors="normalizedRecentColors"
        :model-value="normalizedValue"
        @select="selectColor"
      />
    </div>
  </div>
</template>

<style scoped>
.obs-output-color-field {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.obs-output-color-field__shelf {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.obs-output-color-field__shelf-header {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
}

.obs-output-color-field__shelf-title {
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.obs-output-color-field__shelf-action {
  min-height: calc(var(--ui-control-height) - var(--ui-space-2));
  padding-block: 0;
  border-radius: var(--ui-radius-sm);
}

.obs-output-color-field__shelf-action:disabled {
  opacity: 1;
}
</style>
