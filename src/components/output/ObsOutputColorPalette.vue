<script setup>
import { computed, useId } from 'vue';
import {
  MAX_OUTPUT_SAVED_COLORS,
  normalizeOutputRecentColors,
  normalizeOutputSavedColors,
} from '../../../shared/outputColorPreferences.mjs';
import ObsColorSwatchRail from './ObsColorSwatchRail.vue';
import UiButton from '../ui/UiButton.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  label: { type: String, required: true },
  modelValue: { type: String, required: true },
  recentColors: { type: Array, default: () => [] },
  savedColors: { type: Array, default: () => [] },
});

const emit = defineEmits(['select', 'toggleSavedColor']);

const targetId = useId();
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
  if (currentIsSaved.value) return t('outputPanel.color.removeSaved');
  if (savedPaletteIsFull.value) return t('outputPanel.color.savedFull');
  return t('outputPanel.color.addSaved');
});
const savedActionAriaLabel = computed(() => {
  const color = normalizedValue.value.toUpperCase();
  if (currentIsSaved.value)
    return t('outputPanel.color.removeNamed', { color });
  if (savedPaletteIsFull.value) {
    return t('outputPanel.color.fullNamed', { max: MAX_OUTPUT_SAVED_COLORS });
  }
  return t('outputPanel.color.addNamed', { color });
});

function toggleSavedColor() {
  if (savedPaletteIsFull.value) return;
  emit('toggleSavedColor', normalizedValue.value);
}
</script>

<template>
  <div
    class="obs-output-color-palette"
    role="group"
    :aria-label="t('outputPanel.color.swatches')"
    :aria-describedby="targetId"
  >
    <div class="obs-output-color-palette__header">
      <span
        :id="targetId"
        class="obs-output-color-palette__title"
        aria-live="polite"
        >{{ t('outputPanel.color.applyTo', { label }) }}</span
      >
      <UiButton
        class="obs-output-color-palette__action"
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
      :label="t('outputPanel.color.saved')"
      :selection-label="t('outputPanel.color.savedSelection')"
      :aria-label="t('outputPanel.color.savedLabel')"
      source="saved"
      :colors="normalizedSavedColors"
      :model-value="normalizedValue"
      :empty-label="t('outputPanel.color.empty')"
      @select="emit('select', $event)"
    />

    <ObsColorSwatchRail
      v-if="normalizedRecentColors.length > 0"
      :label="t('outputPanel.color.recent')"
      :selection-label="t('outputPanel.color.recentSelection')"
      :aria-label="t('outputPanel.color.recentLabel')"
      source="recent"
      :colors="normalizedRecentColors"
      :model-value="normalizedValue"
      @select="emit('select', $event)"
    />
  </div>
</template>

<style scoped>
.obs-output-color-palette {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-xs);
  background: var(--ui-color-canvas);
}

.obs-output-color-palette__header {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-1) var(--ui-space-2);
}

.obs-output-color-palette__title {
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.obs-output-color-palette__action {
  margin-inline-start: auto;
  min-height: calc(var(--ui-control-height) - var(--ui-space-2));
  padding-block: 0;
  border-radius: var(--ui-radius-sm);
}

.obs-output-color-palette__action:disabled {
  opacity: 1;
}
</style>
