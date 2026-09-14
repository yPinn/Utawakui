<script setup>
import { ref } from 'vue';
import UiColorField from '../ui/UiColorField.vue';
import UiCombobox from '../ui/UiCombobox.vue';
import UiRadioGroup from '../ui/UiRadioGroup.vue';
import UiSwitch from '../ui/UiSwitch.vue';
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
const sampleAutoUpdate = ref(true);
const sampleLyricsSource = ref('netease');
const sampleLyricsSources = [
  { value: 'lrclib', label: 'LRCLIB' },
  { value: 'netease', label: 'NetEase' },
  { value: 'musixmatch', label: 'Musixmatch（reserve）', disabled: true },
  { value: 'better-lyrics', label: 'Better Lyrics' },
];
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

      <div v-else-if="section.key === 'combobox'" class="demo-combobox-sample">
        <UiCombobox
          id="demo-combobox-lyrics-source"
          v-model="sampleLyricsSource"
          label="歌詞來源"
          placeholder="輸入以過濾來源"
          :items="sampleLyricsSources"
        />
        <p class="demo-sample-caption">
          從既有清單打字過濾並選一個值；不支援自由輸入新值，也不做非同步搜尋。
        </p>
      </div>

      <DemoCheckboxAppearance v-else-if="section.key === 'checkbox'" />

      <div v-else-if="section.key === 'switch'" class="demo-switch-sample">
        <UiSwitch
          id="demo-switch-auto-update"
          v-model="sampleAutoUpdate"
          label="自動更新"
          hint="關閉時可在設定裡手動檢查更新。"
        />
        <p class="demo-sample-caption">
          即時生效的布林設定；勾選方塊語意的表單提交值仍使用 UiCheckbox。
        </p>
      </div>

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

.demo-radio-sample,
.demo-switch-sample,
.demo-combobox-sample {
  width: min(28rem, 100%);
  display: grid;
  gap: var(--ui-space-3);
}
</style>
