<script setup>
import UiProgress from '../ui/UiProgress.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoChipAppearance from './DemoChipAppearance.vue';
import DemoHintAppearance from './DemoHintAppearance.vue';
import DemoNoticeAppearance from './DemoNoticeAppearance.vue';
import DemoStatusIconAppearance from './DemoStatusIconAppearance.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});

const COMPARISON_SECTION_KEYS = new Set([
  'chips',
  'status-icons',
  'hints',
  'notices',
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

      <div v-else-if="section.key === 'progress'" class="demo-sample-grid">
        <UiProgress label="匯入進度" :value="68" :max="100" value-text="68%" />
        <UiProgress label="正在準備音訊模型" indeterminate />
        <UiProgress
          label="批次分析"
          :value="12"
          :max="12"
          value-text="12／12"
        />
      </div>
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-feedback {
  display: grid;
  gap: var(--ui-space-4);
}
</style>
