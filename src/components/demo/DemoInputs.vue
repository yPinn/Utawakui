<script setup>
import { ref } from 'vue';
import UiColorField from '../ui/UiColorField.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoProductionSample from './DemoProductionSample.vue';
import DemoRadioGroupAppearance from './DemoRadioGroupAppearance.vue';
import DemoSwitchAppearance from './DemoSwitchAppearance.vue';
import DemoComboboxAppearance from './DemoComboboxAppearance.vue';
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
</script>

<template>
  <div class="demo-inputs">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
    >
      <DemoProductionSample
        v-if="section.key === 'select'"
        :kind="section.key"
      />

      <DemoSearchBoxAppearance v-if="section.key === 'search-box'" />

      <template v-else-if="section.key === 'field'">
        <DemoFieldAppearance />
        <DemoFieldReadonlyAppearance />
      </template>

      <DemoTextFieldAppearance v-else-if="section.key === 'text-field'" />

      <DemoTextareaAppearance v-else-if="section.key === 'textarea'" />

      <DemoSelectAppearance v-else-if="section.key === 'select'" />

      <DemoComboboxAppearance v-else-if="section.key === 'combobox'" />

      <DemoCheckboxAppearance v-else-if="section.key === 'checkbox'" />

      <DemoSwitchAppearance v-else-if="section.key === 'switch'" />

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
          目前值：{{ sampleColor }}，僅供本頁預覽。
        </p>
      </div>

      <DemoRadioGroupAppearance v-else-if="section.key === 'radio-group'" />
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
</style>
