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
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.ui-page-header__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
  align-items: center;
  justify-content: space-between;
}

/* Headline tier — DESIGN.md names major view titles explicitly. */
.ui-page-header__title {
  min-width: 0;
  overflow-wrap: anywhere;
  margin: 0;
  font-size: var(--ui-type-heading-size);
  font-weight: var(--ui-type-heading-weight);
  line-height: var(--ui-type-heading-line-height);
  color: var(--ui-color-text);
}

.ui-page-header__actions {
  display: flex;
  flex-wrap: wrap;
  max-width: 100%;
  align-items: center;
  gap: var(--ui-space-2);
}

.ui-page-header__description {
  margin: 0;
  max-width: 70ch;
  overflow-wrap: anywhere;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}
</style>
