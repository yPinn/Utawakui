<script setup>
import DemoActionMenuAppearance from './DemoActionMenuAppearance.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoModalAppearance from './DemoModalAppearance.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});

const COMPARISON_SECTION_KEYS = new Set(['context-menu', 'modal']);
</script>

<template>
  <div class="demo-overlays">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
      :reviewed="COMPARISON_SECTION_KEYS.has(section.key)"
    >
      <DemoActionMenuAppearance v-if="section.key === 'context-menu'" />
      <DemoModalAppearance v-else-if="section.key === 'modal'" />
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-overlays {
  display: grid;
  gap: var(--ui-space-6);
}
</style>
