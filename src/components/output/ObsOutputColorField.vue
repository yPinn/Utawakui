<script setup>
import { computed } from 'vue';
import {
  MAX_OUTPUT_SAVED_COLORS,
  normalizeOutputRecentColors,
  normalizeOutputSavedColors,
} from '../../../shared/outputColorPreferences.mjs';
import ObsColorSwatchRail from './ObsColorSwatchRail.vue';
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
  if (currentIsSaved.value) return '移除';
  if (savedPaletteIsFull.value) return '已滿';
  return '加入';
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

    <ObsColorSwatchRail
      label="常用色"
      aria-label="Output 常用色票"
      source="saved"
      :colors="normalizedSavedColors"
      :model-value="normalizedValue"
      empty-label="尚未加入"
      :action-label="savedActionLabel"
      :action-aria-label="savedActionAriaLabel"
      :action-disabled="savedPaletteIsFull"
      :action-pressed="currentIsSaved"
      @select="selectColor"
      @action="toggleSavedColor"
    />

    <ObsColorSwatchRail
      v-if="normalizedRecentColors.length > 0"
      label="最近色票"
      aria-label="最近使用色票"
      source="recent"
      :colors="normalizedRecentColors"
      :model-value="normalizedValue"
      @select="selectColor"
    />
  </div>
</template>

<style scoped>
.obs-output-color-field {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}
</style>
