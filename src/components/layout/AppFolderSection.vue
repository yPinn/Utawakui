<script setup>
import { useId } from 'vue';

const props = defineProps({
  title: { type: String, required: true },
  titleLang: { type: String, default: undefined },
  // Short trailing context such as a count; hidden when empty.
  meta: { type: String, default: '' },
  // Document outline level; the look does not change with it.
  headingLevel: {
    type: Number,
    default: 2,
    validator: (value) => [2, 3, 4].includes(value),
  },
});

const titleId = `app-folder-section-${useId()}`;
</script>

<template>
  <section class="app-folder-section" :aria-labelledby="titleId">
    <header class="app-folder-section__heading">
      <component
        :is="`h${props.headingLevel}`"
        :id="titleId"
        class="app-folder-section__title"
        :lang="titleLang"
      >
        {{ title }}
      </component>
      <span v-if="meta" class="app-folder-section__meta">{{ meta }}</span>
      <span v-if="$slots.actions" class="app-folder-section__actions">
        <slot name="actions" />
      </span>
    </header>
    <slot />
  </section>
</template>

<style scoped>
.app-folder-section {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-folder-section-gap);
}

.app-folder-section__heading {
  min-inline-size: 0;
  display: flex;
  align-items: baseline;
  gap: var(--ui-folder-heading-gap) var(--ui-space-3);
  padding-block-end: var(--ui-space-2);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border-strong);
}

.app-folder-section__title {
  min-inline-size: 0;
  margin: 0;
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-display);
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-bold);
  line-height: var(--ui-line-height-heading);
  overflow-wrap: anywhere;
}

.app-folder-section__meta {
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-utility);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
  line-height: var(--ui-line-height-label);
}

.app-folder-section__actions {
  margin-inline-start: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
}
</style>
