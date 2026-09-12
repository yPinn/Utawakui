<script setup>
import { useAttrs } from 'vue';
import UiHint from '../ui/UiHint.vue';

defineOptions({ inheritAttrs: false });

defineProps({
  tone: {
    type: String,
    default: 'muted',
    validator: (value) =>
      [
        'muted',
        'text',
        'info',
        'success',
        'warning',
        'danger',
        'gated',
      ].includes(value),
  },
});

const attrs = useAttrs();
</script>

<template>
  <UiHint
    v-bind="attrs"
    class="demo-candidate-hint"
    :class="`demo-candidate-hint--${tone}`"
    :tone="tone"
  >
    <slot />
  </UiHint>
</template>

<style scoped>
.demo-candidate-hint {
  min-width: 0;
  max-width: 100%;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: normal;
}

.demo-candidate-hint--muted {
  color: var(--ui-color-text-muted);
}

.demo-candidate-hint--text {
  color: var(--ui-color-text);
}

.demo-candidate-hint--info {
  color: var(--ui-color-info);
}

.demo-candidate-hint--success {
  color: var(--ui-color-success);
}

.demo-candidate-hint--warning {
  color: var(--ui-color-warning);
}

.demo-candidate-hint--danger {
  color: var(--ui-color-danger);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-candidate-hint--gated {
  color: var(--ui-color-gated);
}
</style>
