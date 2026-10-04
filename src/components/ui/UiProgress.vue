<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  valueText: { type: String, default: '' },
  indeterminate: { type: Boolean, default: false },
});
</script>

<template>
  <div class="ui-progress">
    <div class="ui-progress__copy">
      <span class="ui-progress__label">{{ label }}</span>
      <span v-if="valueText && !indeterminate" class="ui-progress__value">
        {{ valueText }}
      </span>
    </div>
    <progress
      class="ui-progress__track"
      :value="indeterminate ? undefined : value"
      :max="max"
      :aria-label="label"
      :aria-valuetext="!indeterminate && valueText ? valueText : undefined"
    />
  </div>
</template>

<style scoped>
.ui-progress {
  min-inline-size: 0;
  max-inline-size: 100%;
  display: grid;
  gap: var(--ui-space-1);
}

.ui-progress__copy {
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

.ui-progress__label {
  min-inline-size: 0;
  color: var(--ui-color-text);
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: normal;
}

.ui-progress__value {
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ui-progress__track {
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

.ui-progress__track::-webkit-progress-bar {
  border-radius: var(--ui-radius-xs);
  background: var(--ui-color-surface-hover);
}

.ui-progress__track::-webkit-progress-value {
  border-radius: var(--ui-radius-xs);
  background: var(--ui-color-info);
}

.ui-progress__track::-moz-progress-bar {
  border-radius: var(--ui-radius-xs);
  background: var(--ui-color-info);
}

.ui-progress__track:indeterminate {
  background:
    linear-gradient(
        90deg,
        transparent 0 8%,
        var(--ui-color-info) 8% 46%,
        transparent 46% 100%
      )
      0 0 / 220% 100% no-repeat,
    var(--ui-color-surface-hover);
  animation: ui-progress-indeterminate 1.4s var(--ui-motion-easing-standard)
    infinite;
}

.ui-progress__track:indeterminate::-webkit-progress-bar {
  background:
    linear-gradient(
        90deg,
        transparent 0 8%,
        var(--ui-color-info) 8% 46%,
        transparent 46% 100%
      )
      0 0 / 220% 100% no-repeat,
    var(--ui-color-surface-hover);
  animation: ui-progress-indeterminate 1.4s var(--ui-motion-easing-standard)
    infinite;
}

@keyframes ui-progress-indeterminate {
  from {
    background-position: 100% 0;
  }

  to {
    background-position: -100% 0;
  }
}

:global(:root[data-ui-motion='reduced']) .ui-progress__track:indeterminate,
:global(:root[data-ui-motion='reduced'])
  .ui-progress__track:indeterminate::-webkit-progress-bar {
  animation: none;
  background-position: 50% 0;
}

@media (prefers-reduced-motion: reduce) {
  .ui-progress__track:indeterminate,
  .ui-progress__track:indeterminate::-webkit-progress-bar {
    animation: none;
    background-position: 50% 0;
  }
}
</style>
