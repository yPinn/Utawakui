<script setup>
defineProps({
  label: { type: String, required: true },
  radius: {
    type: String,
    default: 'md',
    validator: (value) => ['md', 'lg'].includes(value),
  },
  raised: { type: Boolean, default: false },
});
</script>

<template>
  <div
    class="ui-button-group"
    :class="[
      `ui-button-group--radius-${radius}`,
      { 'ui-button-group--raised': raised },
    ]"
    role="group"
    :aria-label="label"
  >
    <slot />
  </div>
</template>

<style scoped>
.ui-button-group {
  min-width: 0;
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  border: var(--ui-border-width) solid var(--ui-button-group-border);
  overflow: hidden;
}

.ui-button-group--radius-md {
  border-radius: var(--ui-radius-md);
}

.ui-button-group--radius-lg {
  border-radius: var(--ui-radius-lg);
}

.ui-button-group--raised {
  background: var(--ui-button-group-bg-raised);
  box-shadow: var(--ui-button-group-shadow-raised);
}

.ui-button-group :deep(.ui-btn) {
  border: 0;
  border-radius: 0;
}

.ui-button-group :deep(.ui-btn:focus-visible) {
  outline-offset: var(--ui-focus-offset-inset);
}

.ui-button-group :deep(.ui-btn + .ui-btn) {
  border-inline-start: var(--ui-border-width) solid
    var(--ui-button-group-border);
}
</style>
