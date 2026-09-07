<script setup>
import { shallowRef } from 'vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiRange from '../ui/UiRange.vue';
import UiSelect from '../ui/UiSelect.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoFieldAppearance from './DemoFieldAppearance.vue';
import DemoSearchBoxAppearance from './DemoSearchBoxAppearance.vue';
import DemoTextFieldAppearance from './DemoTextFieldAppearance.vue';
import DemoTextareaAppearance from './DemoTextareaAppearance.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});

const recipe = shallowRef('general');
const includeGuideVocal = shallowRef(true);
const disabledOption = shallowRef(false);
const volume = shallowRef(72);

const RECIPE_OPTIONS = [
  { value: 'quick', label: '快速處理' },
  { value: 'general', label: '一般處理' },
  { value: 'benchmark', label: '尚未開放', disabled: true },
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
    >
      <DemoSearchBoxAppearance v-if="section.key === 'search-box'" />

      <DemoFieldAppearance v-else-if="section.key === 'field'" />

      <DemoTextFieldAppearance v-else-if="section.key === 'text-field'" />

      <DemoTextareaAppearance v-else-if="section.key === 'textarea'" />

      <div v-else-if="section.key === 'select'" class="demo-sample-grid">
        <UiSelect
          id="demo-recipe"
          v-model="recipe"
          label="分離配方"
          :options="RECIPE_OPTIONS"
          hint="選項可個別停用。"
        />
        <UiSelect
          id="demo-recipe-empty"
          label="輸出裝置"
          model-value=""
          :options="RECIPE_OPTIONS"
          placeholder="選擇裝置"
        />
        <UiSelect
          id="demo-recipe-disabled"
          label="鎖定設定"
          model-value="general"
          :options="RECIPE_OPTIONS"
          disabled
        />
      </div>

      <div v-else-if="section.key === 'checkbox'" class="demo-checkbox-grid">
        <UiCheckbox
          id="demo-guide-vocal"
          v-model="includeGuideVocal"
          label="包含導唱聲道"
          hint="已勾選"
        />
        <UiCheckbox
          id="demo-empty-checkbox"
          v-model="disabledOption"
          label="自動切換下一首"
          hint="未勾選"
        />
        <UiCheckbox
          id="demo-invalid-checkbox"
          label="確認本次輸出權利"
          error="啟用公開輸出前需要確認。"
          required
        />
        <UiCheckbox
          id="demo-disabled-checkbox"
          label="由系統管理"
          model-value
          disabled
        />
      </div>

      <div v-else-if="section.key === 'range'" class="demo-sample-grid">
        <UiRange
          id="demo-volume"
          v-model="volume"
          label="音量"
          :min="0"
          :max="100"
          :value-text="`${volume}%`"
        />
        <UiRange
          id="demo-tempo"
          label="速度"
          :model-value="100"
          :min="50"
          :max="150"
          value-text="100%"
          hint="預設值"
        />
        <UiRange
          id="demo-disabled-range"
          label="音高"
          :model-value="0"
          :min="-12"
          :max="12"
          value-text="0"
          disabled
        />
      </div>
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-checkbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr));
  gap: var(--ui-space-4) var(--ui-space-6);
}
</style>
