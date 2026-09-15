<script setup>
import { computed } from 'vue';

const props = defineProps({
  tone: { type: String, default: 'surface' },
  radius: { type: String, default: 'md' },
});

const modifierClasses = computed(() => [
  `ui-surface--tone-${props.tone}`,
  `ui-surface--radius-${props.radius}`,
]);
</script>

<template>
  <div class="ui-surface" :class="modifierClasses">
    <slot />
  </div>
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

.ui-surface--radius-md {
  border-radius: var(--ui-radius-md);
}

.ui-surface--radius-lg {
  border-radius: var(--ui-radius-lg);
}
</style>
