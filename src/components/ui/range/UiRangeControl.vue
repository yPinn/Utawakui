<script setup>
import {
  computed,
  nextTick,
  shallowRef,
  useAttrs,
  useId,
  useTemplateRef,
  watch,
} from 'vue';
import {
  anchoredFloatingPosition,
  customLengthPixels,
} from '../floatingPosition.js';
import { nativeControlAttrs } from '../fieldAttrs.js';
import UiTooltipSurface from '../tooltip/UiTooltipSurface.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  id: { type: String, default: undefined },
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  defaultValue: { type: Number, default: undefined },
  marks: { type: Array, default: () => [] },
  valueText: { type: String, default: '' },
  formatValue: { type: Function, default: null },
  disabled: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'reset']);
const attrs = useAttrs();
const rangeRef = useTemplateRef('range');
const previewTooltipRef = shallowRef(null);
const previewOpen = shallowRef(false);
const previewText = shallowRef('');
const previewPosition = shallowRef({ left: '0px', top: '0px' });
const previewAnchor = shallowRef(null);
const previewTooltipId = `ui-range-preview-${useId()}`;

const rangeRatio = computed(() => {
  const span = props.max - props.min;
  if (!Number.isFinite(span) || span <= 0) return 0;

  const ratio = (props.modelValue - props.min) / span;
  return Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
});

