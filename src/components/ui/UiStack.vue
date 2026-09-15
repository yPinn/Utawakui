<script setup>
import { computed } from 'vue';

const props = defineProps({
  direction: { type: String, default: 'row' },
  // 0 = no gap declared at all (native flex default), matching the many
  // consumers that only needed align/justify without spacing between items.
  gap: { type: Number, default: 0 },
  align: { type: String, default: undefined },
  justify: { type: String, default: undefined },
  wrap: { type: Boolean, default: false },
});

const modifierClasses = computed(() => [
  props.direction === 'column' && 'ui-stack--column',
  props.wrap && 'ui-stack--wrap',
  props.align && `ui-stack--align-${props.align}`,
  props.justify && `ui-stack--justify-${props.justify}`,
  props.gap > 0 && `ui-stack--gap-${props.gap}`,
]);
</script>

<template>
  <div class="ui-stack" :class="modifierClasses">
    <slot />
  </div>
</template>

<style scoped>
.ui-stack {
  display: flex;
}

.ui-stack--column {
  flex-direction: column;
}

.ui-stack--wrap {
  flex-wrap: wrap;
}

.ui-stack--align-start {
  align-items: flex-start;
}

.ui-stack--align-center {
  align-items: center;
}

.ui-stack--align-end {
  align-items: flex-end;
}

.ui-stack--align-stretch {
  align-items: stretch;
}

.ui-stack--align-baseline {
  align-items: baseline;
}

.ui-stack--justify-start {
  justify-content: flex-start;
}

.ui-stack--justify-center {
  justify-content: center;
}

.ui-stack--justify-end {
  justify-content: flex-end;
}

.ui-stack--justify-space-between {
  justify-content: space-between;
}

.ui-stack--justify-space-around {
  justify-content: space-around;
}

.ui-stack--gap-1 {
  gap: var(--ui-space-1);
}

.ui-stack--gap-2 {
  gap: var(--ui-space-2);
}

.ui-stack--gap-3 {
  gap: var(--ui-space-3);
}

.ui-stack--gap-4 {
  gap: var(--ui-space-4);
}

.ui-stack--gap-5 {
  gap: var(--ui-space-5);
}

.ui-stack--gap-6 {
  gap: var(--ui-space-6);
}

.ui-stack--gap-7 {
  gap: var(--ui-space-7);
}

.ui-stack--gap-8 {
  gap: var(--ui-space-8);
}
</style>
