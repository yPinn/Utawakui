<script setup>
import { useAttrs } from 'vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';

defineOptions({ inheritAttrs: false });

defineProps({
  icon: { type: [Object, Function], required: true },
  tone: {
    type: String,
    default: 'muted',
    validator: (value) =>
      [
        'muted',
        'accent',
        'info',
        'success',
        'warning',
        'danger',
        'current',
        'gated',
      ].includes(value),
  },
  size: {
    type: String,
    default: 'standard',
    validator: (value) => ['standard', 'compact'].includes(value),
  },
  spinning: { type: Boolean, default: false },
  label: { type: String, required: true },
  decorative: { type: Boolean, default: false },
});

const attrs = useAttrs();
</script>

<template>
  <UiStatusIcon
    v-bind="attrs"
    class="demo-candidate-status-icon"
    :class="`demo-candidate-status-icon--${tone}`"
    :style="{
      '--demo-status-icon-size': size === 'compact' ? '1.25rem' : '1.5rem',
    }"
    :icon="icon"
    :tone="tone"
    :spinning="spinning"
    :label="label"
    :decorative="decorative"
  />
</template>

<style scoped>
.demo-candidate-status-icon {
  --demo-status-icon-tone: var(--ui-color-neutral);
  --demo-status-icon-tone-soft: var(--ui-color-neutral-soft);

  box-sizing: border-box;
  width: var(--demo-status-icon-size);
  height: var(--demo-status-icon-size);
  border: var(--ui-border-width) solid
    color-mix(in srgb, var(--demo-status-icon-tone) 42%, transparent);
  background: var(--demo-status-icon-tone-soft);
  color: var(--demo-status-icon-tone);
  vertical-align: middle;
}

.demo-candidate-status-icon--accent {
  --demo-status-icon-tone: color-mix(
    in srgb,
    var(--ui-color-accent) 80%,
    var(--ui-color-text)
  );
  --demo-status-icon-tone-soft: var(--ui-color-accent-soft);
}

.demo-candidate-status-icon--info {
  --demo-status-icon-tone: var(--ui-color-info);
  --demo-status-icon-tone-soft: var(--ui-color-info-soft);
}

.demo-candidate-status-icon--success {
  --demo-status-icon-tone: var(--ui-color-success);
  --demo-status-icon-tone-soft: var(--ui-color-success-soft);
}

.demo-candidate-status-icon--warning {
  --demo-status-icon-tone: var(--ui-color-warning);
  --demo-status-icon-tone-soft: var(--ui-color-warning-soft);
}

.demo-candidate-status-icon--danger {
  --demo-status-icon-tone: var(--ui-color-danger);
  --demo-status-icon-tone-soft: var(--ui-color-danger-soft);
}

.demo-candidate-status-icon--current {
  --demo-status-icon-tone: color-mix(
    in srgb,
    var(--ui-color-current) 80%,
    var(--ui-color-text)
  );
  --demo-status-icon-tone-soft: var(--ui-color-current-soft);
}

.demo-candidate-status-icon--gated {
  --demo-status-icon-tone: var(--ui-color-gated);
  --demo-status-icon-tone-soft: var(--ui-color-gated-bg);
}
</style>
