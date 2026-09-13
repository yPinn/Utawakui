<script setup>
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoCollageThumbAppearance from './DemoCollageThumbAppearance.vue';
import DemoMarqueeTextAppearance from './DemoMarqueeTextAppearance.vue';
import DemoTrackRowAppearance from './DemoTrackRowAppearance.vue';
import DemoTrackThumbAppearance from './DemoTrackThumbAppearance.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});

const COMPARISON_SECTION_KEYS = new Set([
  'marquee-text',
  'track-thumb',
  'collage-thumb',
  'track-rows',
]);
</script>

<template>
  <div class="demo-content">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
      :reviewed="COMPARISON_SECTION_KEYS.has(section.key)"
    >
      <DemoMarqueeTextAppearance v-if="section.key === 'marquee-text'" />
      <DemoTrackThumbAppearance v-else-if="section.key === 'track-thumb'" />
      <DemoCollageThumbAppearance v-else-if="section.key === 'collage-thumb'" />
      <DemoTrackRowAppearance v-else-if="section.key === 'track-rows'" />
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-content {
  display: grid;
  gap: var(--ui-space-1);
}
</style>
