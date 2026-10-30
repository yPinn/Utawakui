<script setup>
import { computed, shallowRef, watch } from 'vue';

const props = defineProps({
  label: { type: String, required: true },
  labelHidden: { type: Boolean, default: false },
  value: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  valueText: { type: String, default: '' },
  indeterminate: { type: Boolean, default: false },
});

const ratio = computed(() => {
  const ratio = props.value / props.max;
  return Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
});

// Sparse forward steps glide. A reset or retry jumps back, and a stream of
// updates (e.g. a playback position) is already smooth, so it never chases a
// transition it would only lag behind.
const CONTINUOUS_UPDATE_MS = 200;
const snapping = shallowRef(false);
let lastUpdateAt = Number.NEGATIVE_INFINITY;
watch(ratio, (next, previous) => {
  const now = performance.now();
  const continuous = now - lastUpdateAt < CONTINUOUS_UPDATE_MS;
  lastUpdateAt = now;
  snapping.value = next < previous || continuous;
});
</script>

<template>
  <div class="ui-progress">
    <div v-if="!labelHidden" class="ui-progress__copy">
      <span class="ui-progress__label">{{ label }}</span>
      <span v-if="valueText && !indeterminate" class="ui-progress__value">
        {{ valueText }}
      </span>
    </div>
    <div class="ui-progress__meter">
      <progress
        class="ui-progress__track"
        :value="indeterminate ? undefined : value"
        :max="max"
        :aria-label="label"
        :aria-valuetext="!indeterminate && valueText ? valueText : undefined"
      />
      <!-- Native progress keeps the semantics; this layer only paints the
           value so it can transition. -->
      <span
        v-if="!indeterminate"
        class="ui-progress__fill"
        :class="{ 'is-snapping': snapping }"
        :style="{ '--ui-progress-ratio': ratio }"
        aria-hidden="true"
      ></span>
    </div>
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
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
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

.ui-progress__meter {
  position: relative;
  overflow: hidden;
  border-radius: var(--ui-radius-xs);
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

/* The fill layer paints the value; the native one stays invisible. */
.ui-progress__track::-webkit-progress-value {
  background: transparent;
}

.ui-progress__track::-moz-progress-bar {
  background: transparent;
}

/* A full-width bar slid into view keeps its leading radius at any ratio. */
.ui-progress__fill {
  position: absolute;
  inset: 0;
  border-radius: var(--ui-radius-xs);
  background: var(--ui-color-info);
  pointer-events: none;
  transform: translateX(calc((var(--ui-progress-ratio) - 1) * 100%));
  transition: transform var(--ui-motion-duration-slow)
    var(--ui-motion-easing-standard);
}

.ui-progress__fill:dir(rtl) {
  transform: translateX(calc((1 - var(--ui-progress-ratio)) * 100%));
}

.ui-progress__fill.is-snapping {
  transition: none;
}

@media (forced-colors: active) {
  .ui-progress__fill {
    forced-color-adjust: none;
    background: Highlight;
  }
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

:global(:root[data-ui-motion='reduced'] .ui-progress__track:indeterminate),
:global(
  :root[data-ui-motion='reduced']
    .ui-progress__track:indeterminate::-webkit-progress-bar
) {
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
