<script setup>
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoTabsAppearance from './DemoTabsAppearance.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});
</script>

<template>
  <div class="demo-navigation">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
      :reviewed="true"
    >
      <DemoTabsAppearance v-if="section.key === 'tabs'" />
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-navigation {
  display: grid;
  gap: var(--ui-space-4);
}
</style>
