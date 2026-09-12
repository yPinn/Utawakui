<script setup>
import DemoButtonAppearance from './DemoButtonAppearance.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoIconButtonAppearance from './DemoIconButtonAppearance.vue';
import DemoTextButtonAppearance from './DemoTextButtonAppearance.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});
</script>

<template>
  <div class="demo-actions">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
      :reviewed="true"
    >
      <DemoButtonAppearance v-if="section.key === 'buttons'" />

      <DemoIconButtonAppearance v-else-if="section.key === 'icon-buttons'" />

      <DemoTextButtonAppearance v-else-if="section.key === 'text-button'" />
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-actions {
  display: grid;
  gap: var(--ui-space-4);
}
</style>
