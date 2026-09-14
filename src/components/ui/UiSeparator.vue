<script setup>
defineProps({
  orientation: {
    type: String,
    default: 'horizontal',
    validator: (value) => ['horizontal', 'vertical'].includes(value),
  },
  decorative: { type: Boolean, default: true },
});
</script>

<template>
  <span
    class="ui-separator"
    :class="`ui-separator--${orientation}`"
    :role="decorative ? undefined : 'separator'"
    :aria-hidden="decorative ? 'true' : undefined"
    :aria-orientation="decorative ? undefined : orientation"
  ></span>
</template>

<style scoped>
.ui-separator {
  display: block;
  flex: 0 0 auto;
  border: 0;
  background: var(--ui-color-border);
}

.ui-separator--horizontal {
  inline-size: 100%;
  block-size: var(--ui-border-width);
}

.ui-separator--vertical {
  align-self: stretch;
  inline-size: var(--ui-border-width);
  block-size: auto;
}
</style>
