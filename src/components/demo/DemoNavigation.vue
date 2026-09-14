<script setup>
import { ref } from 'vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoTabsAppearance from './DemoTabsAppearance.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});

const sampleMode = ref('quick');
const disclosureOpen = ref(false);
const sampleModes = [
  { id: 'quick', label: '快速' },
  { id: 'general', label: '一般' },
  { id: 'unavailable', label: '尚未提供', disabled: true },
];
</script>

<template>
  <div class="demo-navigation">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
      :reviewed="section.reviewed !== false"
    >
      <DemoTabsAppearance v-if="section.key === 'tabs'" />

      <div
        v-else-if="section.key === 'segmented-control'"
        class="demo-segmented-sample"
      >
        <UiSegmentedControl
          v-model="sampleMode"
          :items="sampleModes"
          aria-label="分析模式"
        />
        <p class="demo-sample-caption">
          單選語意與 roving focus 由元件負責；filter、mode 與 persistence 仍由
          caller 負責。
        </p>
      </div>

      <div
        v-else-if="section.key === 'disclosure'"
        class="demo-disclosure-sample"
      >
        <UiDisclosure v-model:open="disclosureOpen" label="來源證據">
          這裡放caller-owned內容；使用者資料與說明文字仍可選取。
        </UiDisclosure>
        <p class="demo-sample-caption">
          Native details擁有展開語意；不把summary包成第二個Icon Button。
        </p>
      </div>
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-navigation {
  display: grid;
  gap: var(--ui-space-4);
}

.demo-segmented-sample {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
}

.demo-disclosure-sample {
  width: min(36rem, 100%);
  display: grid;
  gap: var(--ui-space-3);
}
</style>
