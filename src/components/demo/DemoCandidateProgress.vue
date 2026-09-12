<script setup>
import { useAttrs } from 'vue';

defineOptions({ inheritAttrs: false });

defineProps({
  label: { type: String, required: true },
  value: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  valueText: { type: String, default: '' },
  indeterminate: { type: Boolean, default: false },
  density: {
    type: String,
    default: 'standard',
    validator: (value) => ['standard', 'compact'].includes(value),
  },
});

const attrs = useAttrs();
</script>

<template>
  <div
    v-bind="attrs"
    class="demo-candidate-progress"
    :class="`demo-candidate-progress--${density}`"
  >
    <div class="demo-candidate-progress__copy">
      <span class="demo-candidate-progress__label">{{ label }}</span>
      <span
        v-if="valueText && !indeterminate"
        class="demo-candidate-progress__value"
      >
        {{ valueText }}
      </span>
    </div>
    <progress
      class="demo-candidate-progress__track"
      :value="indeterminate ? undefined : value"
      :max="max"
      :aria-label="label"
      :aria-valuetext="!indeterminate && valueText ? valueText : undefined"
    />
  </div>
</template>

<style scoped>
.demo-candidate-progress {
  min-inline-size: 0;
  max-inline-size: 100%;
  display: grid;
  gap: var(--ui-space-1);
}

.demo-candidate-progress__copy {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: var(--ui-space-2);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  -webkit-user-select: none;
  user-select: none;
}

.demo-candidate-progress__label {
  min-inline-size: 0;
  color: var(--ui-color-text);
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: normal;
}

.demo-candidate-progress__value {
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.demo-candidate-progress__track {
  box-sizing: border-box;
  width: 100%;
  height: var(--ui-progress-track-size);
  display: block;
  overflow: hidden;
  appearance: none;
  -webkit-appearance: none;
  border: 0;
  border-radius: var(--ui-radius-xs);
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-info);
}

.demo-candidate-progress__track::-webkit-progress-bar {
  border-radius: var(--ui-radius-xs);
  background: var(--ui-color-surface-hover);
}

.demo-candidate-progress__track::-webkit-progress-value {
  border-radius: var(--ui-radius-xs);
  background: var(--ui-color-info);
}

.demo-candidate-progress__track::-moz-progress-bar {
  border-radius: var(--ui-radius-xs);
  background: var(--ui-color-info);
}

.demo-candidate-progress__track:indeterminate {
  background:
    linear-gradient(
        90deg,
        transparent 0 8%,
        var(--ui-color-info) 8% 46%,
        transparent 46% 100%
      )
      0 0 / 220% 100% no-repeat,
    var(--ui-color-surface-hover);
  animation: demo-progress-indeterminate 1.4s var(--ui-motion-easing-standard)
    infinite;
}

.demo-candidate-progress__track:indeterminate::-webkit-progress-bar {
  background:
    linear-gradient(
        90deg,
        transparent 0 8%,
        var(--ui-color-info) 8% 46%,
        transparent 46% 100%
      )
      0 0 / 220% 100% no-repeat,
    var(--ui-color-surface-hover);
  animation: demo-progress-indeterminate 1.4s var(--ui-motion-easing-standard)
    infinite;
}

@keyframes demo-progress-indeterminate {
  from {
    background-position: 100% 0;
  }

  to {
    background-position: -100% 0;
  }
}

:global(:root[data-ui-motion='reduced'])
  .demo-candidate-progress__track:indeterminate,
:global(:root[data-ui-motion='reduced'])
  .demo-candidate-progress__track:indeterminate::-webkit-progress-bar {
  animation: none;
  background-position: 50% 0;
}

@media (prefers-reduced-motion: reduce) {
  .demo-candidate-progress__track:indeterminate,
  .demo-candidate-progress__track:indeterminate::-webkit-progress-bar {
    animation: none;
    background-position: 50% 0;
  }
}
</style>
