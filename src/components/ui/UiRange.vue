<script setup>
import { useAttrs, useTemplateRef } from 'vue';
import { nativeControlAttrs } from './fieldAttrs.js';
import UiField from './UiField.vue';
import UiRangeControl from './range/UiRangeControl.vue';

defineOptions({ inheritAttrs: false });

defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  defaultValue: { type: Number, default: undefined },
  marks: { type: Array, default: () => [] },
  valueText: { type: String, default: '' },
  formatValue: { type: Function, default: null },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
  labelHidden: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'reset']);
const attrs = useAttrs();
const rangeRef = useTemplateRef('range');

function updateValue(value) {
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
    :class="[attrs.class, 'ui-range', { 'is-disabled': disabled }]"
    :style="attrs.style"
    :label="label"
    :hint="hint"
    :error="error"
    :described-by="attrs['aria-describedby']"
    :invalid="invalid"
    :label-hidden="labelHidden"
  >
    <template #default="{ describedBy, invalid: fieldInvalid }">
      <div class="ui-range__layout" :class="{ 'has-value-text': valueText }">
        <UiRangeControl
          v-bind="nativeControlAttrs(attrs)"
          :id="id"
          ref="range"
          class="ui-range__control"
          :model-value="modelValue"
          :min="min"
          :max="max"
          :step="step"
          :default-value="defaultValue"
          :marks="marks"
          :value-text="valueText"
          :format-value="formatValue"
          :disabled="disabled"
          :invalid="fieldInvalid"
          :aria-describedby="describedBy"
          @update:model-value="updateValue"
          @reset="emit('reset', $event)"
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
  container-type: inline-size;
}

.ui-range__layout {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
  min-height: var(--ui-field-height);
}

.ui-range__control {
  --ui-range-control-active-height: var(--ui-range-track-size);
  --ui-range-target-size: var(--ui-control-height);
}

.ui-range__value {
  min-width: 3ch;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  font-variant-numeric: tabular-nums;
  line-height: var(--ui-type-caption-line-height);
  text-align: end;
}

@scope ([data-ui-system='v2']) to ([data-ui-system]) {
  .ui-range :deep(.ui-field__label) {
    min-width: 0;
    overflow-wrap: anywhere;
    -webkit-user-select: none;
    user-select: none;
  }

  .ui-range__value {
    min-inline-size: 2.5rem;
    color: var(--ui-color-text-muted);
    overflow-wrap: anywhere;
    -webkit-user-select: none;
    user-select: none;
  }

  .ui-range.is-disabled {
    opacity: var(--ui-opacity-disabled);
  }

  .ui-range.is-disabled .ui-range-control.is-disabled {
    opacity: 1;
  }
}

@container (max-width: 18rem) {
  @scope ([data-ui-system='v2']) to ([data-ui-system]) {
    .ui-range__layout.has-value-text {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
    }

    .ui-range__value {
      justify-self: end;
    }
  }
}
</style>
