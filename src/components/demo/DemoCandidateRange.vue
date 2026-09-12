<script setup>
import { computed, useAttrs, useTemplateRef } from 'vue';
import { nativeControlAttrs } from '../ui/fieldAttrs.js';
import UiField from '../ui/UiField.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  marks: { type: Array, default: () => [] },
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

const rangeRatio = computed(() => {
  const span = props.max - props.min;
  if (!Number.isFinite(span) || span <= 0) return 0;

  const ratio = (props.modelValue - props.min) / span;
  return Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
});

const rangeStyle = computed(() => ({
  '--demo-range-ratio': rangeRatio.value,
}));

const normalizedMarks = computed(() => {
  const span = props.max - props.min;
  if (!Number.isFinite(span) || span <= 0) return [];

  return [...new Set(props.marks)]
    .filter(
      (value) =>
        Number.isFinite(value) && value >= props.min && value <= props.max,
    )
    .sort((left, right) => left - right)
    .map((value) => ({
      value,
      position: (value - props.min) / span,
    }));
});

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
    :class="[attrs.class, { 'is-disabled': disabled }]"
    :style="attrs.style"
    :label="label"
    :hint="hint"
    :error="error"
    :described-by="attrs['aria-describedby']"
    :invalid="invalid"
    :label-hidden="labelHidden"
    class="demo-candidate-range"
  >
    <template #default="{ describedBy, invalid: fieldInvalid }">
      <div
        class="demo-candidate-range__layout"
        :class="{ 'has-value-text': valueText }"
      >
        <div class="demo-candidate-range__control" :style="rangeStyle">
          <input
            v-bind="nativeControlAttrs(attrs)"
            :id="id"
            ref="range"
            class="demo-candidate-range__native"
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
          <span class="demo-candidate-range__track" aria-hidden="true">
            <span class="demo-candidate-range__fill"></span>
            <span
              v-if="normalizedMarks.length"
              class="demo-candidate-range__stops"
              aria-hidden="true"
            >
              <span
                v-for="mark in normalizedMarks"
                :key="mark.value"
                class="demo-candidate-range__stop"
                :data-range-stop="mark.value"
                :style="{ '--demo-range-stop-position': mark.position }"
              ></span>
            </span>
          </span>
        </div>
        <output v-if="valueText" class="demo-candidate-range__value" :for="id">
          {{ valueText }}
        </output>
      </div>
    </template>
  </UiField>
</template>

<style scoped>
.demo-candidate-range {
  --demo-range-track-size: 0.375rem;
  --demo-range-track-rest: color-mix(
    in srgb,
    var(--ui-color-text-muted) 70%,
    var(--ui-color-canvas)
  );

  min-width: 0;
  container-type: inline-size;
}

.demo-candidate-range :deep(.ui-field__label) {
  min-width: 0;
  overflow-wrap: anywhere;
  -webkit-user-select: none;
  user-select: none;
}

.demo-candidate-range__layout {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
  min-height: var(--demo-range-target-size, var(--ui-control-height));
}

.demo-candidate-range__control {
  position: relative;
  min-width: 0;
  height: var(--demo-range-target-size, var(--ui-control-height));
}

.demo-candidate-range__native {
  position: absolute;
  z-index: 1;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

.demo-candidate-range__native::-webkit-slider-runnable-track {
  width: 100%;
  height: var(--demo-range-track-size);
  border: 0;
  background: transparent;
}

.demo-candidate-range__native::-webkit-slider-thumb {
  width: var(--ui-range-thumb-size);
  height: var(--ui-range-thumb-size);
  margin-block-start: calc(
    (var(--demo-range-track-size) - var(--ui-range-thumb-size)) / 2
  );
  appearance: none;
  border: var(--ui-focus-width) solid var(--ui-color-canvas);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-accent);
  box-shadow: 0 1px 2px
    color-mix(in srgb, var(--ui-color-canvas) 70%, transparent);
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    box-shadow var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
}

.demo-candidate-range__track {
  position: absolute;
  inset-block-start: 50%;
  inset-inline: calc(var(--ui-range-thumb-size) / 2);
  height: var(--demo-range-track-size);
  overflow: hidden;
  border-radius: var(--ui-radius-pill);
  background: var(--demo-range-track-rest);
  pointer-events: none;
  transform: translateY(-50%);
}

.demo-candidate-range__fill {
  display: block;
  width: calc(var(--demo-range-ratio) * 100%);
  height: 100%;
  border-radius: inherit;
  background: var(--ui-color-accent);
}

.demo-candidate-range__stops {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.demo-candidate-range__stop {
  position: absolute;
  inset-block: 1px;
  inset-inline-start: calc(var(--demo-range-stop-position) * 100%);
  width: 1px;
  background: color-mix(in srgb, var(--ui-color-canvas) 78%, transparent);
  transform: translateX(-50%);
}

.demo-candidate-range__native:hover:not(:disabled)::-webkit-slider-thumb {
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--ui-color-canvas) 70%, transparent),
    0 0 0 var(--ui-space-1) var(--ui-color-accent-soft);
}

.demo-candidate-range__native:focus-visible {
  outline: none;
}

.demo-candidate-range__native:focus-visible::-webkit-slider-thumb {
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--ui-color-canvas) 70%, transparent),
    0 0 0 var(--ui-focus-offset) var(--ui-color-canvas),
    0 0 0 calc(var(--ui-focus-offset) + var(--ui-focus-width))
      var(--ui-color-focus);
}

.demo-candidate-range__native[aria-invalid='true']
  + .demo-candidate-range__track
  .demo-candidate-range__fill,
.demo-candidate-range__native[aria-invalid='true']::-webkit-slider-thumb {
  background: var(--ui-color-danger);
}

.demo-candidate-range.is-disabled :deep(.ui-field__main) {
  opacity: var(--ui-opacity-disabled);
}

.demo-candidate-range__native:disabled {
  cursor: not-allowed;
}

.demo-candidate-range__value {
  min-inline-size: 2.5rem;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
  line-height: var(--ui-line-height-caption);
  text-align: end;
  overflow-wrap: anywhere;
  -webkit-user-select: none;
  user-select: none;
}

@container (max-width: 18rem) {
  .demo-candidate-range__layout.has-value-text {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .demo-candidate-range__value {
    justify-self: end;
  }
}
</style>
