<script setup>
import { computed } from 'vue';
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import ObsFontFamilySelect from './ObsFontFamilySelect.vue';
import ObsLookSelect from './ObsLookSelect.vue';
import ObsOutputColorField from './ObsOutputColorField.vue';
import ObsPositionPicker from './ObsPositionPicker.vue';
import ObsSegmentedAppearanceChoice from './ObsSegmentedAppearanceChoice.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiHint from '../ui/UiHint.vue';
import UiRangeControl from '../ui/range/UiRangeControl.vue';

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { type: [String, Number, Object], required: true },
  recentColors: { type: Array, default: () => [] },
  savedColors: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  modified: { type: Boolean, default: false },
});

const emit = defineEmits([
  'update:modelValue',
  'commit',
  'commitColor',
  'toggleSavedColor',
]);

const controlId = computed(() => `output-appearance-${props.field.key}`);
const controlHintId = computed(() => `${controlId.value}-hint`);
const editor = computed(() => props.field.editor ?? props.field.control);
const disabledHint = computed(() =>
  props.disabled && props.field.key === 'lookAmount'
    ? '選擇配色風格後可調整'
    : '',
);
const selectOptions = computed(() =>
  (props.field.options ?? []).map((option) => ({
    value: option.id,
    label: option.label,
    disabled: option.disabled,
  })),
);
function formatRangeValue(value) {
  const numericValue = Number(value);
  const prefix = props.field.signed && numericValue > 0 ? '+' : '';
  return `${prefix}${numericValue}${props.field.unit ?? ''}`;
}

const valueText = computed(() => {
  if (props.field.control === 'color') {
    return String(props.modelValue).toUpperCase();
  }
  if (props.field.control !== 'range') return String(props.modelValue);
  return formatRangeValue(props.modelValue);
});

function updateValue(value) {
  emit('update:modelValue', value);
}

function updateNumber(value) {
  emit('update:modelValue', value);
}

function commitColor(value) {
  emit('commit');
  emit('commitColor', value);
}
</script>

<template>
  <ObsAppearanceControlRow
    :control-id="controlId"
    :label="field.label"
    :labels-control="field.control === 'range'"
    :modified="modified"
    :align-start="
      editor === 'position-grid' ||
      editor === 'font-family' ||
      field.control === 'color'
    "
  >
    <ObsLookSelect
      v-if="editor === 'look'"
      :id="controlId"
      :label="field.label"
      :model-value="String(modelValue)"
      :options="field.options"
      @update:model-value="updateValue"
    />

    <ObsFontFamilySelect
      v-else-if="editor === 'font-family'"
      :id="controlId"
      :label="field.label"
      :model-value="modelValue"
      :options="field.options"
      @update:model-value="updateValue"
    />

    <ObsPositionPicker
      v-else-if="editor === 'position-grid'"
      :id="controlId"
      :label="field.label"
      :model-value="String(modelValue)"
      :options="field.options"
      @update:model-value="updateValue"
    />

    <ObsSegmentedAppearanceChoice
      v-else-if="['alignment', 'font-scale'].includes(editor)"
      :id="controlId"
      :label="field.label"
      :editor="editor"
      :model-value="String(modelValue)"
      :options="field.options"
      @update:model-value="updateValue"
    />

    <UiSelect
      v-else-if="field.control === 'select'"
      :id="controlId"
      :label="field.label"
      :model-value="modelValue"
      :options="selectOptions"
      label-hidden
      @update:model-value="updateValue"
    />

    <ObsOutputColorField
      v-else-if="field.control === 'color'"
      :id="controlId"
      :label="field.label"
      :model-value="String(modelValue)"
      :recent-colors="recentColors"
      :saved-colors="savedColors"
      @update:model-value="updateValue"
      @commit="commitColor"
      @toggle-saved-color="emit('toggleSavedColor', $event)"
    />

    <div
      v-else-if="field.control === 'range'"
      class="obs-appearance-field__range-stack"
    >
      <div
        class="obs-appearance-field__compound obs-appearance-field__compound--range"
      >
        <UiRangeControl
          :id="controlId"
          class="obs-appearance-field__range"
          :model-value="Number(modelValue)"
          :min="field.min"
          :max="field.max"
          :step="field.step"
          :default-value="field.defaultValue"
          :disabled="disabled"
          :aria-describedby="disabledHint ? controlHintId : undefined"
          :value-text="valueText"
          :format-value="formatRangeValue"
          @update:model-value="updateNumber"
          @change="emit('commit')"
          @reset="emit('commit')"
        />
        <output class="obs-appearance-field__value" :for="controlId">
          {{ valueText }}
        </output>
      </div>
      <UiHint
        v-if="disabledHint"
        :id="controlHintId"
        class="obs-appearance-field__hint"
      >
        {{ disabledHint }}
      </UiHint>
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
  grid-template-columns: minmax(var(--ui-control-height), 1fr) var(
      --ui-output-range-value-width
    );
}

.obs-appearance-field__range-stack {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
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
