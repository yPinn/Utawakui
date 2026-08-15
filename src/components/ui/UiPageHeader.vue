<script setup>
defineProps({
  title: { type: String, required: true },
});
</script>

<template>
  <div class="ui-page-header">
    <h1 class="ui-page-header__title">{{ title }}</h1>
    <div v-if="$slots.actions" class="ui-page-header__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.ui-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--ui-space-4);
}

/* Headline tier — DESIGN.md names major view titles explicitly. */
.ui-page-header__title {
  margin: 0;
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-heavy);
  line-height: var(--ui-line-height-headline);
  color: var(--ui-color-text);
}

.ui-page-header__actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}
</style>
