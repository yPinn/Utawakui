<script setup>
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoChipAppearance from './DemoChipAppearance.vue';
import DemoHintAppearance from './DemoHintAppearance.vue';
import DemoNoticeAppearance from './DemoNoticeAppearance.vue';
import DemoProgressAppearance from './DemoProgressAppearance.vue';
import DemoStatusIconAppearance from './DemoStatusIconAppearance.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});

const COMPARISON_SECTION_KEYS = new Set([
  'chips',
  'status-icons',
  'hints',
  'notices',
  'progress',
]);
</script>

<template>
  <div class="demo-feedback">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
      :reviewed="COMPARISON_SECTION_KEYS.has(section.key)"
    >
      <DemoChipAppearance v-if="section.key === 'chips'" />

      <DemoStatusIconAppearance v-else-if="section.key === 'status-icons'" />

      <DemoHintAppearance v-else-if="section.key === 'hints'" />

      <DemoNoticeAppearance v-else-if="section.key === 'notices'" />

      <DemoProgressAppearance v-else-if="section.key === 'progress'" />
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-feedback {
  display: grid;
  gap: var(--ui-space-4);
}
</style>
