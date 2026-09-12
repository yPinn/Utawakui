<script setup>
import { useAttrs } from 'vue';
import UiChip from '../ui/UiChip.vue';

defineOptions({ inheritAttrs: false });

defineProps({
  tone: {
    type: String,
    default: 'muted',
    validator: (value) =>
      [
        'muted',
        'accent',
        'current',
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
  <UiChip
    v-bind="attrs"
    class="demo-candidate-chip"
    :class="`demo-candidate-chip--${tone}`"
    :tone="tone"
  >
    <span v-if="$slots.leading" class="demo-candidate-chip__leading">
      <slot name="leading" />
    </span>
    <span class="demo-candidate-chip__label"><slot /></span>
  </UiChip>
</template>

<style scoped>
.demo-candidate-chip {
  --demo-chip-tone: var(--ui-color-neutral);
  --demo-chip-tone-soft: var(--ui-color-neutral-soft);

  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  min-height: var(--demo-chip-height, 1.5rem);
  gap: var(--ui-space-1);
  padding: 0 var(--ui-space-2);
  overflow: hidden;
  border: var(--ui-border-width) solid
    color-mix(in srgb, var(--demo-chip-tone) 42%, transparent);
  background: var(--demo-chip-tone-soft);
  color: var(--demo-chip-tone);
  vertical-align: middle;
  -webkit-user-select: none;
  user-select: none;
}

.demo-candidate-chip__leading {
  min-width: 0;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
}

.demo-candidate-chip__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-candidate-chip--accent {
  --demo-chip-tone: color-mix(
    in srgb,
    var(--ui-color-accent) 80%,
    var(--ui-color-text)
  );
  --demo-chip-tone-soft: var(--ui-color-accent-soft);
}

.demo-candidate-chip--current {
  --demo-chip-tone: color-mix(
    in srgb,
    var(--ui-color-current) 80%,
    var(--ui-color-text)
  );
  --demo-chip-tone-soft: var(--ui-color-current-soft);
}

.demo-candidate-chip--info {
  --demo-chip-tone: var(--ui-color-info);
  --demo-chip-tone-soft: var(--ui-color-info-soft);
}

.demo-candidate-chip--success {
  --demo-chip-tone: var(--ui-color-success);
  --demo-chip-tone-soft: var(--ui-color-success-soft);
}

.demo-candidate-chip--warning {
  --demo-chip-tone: var(--ui-color-warning);
  --demo-chip-tone-soft: var(--ui-color-warning-soft);
}

.demo-candidate-chip--danger {
  --demo-chip-tone: var(--ui-color-danger);
  --demo-chip-tone-soft: var(--ui-color-danger-soft);
}

.demo-candidate-chip--gated {
  --demo-chip-tone: var(--ui-color-gated);
  --demo-chip-tone-soft: var(--ui-color-gated-bg);
}
</style>
