<script setup>
import { shallowRef } from 'vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiField from '../ui/UiField.vue';
import UiRange from '../ui/UiRange.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTextarea from '../ui/UiTextarea.vue';
import UiTextField from '../ui/UiTextField.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});

const searchQuery = shallowRef('');
const titleValue = shallowRef('雨愛');
const emptyTitle = shallowRef('');
const noteValue = shallowRef('第二段副歌前保留四拍。');
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
      <div v-if="section.key === 'search-box'" class="demo-search-samples">
        <UiSearchBox
          v-model="searchQuery"
          label="搜尋 UI 元件"
          placeholder="輸入元件或狀態名稱"
        />
        <p class="demo-sample-caption">
          空白、輸入中與一鍵清除共用同一個可存取搜尋合約。
        </p>
      </div>

      <div v-else-if="section.key === 'field'" class="demo-sample-grid">
        <UiField
          id="demo-field-source"
          label="歌詞來源"
          hint="欄位框架管理標籤、提示與描述關係。"
          required
        >
          <template #default="{ controlId, describedBy, invalid }">
            <input
              :id="controlId"
              class="demo-native-control"
              value="本機 sidecar"
              :aria-describedby="describedBy"
              :aria-invalid="invalid || undefined"
              readonly
            />
          </template>
        </UiField>
        <UiField
          id="demo-field-error"
          label="公開輸出名稱"
          error="請輸入可辨識的場景名稱。"
          invalid
        >
          <template #default="{ controlId, describedBy, invalid }">
            <input
              :id="controlId"
              class="demo-native-control"
              :aria-describedby="describedBy"
              :aria-invalid="invalid || undefined"
              value=""
            />
          </template>
        </UiField>
      </div>

      <div v-else-if="section.key === 'text-field'" class="demo-sample-grid">
        <UiTextField
          id="demo-title-populated"
          v-model="titleValue"
          label="曲目名稱"
          hint="已填寫／必要欄位"
          required
        />
        <UiTextField
          id="demo-title-empty"
          v-model="emptyTitle"
          label="演出者"
          placeholder="輸入演出者名稱"
        />
        <UiTextField
          id="demo-title-error"
          label="輸出標題"
          model-value=""
          error="輸出標題不可空白。"
        />
        <UiTextField
          id="demo-title-disabled"
          label="來源識別碼"
          model-value="main-owned-id"
          disabled
        />
      </div>

      <div v-else-if="section.key === 'textarea'" class="demo-sample-grid">
        <UiTextarea
          id="demo-note"
          v-model="noteValue"
          label="演出備註"
          hint="可拖曳控制高度。"
          :rows="4"
        />
        <UiTextarea
          id="demo-note-error"
          label="公開說明"
          model-value=""
          error="請確認公開輸出的文字內容。"
          :rows="4"
        />
        <UiTextarea
          id="demo-note-disabled"
          label="來源備註"
          model-value="由來源自動建立"
          disabled
          :rows="4"
        />
      </div>

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
.demo-search-samples {
  max-width: 28rem;
  display: grid;
  gap: var(--ui-space-2);
}

.demo-native-control {
  width: 100%;
  min-height: var(--ui-field-height);
  padding: var(--ui-field-padding-block) var(--ui-field-padding-inline);
  border: var(--ui-border-width) solid var(--ui-field-border);
  border-radius: var(--ui-field-radius);
  background: var(--ui-field-bg);
  color: var(--ui-field-fg);
  font: inherit;
  font-size: var(--ui-font-size-sm);
}

.demo-native-control:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-native-control[aria-invalid='true'] {
  border-color: var(--ui-field-border-invalid);
}

.demo-checkbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr));
  gap: var(--ui-space-4) var(--ui-space-6);
}
</style>
