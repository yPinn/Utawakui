<script setup>
defineOptions({ inheritAttrs: false });

const props = defineProps({
  variant: {
    type: String,
    default: 'content',
    validator: (value) => ['content', 'state'].includes(value),
  },
});
</script>

<template>
  <section
    v-bind="$attrs"
    class="app-folder-content-field"
    :class="{
      'app-folder-content-field--state': props.variant === 'state',
    }"
  >
    <slot />
  </section>
</template>

<style scoped>
.app-folder-content-field {
  box-sizing: border-box;
  min-inline-size: 0;
  min-block-size: 0;
  flex: 0 0 auto;
  padding-block-end: var(--ui-folder-section-gap);
  background: var(--ui-folder-content-background);
}

.app-folder-content-field--state {
  min-block-size: var(--ui-folder-content-state-min-block-size);
}
</style>