const rangeStyle = computed(() => ({
  '--ui-range-ratio': rangeRatio.value,
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

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function snapPreviewValue(value) {
  const bounded = clamp(value, props.min, props.max);
  if (!Number.isFinite(props.step) || props.step <= 0) return bounded;

  const epsilon = Math.abs(props.step) * 1e-9;
  const snapped =
    props.min +
    Math.round((bounded - props.min + epsilon) / props.step) * props.step;
  return Number(clamp(snapped, props.min, props.max).toFixed(12));
}

function formatPreviewValue(value) {
  const formatted = props.formatValue?.(value);
  return formatted === undefined || formatted === null || formatted === ''
    ? String(value)
    : String(formatted);
}

function setPreviewTooltip(value) {
  previewTooltipRef.value = value?.$el ?? value;
}

function updatePreviewPosition() {
  if (!previewOpen.value || typeof window === 'undefined') return;
  const tooltip = previewTooltipRef.value?.getBoundingClientRect();
  const anchor = previewAnchor.value;
  const range = rangeRef.value;
  if (!tooltip || !anchor || !range) return;

  const direction = window.getComputedStyle(range).direction;
  const { left, top } = anchoredFloatingPosition({
    anchor,
    surface: tooltip,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    placement: 'top',
    direction,
    gap: customLengthPixels('--ui-floating-gap', 0.5),
    inset: customLengthPixels('--ui-floating-viewport-inset', 0.5),
  });
  previewPosition.value = { left: `${left}px`, top: `${top}px` };
}

function previewPointerValue(event) {
  if (
    props.disabled ||
    event.pointerType === 'touch' ||
    !Number.isFinite(event.clientX)
  ) {
    hidePreview();
    return;
  }

  const rangeElement = rangeRef.value;
  const range = rangeElement?.getBoundingClientRect();
  const span = props.max - props.min;
  if (!range || range.width <= 0 || !Number.isFinite(span) || span <= 0) {
    hidePreview();
    return;
  }

  const thumbSize = customLengthPixels('--ui-range-thumb-size', 1);
  const trackStart = range.left + thumbSize / 2;
  const trackEnd = range.right - thumbSize / 2;
  const trackWidth = trackEnd - trackStart;
  if (trackWidth <= 0) {
    hidePreview();
    return;
  }

  const clientX = clamp(event.clientX, trackStart, trackEnd);
  const visualRatio = (clientX - trackStart) / trackWidth;
  const direction = window.getComputedStyle(rangeElement).direction;
  const ratio = direction === 'rtl' ? 1 - visualRatio : visualRatio;
  const previewValue = snapPreviewValue(props.min + ratio * span);
  const trackCenter = range.top + range.height / 2;

  previewText.value = formatPreviewValue(previewValue);
  previewAnchor.value = {
    bottom: trackCenter,
    height: 0,
    left: clientX,
    right: clientX,
    top: trackCenter,
    width: 0,
  };
  previewOpen.value = true;
  nextTick(updatePreviewPosition);
}

function hidePreview() {
  previewOpen.value = false;
}

function updateValue(event) {
  const value = Number.isFinite(event.target.valueAsNumber)
    ? event.target.valueAsNumber
    : Number(event.target.value);
  emit('update:modelValue', value);
}

function resetToDefault(event) {
  if (props.disabled || !Number.isFinite(props.defaultValue)) return;

  event.preventDefault();
  event.stopPropagation();
  hidePreview();
  const value = snapPreviewValue(props.defaultValue);
  if (Object.is(value, props.modelValue)) return;
  emit('update:modelValue', value);
  emit('reset', value);
}

function focus() {
  rangeRef.value?.focus();
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) hidePreview();
  },
);

defineExpose({ focus });
</script>

<template>
  <div
    class="ui-range-control"
    :class="[attrs.class, { 'is-disabled': disabled }]"
    :style="[rangeStyle, attrs.style]"
  >
    <input
      v-bind="nativeControlAttrs(attrs)"
      :id="id"
      ref="range"
      class="ui-range-control__native"
      type="range"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :aria-invalid="invalid || attrs['aria-invalid'] || undefined"
      :aria-valuetext="valueText || attrs['aria-valuetext'] || undefined"
      @pointerenter="previewPointerValue"
      @pointermove="previewPointerValue"
      @pointerdown="previewPointerValue"
      @pointerleave="hidePreview"
      @pointercancel="hidePreview"
      @input="updateValue"
      @contextmenu="resetToDefault"
    />
    <span class="ui-range-control__track" aria-hidden="true">
      <span class="ui-range-control__fill"></span>
      <span
        v-if="normalizedMarks.length"
        class="ui-range-control__stops"
        aria-hidden="true"
      >
        <span
          v-for="mark in normalizedMarks"
          :key="mark.value"
          class="ui-range-control__stop"
          :data-range-stop="mark.value"
          :style="{ '--ui-range-stop-position': mark.position }"
        ></span>
      </span>
    </span>
    <UiTooltipSurface
      :open="previewOpen"
      :text="previewText"
      :tooltip-id="previewTooltipId"
      :position="previewPosition"
      placement="top"
      :set-element="setPreviewTooltip"
      :hoverable="false"
    />
  </div>
</template>

<style scoped>
.ui-range-control {
  min-width: 0;
  width: 100%;
}

.ui-range-control__native {
  width: 100%;
  min-width: 0;
  height: var(--ui-range-control-active-height, auto);
  margin: 0;
  accent-color: var(--ui-color-accent);
  cursor: pointer;
}

.ui-range-control__native::-webkit-slider-thumb {
  width: var(--ui-range-thumb-size);
  height: var(--ui-range-thumb-size);
}

.ui-range-control__native:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-range-control__native:disabled {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}

.ui-range-control__track {
  display: none;
}

@scope ([data-ui-system='v2']) to ([data-ui-system]) {
  .ui-range-control {
    position: relative;
    isolation: isolate;
    height: var(--ui-range-target-size, var(--ui-control-height));
    -webkit-user-select: none;
    user-select: none;
  }

  .ui-range-control__native {
    position: absolute;
    z-index: var(--ui-layer-raised);
    inset: 0;
    height: 100%;
    appearance: none;
    background: transparent;
  }

  .ui-range-control__native::-webkit-slider-runnable-track {
    width: 100%;
    height: var(--ui-range-track-size);
    border: 0;
    background: transparent;
  }

  .ui-range-control__native::-webkit-slider-thumb {
    box-sizing: border-box;
    width: var(--ui-range-thumb-size);
    height: var(--ui-range-thumb-size);
    margin-block-start: calc(
      (var(--ui-range-track-size) - var(--ui-range-thumb-size)) / 2
    );
    appearance: none;
    border: var(--ui-focus-width) solid var(--ui-range-thumb-border);
    border-radius: var(--ui-radius-pill);
    background: var(--ui-range-thumb);
    opacity: 0;
    transition:
      background-color var(--ui-motion-duration-feedback)
        var(--ui-motion-easing-standard),
      opacity var(--ui-motion-duration-feedback)
        var(--ui-motion-easing-standard),
      box-shadow var(--ui-motion-duration-feedback)
        var(--ui-motion-easing-standard);
  }

  .ui-range-control__track {
    position: absolute;
    display: block;
    inset-block-start: 50%;
    inset-inline: calc(var(--ui-range-thumb-size) / 2);
    height: var(--ui-range-track-size);
    overflow: hidden;
    border-radius: var(--ui-radius-pill);
    background: var(--ui-range-track);
    pointer-events: none;
    transform: translateY(-50%);
  }

  .ui-range-control__fill {
    display: block;
    width: calc(var(--ui-range-ratio) * 100%);
    height: 100%;
    border-radius: inherit;
    background: var(--ui-range-fill);
    transition: background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
  }

  .ui-range-control__stops {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .ui-range-control__stop {
    position: absolute;
    inset-block: 1px;
    inset-inline-start: calc(var(--ui-range-stop-position) * 100%);
    width: 1px;
    background: var(--ui-range-stop);
    transform: translateX(-50%);
  }

  .ui-range-control__native:where(:hover:not(:disabled))
    + .ui-range-control__track
    .ui-range-control__fill,
  .ui-range-control__native:where(:focus-visible)
    + .ui-range-control__track
    .ui-range-control__fill {
    background: var(--ui-range-fill-hover);
  }

  .ui-range-control__native:where(:active:not(:disabled))
    + .ui-range-control__track
    .ui-range-control__fill {
    background: var(--ui-range-fill-active);
  }

  .ui-range-control__native:hover:not(:disabled)::-webkit-slider-thumb,
  .ui-range-control__native:focus-visible::-webkit-slider-thumb,
  .ui-range-control__native:active:not(:disabled)::-webkit-slider-thumb {
    opacity: 1;
  }

  .ui-range-control__native:focus-visible {
    outline: none;
  }

  .ui-range-control__native:focus-visible::-webkit-slider-thumb {
    box-shadow:
      0 0 0 var(--ui-focus-offset) var(--ui-range-thumb-border),
      0 0 0 calc(var(--ui-focus-offset) + var(--ui-focus-width))
        var(--ui-range-focus);
  }

  .ui-range-control__native[aria-invalid='true'] + .ui-range-control__track,
  .ui-range-control__native[aria-invalid='true']
    + .ui-range-control__track
    .ui-range-control__fill,
  .ui-range-control__native[aria-invalid='true']::-webkit-slider-thumb {
    background: var(--ui-range-invalid);
  }

  .ui-range-control.is-disabled {
    opacity: var(--ui-opacity-disabled);
  }

  .ui-range-control__native:disabled {
    opacity: 1;
  }

  @media (forced-colors: active) {
    .ui-range-control__track {
      background: CanvasText;
    }

    .ui-range-control__fill,
    .ui-range-control__native::-webkit-slider-thumb {
      background: Highlight;
    }

    .ui-range-control__native::-webkit-slider-thumb {
      border-color: Canvas;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ui-range-control__fill,
    .ui-range-control__native::-webkit-slider-thumb {
      transition: none;
    }
  }
}
</style>
