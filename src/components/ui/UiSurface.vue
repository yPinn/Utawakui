<script setup>
import { computed } from 'vue';

const props = defineProps({
  tone: { type: String, default: 'surface' },
  radius: { type: String, default: 'md' },
  // Lets a caller preserve its own semantic/landmark tag (<aside>,
  // <section>, ...) instead of silently downgrading to <div> — added once
  // that genuinely blocked more than one migration this session, not
  // speculatively.
  tag: { type: String, default: 'div' },
});

const modifierClasses = computed(() => [
  `ui-surface--tone-${props.tone}`,
  `ui-surface--radius-${props.radius}`,
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
