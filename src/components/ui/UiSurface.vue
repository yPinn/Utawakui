<script setup>
import { computed } from 'vue';

const props = defineProps({
  tone: {
    type: String,
    default: 'surface',
    validator: (value) => ['canvas', 'surface', 'raised'].includes(value),
  },
  radius: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value),
  },
  stroke: {
    type: String,
    default: 'border',
    validator: (value) => ['border', 'inset'].includes(value),
  },
  // Lets a caller preserve its own semantic/landmark tag (<aside>,
  // <section>, ...) instead of silently downgrading to <div> — added once
  // that genuinely blocked more than one migration this session, not
  // speculatively.
  tag: { type: String, default: 'div' },
});

const modifierClasses = computed(() => [
  `ui-surface--tone-${props.tone}`,
  `ui-surface--radius-${props.radius}`,
  `ui-surface--stroke-${props.stroke}`,
]);
</script>

<template>
  <component :is="tag" class="ui-surface" :class="modifierClasses">
    <slot />
  </component>
</template>

<style scoped>
.ui-surface {
  border: var(--ui-border-width) solid var(--ui-color-border);
}

.ui-surface--stroke-inset {
  position: relative;
  border: 0;
}

.ui-surface--stroke-inset::after {
  content: '';
  position: absolute;
  inset: 0;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: inherit;
  pointer-events: none;
}

.ui-surface--tone-canvas {
  background: var(--ui-color-canvas);
}

.ui-surface--tone-surface {
  background: var(--ui-color-surface);
}

.ui-surface--tone-raised {
  background: var(--ui-color-surface-raised);
}

.ui-surface--radius-sm {
  border-radius: var(--ui-radius-sm);
}

.ui-surface--radius-md {
  border-radius: var(--ui-radius-md);
}

.ui-surface--radius-lg {
  border-radius: var(--ui-radius-lg);
}
</style>
