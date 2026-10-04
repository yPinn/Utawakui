<script setup>
import { computed } from 'vue';
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import UiColorField from '../ui/UiColorField.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiRangeControl from '../ui/range/UiRangeControl.vue';

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { type: [String, Number], required: true },
});

const emit = defineEmits(['update:modelValue', 'commit']);

const controlId = computed(() => `output-appearance-${props.field.key}`);
const selectOptions = computed(() =>
  (props.field.options ?? []).map((option) => ({
    value: option.id,
    label: option.label,
    disabled: option.disabled,
  })),
);
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

function updateString(value) {
  emit('update:modelValue', value);
}

function updateNumber(value) {
  emit('update:modelValue', value);
}
</script>

<template>
  <ObsAppearanceControlRow
    :control-id="controlId"
    :label="field.label"
    :labels-control="field.control === 'range'"
  >
    <UiSelect
      v-if="field.control === 'select'"
      :id="controlId"
      :label="field.label"
      :model-value="modelValue"
      :options="selectOptions"
      label-hidden
      @update:model-value="updateString"
    />

    <UiColorField
      v-else-if="field.control === 'color'"
      :id="controlId"
      :label="field.label"
      :model-value="String(modelValue)"
      label-hidden
      @update:model-value="updateString"
      @commit="emit('commit')"
    />

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
</style>
