<script setup>
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoCheckboxAppearance from './DemoCheckboxAppearance.vue';
import DemoFieldAppearance from './DemoFieldAppearance.vue';
import DemoFieldReadonlyAppearance from './DemoFieldReadonlyAppearance.vue';
import DemoRangeAppearance from './DemoRangeAppearance.vue';
import DemoSearchBoxAppearance from './DemoSearchBoxAppearance.vue';
import DemoSelectAppearance from './DemoSelectAppearance.vue';
import DemoTextFieldAppearance from './DemoTextFieldAppearance.vue';
import DemoTextareaAppearance from './DemoTextareaAppearance.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});
</script>

<template>
  <div class="demo-inputs">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
      :reviewed="true"
    >
      <DemoSearchBoxAppearance v-if="section.key === 'search-box'" />

      <template v-else-if="section.key === 'field'">
        <DemoFieldAppearance />
        <DemoFieldReadonlyAppearance />
      </template>

      <DemoTextFieldAppearance v-else-if="section.key === 'text-field'" />

      <DemoTextareaAppearance v-else-if="section.key === 'textarea'" />

      <DemoSelectAppearance v-else-if="section.key === 'select'" />

      <DemoCheckboxAppearance v-else-if="section.key === 'checkbox'" />

      <DemoRangeAppearance v-else-if="section.key === 'range'" />
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-inputs {
  display: grid;
  gap: var(--ui-space-4);
}

.demo-inputs :deep([data-demo-review-layer]) {
  min-width: 0;
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}

.demo-inputs :deep([data-demo-review-layer] > header:first-child) {
  display: grid;
  grid-template-columns: minmax(10rem, 14rem) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: baseline;
  padding-block: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
  border-bottom: 0;
}

.demo-inputs :deep([data-demo-review-layer='current']) {
  margin-top: var(--ui-space-2);
}

.demo-inputs :deep([data-demo-review-layer='current'] > header:first-child) {
  padding-top: var(--ui-space-5);
  border-top-color: var(--ui-color-border-strong);
}

.demo-inputs
  :deep(.demo-search-appearance [data-demo-review-layer='candidate']) {
  margin-top: var(--ui-space-5);
}

.demo-inputs :deep(.demo-search-appearance [data-demo-review-layer='current']) {
  margin-top: var(--ui-space-6);
}

@media (max-width: 58rem) {
  .demo-inputs :deep([data-demo-review-layer] > header:first-child) {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>
