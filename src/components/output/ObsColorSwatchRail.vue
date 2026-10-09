<script setup>
import { computed } from 'vue';
import {
  MAX_OUTPUT_RECENT_COLORS,
  MAX_OUTPUT_SAVED_COLORS,
} from '../../../shared/outputColorPreferences.mjs';
import UiTooltip from '../ui/UiTooltip.vue';

const COLOR_LIMIT_BY_SOURCE = Object.freeze({
  recent: MAX_OUTPUT_RECENT_COLORS,
  saved: MAX_OUTPUT_SAVED_COLORS,
});

const props = defineProps({
  label: { type: String, required: true },
  selectionLabel: { type: String, default: '' },
  ariaLabel: { type: String, required: true },
  source: {
    type: String,
    required: true,
    validator: (value) => ['recent', 'saved'].includes(value),
  },
  colors: { type: Array, default: () => [] },
  modelValue: { type: String, required: true },
  emptyLabel: { type: String, default: '' },
});

const emit = defineEmits(['select']);
const visibleColors = computed(() =>
  props.colors.slice(0, COLOR_LIMIT_BY_SOURCE[props.source] ?? 0),
);
</script>

<template>
  <div class="obs-color-swatch-rail" role="group" :aria-label="ariaLabel">
    <span class="obs-color-swatch-rail__label">{{ label }}</span>

    <span
      v-if="visibleColors.length === 0"
      class="obs-color-swatch-rail__empty"
    >
      {{ emptyLabel }}
    </span>
    <div v-else class="obs-color-swatch-rail__swatches">
      <UiTooltip
        v-for="color in visibleColors"
        :key="color"
        :text="color.toUpperCase()"
      >
        <template #trigger="{ triggerProps }">
          <button
            v-bind="triggerProps"
            type="button"
            class="obs-color-swatch-rail__swatch"
            :class="{
              'obs-color-swatch-rail__swatch--selected': color === modelValue,
            }"
            :style="{ '--obs-output-swatch-color': color }"
            :data-color="color"
            :data-color-source="source"
            :aria-label="`套用${selectionLabel || label} ${color.toUpperCase()}`"
            :aria-pressed="color === modelValue"
            @click="emit('select', color)"
          ></button>
        </template>
      </UiTooltip>
    </div>
  </div>
</template>

<style scoped>
.obs-color-swatch-rail {
  --obs-output-color-swatch-size: calc(
    var(--ui-control-height) - var(--ui-space-2)
  );

  min-width: 0;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: start;
  gap: var(--ui-space-2);
}

.obs-color-swatch-rail__label,
.obs-color-swatch-rail__empty {
  min-height: var(--obs-output-color-swatch-size);
  display: flex;
  align-items: center;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.obs-color-swatch-rail__empty {
  min-width: 0;
}

.obs-color-swatch-rail__swatches {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(4, var(--obs-output-color-swatch-size));
  gap: var(--ui-space-2);
}

.obs-color-swatch-rail__swatch {
  inline-size: var(--obs-output-color-swatch-size);
  block-size: var(--obs-output-color-swatch-size);
  padding: var(--ui-border-width);
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-radius: var(--ui-radius-xs);
  background: var(--obs-output-swatch-color);
  background-clip: content-box;
  cursor: pointer;
}

.obs-color-swatch-rail__swatch:hover {
  border-color: var(--ui-color-accent);
}

.obs-color-swatch-rail__swatch--selected {
  border-color: var(--ui-color-accent);
  box-shadow: inset 0 0 0 var(--ui-border-width) var(--ui-color-canvas);
}

.obs-color-swatch-rail__swatch:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

@media (forced-colors: active) {
  .obs-color-swatch-rail__swatch--selected {
    outline: var(--ui-border-width) solid Highlight;
    outline-offset: var(--ui-focus-offset-inset);
  }

  .obs-color-swatch-rail__swatch:focus-visible {
    outline-color: Highlight;
  }
}
</style>
