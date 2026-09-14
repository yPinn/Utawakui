<script setup>
const props = defineProps({
  lines: {
    type: Number,
    default: 1,
    validator: (value) => Number.isInteger(value) && value >= 1 && value <= 12,
  },
  shape: {
    type: String,
    default: 'text',
    validator: (value) => ['text', 'block', 'circle'].includes(value),
  },
  pattern: {
    type: String,
    default: 'uniform',
    validator: (value) => ['uniform', 'staggered'].includes(value),
  },
  ariaLabel: { type: String, default: '' },
});
</script>

<template>
  <div
    class="ui-skeleton"
    :class="[`ui-skeleton--${props.shape}`, `ui-skeleton--${props.pattern}`]"
    :role="props.ariaLabel ? 'status' : undefined"
    :aria-label="props.ariaLabel || undefined"
    :aria-hidden="props.ariaLabel ? undefined : 'true'"
    aria-busy="true"
  >
    <span
      v-for="index in props.lines"
      :key="index"
      class="ui-skeleton__shape"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.ui-skeleton {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.ui-skeleton__shape {
  display: block;
  inline-size: 100%;
  block-size: var(--ui-skeleton-text-block-size);
  overflow: hidden;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface-hover);
  animation: ui-skeleton-pulse var(--ui-skeleton-pulse-duration)
    var(--ui-motion-easing-standard) infinite alternate;
}

.ui-skeleton--staggered .ui-skeleton__shape:nth-child(3n + 1) {
  inline-size: 72%;
}

.ui-skeleton--staggered .ui-skeleton__shape:nth-child(3n + 2) {
  inline-size: 48%;
}

.ui-skeleton--staggered .ui-skeleton__shape:nth-child(3n) {
  inline-size: 86%;
}

.ui-skeleton--block .ui-skeleton__shape {
  min-block-size: var(--ui-skeleton-block-min-block-size);
}

.ui-skeleton--circle {
  inline-size: var(--ui-skeleton-circle-size);
}

.ui-skeleton--circle .ui-skeleton__shape {
  block-size: auto;
  aspect-ratio: 1;
  border-radius: 50%;
}

@keyframes ui-skeleton-pulse {
  from {
    opacity: var(--ui-opacity-muted);
  }

  to {
    opacity: 1;
  }
}

:global(:root[data-ui-motion='reduced']) .ui-skeleton__shape {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .ui-skeleton__shape {
    animation: none;
  }
}
</style>
