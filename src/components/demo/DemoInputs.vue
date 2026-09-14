<script setup>
import { ref } from 'vue';
import UiColorField from '../ui/UiColorField.vue';
import UiRadioGroup from '../ui/UiRadioGroup.vue';
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

const sampleColor = ref('#8296d0');
const sampleTheme = ref('system');
const sampleThemes = [
  { id: 'system', label: '跟隨系統' },
  { id: 'dark', label: '深色', description: '固定使用深色控制面板。' },
  { id: 'light', label: '淺色', description: '固定使用淺色控制面板。' },
];
</script>

<template>
  <div class="demo-inputs">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
      :reviewed="section.reviewed !== false"
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

      <div
        v-else-if="section.key === 'color-field'"
        class="demo-color-field-sample"
      >
        <UiColorField
          id="demo-color-field-value"
          v-model="sampleColor"
          label="主題色"
          hint="輸入六位 hex，或使用系統色彩選擇器。"
        />
        <p class="demo-sample-caption">
          目前值：{{ sampleColor }}。模板相容性與設定持久化仍由 feature caller
          負責。
        </p>
      </div>

      <div v-else-if="section.key === 'radio-group'" class="demo-radio-sample">
        <UiRadioGroup
          v-model="sampleTheme"
          name="demo-theme-mode"
          legend="控制面板外觀"
          :items="sampleThemes"
        />
        <p class="demo-sample-caption">
          Native radio保留form與Arrow語意；外觀設定的持久化由feature
          caller負責。
        </p>
      </div>
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-inputs {
  display: grid;
  gap: var(--ui-space-4);
}

.demo-color-field-sample {
  width: min(24rem, 100%);
  display: grid;
  gap: var(--ui-space-3);
}

.demo-radio-sample {
  width: min(28rem, 100%);
  display: grid;
  gap: var(--ui-space-3);
}
</style>
