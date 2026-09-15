<script setup>
defineProps({
  title: { type: String, required: true },
  // Lets a caller-owned `aria-labelledby` keep pointing at this h1 after
  // adopting UiPageHeader (e.g. a section wrapper authored before this
  // component existed).
  titleId: { type: String, default: undefined },
});
</script>

<template>
  <div class="ui-page-header">
    <div class="ui-page-header__row">
      <h1 :id="titleId" class="ui-page-header__title">{{ title }}</h1>
      <div v-if="$slots.actions" class="ui-page-header__actions">
        <slot name="actions" />
      </div>
    </div>
    <p v-if="$slots.description" class="ui-page-header__description">
      <slot name="description" />
    </p>
  </div>
</template>

<style scoped>
.ui-page-header {
  display: flex;
  flex-direction: column;
  margin-bottom: var(--ui-space-4);
}

.ui-page-header__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* Headline tier — DESIGN.md names major view titles explicitly. */
.ui-page-header__title {
  margin: 0;
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-bold);
  line-height: var(--ui-line-height-heading);
  color: var(--ui-color-text);
}

.ui-page-header__actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.ui-page-header__description {
  margin: var(--ui-space-1) 0 0;
  max-width: 70ch;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}
</style>
