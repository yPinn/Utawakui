<script setup>
import { computed } from 'vue';
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import UiRangeControl from '../ui/range/UiRangeControl.vue';

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { type: [String, Number], required: true },
});

const emit = defineEmits(['update:modelValue', 'commit']);

const controlId = computed(() => `output-appearance-${props.field.key}`);
function formatRangeValue(value) {
  const numericValue = Number(value);
  const prefix = numericValue > 0 ? '+' : '';
  return `${prefix}${numericValue}${props.field.unit ?? ''}`;
}

const valueText = computed(() => {
  if (props.field.control === 'color') {
    return String(props.modelValue).toUpperCase();
  }
  if (props.field.control !== 'range') return String(props.modelValue);
  return formatRangeValue(props.modelValue);
});

function updateString(event) {
  emit('update:modelValue', event.target.value);
}

function updateNumber(value) {
  emit('update:modelValue', value);
}
</script>

<template>
  <ObsAppearanceControlRow :control-id="controlId" :label="field.label">
    <select
      v-if="field.control === 'select'"
      :id="controlId"
      class="obs-appearance-field__select"
      :value="modelValue"
      @change="updateString"
    >
      <option
        v-for="option in field.options"
        :key="option.id"
        :value="option.id"
      >
        {{ option.label }}
      </option>
    </select>

    <div
      v-else-if="field.control === 'color'"
      class="obs-appearance-field__compound"
    >
      <input
        :id="controlId"
        class="obs-appearance-field__color"
        type="color"
        :value="modelValue"
        @input="updateString"
        @change="emit('commit')"
      />
      <output class="obs-appearance-field__value" :for="controlId">
        {{ valueText }}
      </output>
    </div>

    <div
      v-else-if="field.control === 'range'"
      class="obs-appearance-field__compound obs-appearance-field__compound--range"
    >
      <UiRangeControl
        :id="controlId"
        class="obs-appearance-field__range"
        :model-value="Number(modelValue)"
        :min="field.min"
        :max="field.max"
        :step="field.step"
        :value-text="valueText"
        :format-value="formatRangeValue"
        @update:model-value="updateNumber"
        @change="emit('commit')"
      />
      <output class="obs-appearance-field__value" :for="controlId">
        {{ valueText }}
      </output>
    </div>
  </ObsAppearanceControlRow>
</template>

<style scoped>
.obs-appearance-field__select {
  min-width: 0;
  width: 100%;
  height: var(--ui-control-height);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface-raised);
  color: var(--ui-color-text);
  font: inherit;
}

.obs-appearance-field__compound {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
}

.obs-appearance-field__compound--range {
  grid-template-columns: minmax(7rem, 1fr) 3.5rem;
}

.obs-appearance-field__color {
  inline-size: 100%;
  min-inline-size: 0;
  block-size: var(--ui-control-height);
  padding: var(--ui-space-1);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface-raised);
}

.obs-appearance-field__range {
  min-inline-size: 0;
  inline-size: 100%;
  --ui-range-target-size: var(--ui-control-height);
}

.obs-appearance-field__value {
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
  text-align: end;
}

.obs-appearance-field__select:focus-visible,
.obs-appearance-field__color:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
</style>
