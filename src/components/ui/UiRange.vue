<script setup>
import { useAttrs, useTemplateRef } from 'vue';
import { nativeControlAttrs } from './fieldAttrs.js';
import UiField from './UiField.vue';

defineOptions({ inheritAttrs: false });

defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  valueText: { type: String, default: '' },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
  labelHidden: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue']);
const attrs = useAttrs();
const rangeRef = useTemplateRef('range');

function updateValue(event) {
  const value = Number.isFinite(event.target.valueAsNumber)
    ? event.target.valueAsNumber
    : Number(event.target.value);
  emit('update:modelValue', value);
}

function focus() {
  rangeRef.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <UiField
    :id="id"
    :class="attrs.class"
    :style="attrs.style"
    :label="label"
    :hint="hint"
    :error="error"
    :described-by="attrs['aria-describedby']"
    :invalid="invalid"
    :label-hidden="labelHidden"
  >
    <template #default="{ describedBy, invalid: fieldInvalid }">
      <div class="ui-range">
        <input
          v-bind="nativeControlAttrs(attrs)"
          :id="id"
          ref="range"
          class="ui-range__control"
          type="range"
          :value="modelValue"
          :min="min"
          :max="max"
          :step="step"
          :disabled="disabled"
          :aria-describedby="describedBy"
          :aria-invalid="fieldInvalid || undefined"
          :aria-valuetext="valueText || undefined"
          @input="updateValue"
        />
        <output v-if="valueText" class="ui-range__value" :for="id">
          {{ valueText }}
        </output>
      </div>
    </template>
  </UiField>
</template>

<style scoped>
.ui-range {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
  min-height: var(--ui-field-height);
}

.ui-range__control {
  width: 100%;
  min-width: 0;
  height: var(--ui-range-track-size);
  margin: 0;
  accent-color: var(--ui-color-accent);
  cursor: pointer;
}

.ui-range__control::-webkit-slider-thumb {
  width: var(--ui-range-thumb-size);
  height: var(--ui-range-thumb-size);
}

.ui-range__control:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-range__control:disabled {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}

.ui-range__value {
  min-width: 3ch;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
  text-align: end;
}
</style>
