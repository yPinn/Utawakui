<script setup>
import { Check, ICON_SIZE } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';

defineProps({
  label: { type: String, required: true },
  ariaLabel: { type: String, required: true },
  source: { type: String, required: true },
  colors: { type: Array, default: () => [] },
  modelValue: { type: String, required: true },
  emptyLabel: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
  actionAriaLabel: { type: String, default: '' },
  actionDisabled: { type: Boolean, default: false },
  actionPressed: { type: Boolean, default: false },
});

const emit = defineEmits(['select', 'action']);
</script>

<template>
  <div class="obs-color-swatch-rail" role="group" :aria-label="ariaLabel">
    <div class="obs-color-swatch-rail__header">
      <span class="obs-color-swatch-rail__label">{{ label }}</span>
      <UiButton
        v-if="actionLabel"
        class="obs-color-swatch-rail__action"
        variant="ghost"
        :disabled="actionDisabled"
        :active="actionPressed"
        :aria-label="actionAriaLabel"
        :aria-pressed="actionPressed"
        @click="emit('action')"
      >
        {{ actionLabel }}
      </UiButton>
    </div>

    <span v-if="colors.length === 0" class="obs-color-swatch-rail__empty">
      {{ emptyLabel }}
    </span>
    <div v-else class="obs-color-swatch-rail__swatches">
      <button
        v-for="color in colors"
        :key="color"
        type="button"
        class="obs-color-swatch-rail__swatch"
        :class="{
          'obs-color-swatch-rail__swatch--selected': color === modelValue,
        }"
        :style="{ '--obs-output-swatch-color': color }"
        :data-color="color"
        :data-color-source="source"
        :title="color.toUpperCase()"
        :aria-label="`套用${label} ${color.toUpperCase()}`"
        :aria-pressed="color === modelValue"
        @click="emit('select', color)"
      >
        <span
          v-if="color === modelValue"
          class="obs-color-swatch-rail__selected-indicator"
          aria-hidden="true"
        >
          <Check :size="ICON_SIZE" />
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.obs-color-swatch-rail {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.obs-color-swatch-rail__header {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
}

.obs-color-swatch-rail__label,
.obs-color-swatch-rail__empty {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.obs-color-swatch-rail__action {
  min-height: var(--ui-control-height);
  flex: 0 0 auto;
}

.obs-color-swatch-rail__empty {
  min-height: var(--ui-control-height);
  display: flex;
  align-items: center;
}

.obs-color-swatch-rail__swatches {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-1);
}

.obs-color-swatch-rail__swatch {
  position: relative;
  inline-size: var(--ui-control-height);
  block-size: var(--ui-control-height);
  padding: var(--ui-space-1);
  display: grid;
  place-items: center;
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-radius: var(--ui-radius-sm);
  background: var(--obs-output-swatch-color);
  background-clip: content-box;
  cursor: pointer;
}

.obs-color-swatch-rail__swatch:hover {
  border-color: var(--ui-color-accent);
}

.obs-color-swatch-rail__swatch--selected {
  border-color: var(--ui-color-accent);
}

.obs-color-swatch-rail__selected-indicator {
  inline-size: calc(var(--ui-control-height) - var(--ui-space-3));
  block-size: calc(var(--ui-control-height) - var(--ui-space-3));
  display: grid;
  place-items: center;
  border-radius: var(--ui-radius-xs);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
}

.obs-color-swatch-rail__swatch:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
</style>
