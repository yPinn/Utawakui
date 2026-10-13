<script setup>
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoCollageThumbAppearance from './DemoCollageThumbAppearance.vue';
import DemoMarqueeTextAppearance from './DemoMarqueeTextAppearance.vue';
import DemoPhotoFramePrimitive from './DemoPhotoFramePrimitive.vue';
import DemoTrackRowAppearance from './DemoTrackRowAppearance.vue';
import DemoTrackThumbAppearance from './DemoTrackThumbAppearance.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});
</script>

<template>
  <div class="demo-content">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
    >
      <DemoMarqueeTextAppearance v-if="section.key === 'marquee-text'" />
      <DemoTrackThumbAppearance v-else-if="section.key === 'track-thumb'" />
      <DemoCollageThumbAppearance v-else-if="section.key === 'collage-thumb'" />
      <DemoPhotoFramePrimitive v-else-if="section.key === 'photo-frame'" />
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
