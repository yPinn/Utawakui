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
      <span v-if="valueText" class="ui-progress__value">{{ valueText }}</span>
    </div>
    <progress
      class="ui-progress__track"
      :value="indeterminate ? undefined : value"
      :max="max"
      :aria-label="label"
      :aria-valuetext="valueText || undefined"
      :aria-busy="indeterminate || undefined"
    />
  </div>
</template>

<style scoped>
.ui-progress {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.ui-progress__copy {
  min-width: 0;
  display: flex;
  justify-content: space-between;
  gap: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.ui-progress__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-progress__value {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}

.ui-progress__track {
  width: 100%;
  height: var(--ui-progress-track-size);
  overflow: hidden;
  border: 0;
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-accent);
  accent-color: var(--ui-color-accent);
}

.ui-progress__track::-webkit-progress-bar {
  background: var(--ui-color-surface-hover);
}

.ui-progress__track::-webkit-progress-value {
  background: var(--ui-color-accent);
}
</style>
