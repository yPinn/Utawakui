<script setup>
import { reactive } from 'vue';
import UiTextarea from '../ui/UiTextarea.vue';
import '../../styles/demoSpecimens.css';

const HEIGHTS = [
  ['standard-floor', 2, 'Standard hard floor · 2 rows · 72 CSS px'],
  ['compact-floor', 2, 'Compact hard floor · 2 rows · 64 CSS px'],
  ['default', 3, 'Default rows · 3'],
  ['rows-5', 5, 'Rows 5'],
];

const CONTENT = [
  {
    key: 'placeholder',
    label: '空白／Placeholder',
    value: '',
    placeholder: '輸入演出備註',
  },
  {
    key: 'line-breaks',
    label: '顯式換行',
    value: '第一段結束後停四拍\n第二段由副歌進入',
  },
  {
    key: 'wrap',
    label: '多語長句 · 自動換行',
    value:
      'LOVE YOURSELF 結 Answer／愛をこめて花束を／사랑했지만，長內容在可用寬度內自然換行。',
  },
  {
    key: 'maxlength',
    label: 'Maxlength 24',
    value: '公開輸出的文字長度限制為二十四個字元',
    maxlength: 24,
  },
  {
    key: 'direction',
    label: 'Direction auto',
    value: 'ملاحظة أداء متعددة الأسطر',
    dir: 'auto',
  },
];

const STATES = [
  { key: 'default', label: 'Default', placeholder: '輸入公開說明' },
  {
    key: 'filled',
    label: 'Filled',
    value: '第二段副歌前保留四拍。\n結尾等待燈號。',
  },
  { key: 'hover', label: 'Hover', value: 'Pointer hover\n保留可編輯狀態' },
  { key: 'focus', label: 'Focus-visible', value: 'Keyboard focus\n顯示外框' },
  { key: 'invalid', label: 'Invalid', placeholder: '必要欄位', invalid: true },
  {
    key: 'disabled',
    label: 'Disabled',
    value: '由系統管理\n禁止編輯與選取',
    disabled: true,
  },
  {
    key: 'readonly',
    label: 'Readonly',
    value: '可選取與複製\nQuiet surface',
    readonly: true,
  },
];

const CONTRACT = [
  'modelValue → update:modelValue；保留 newline',
  'rows · 內容容量；最小高度為 2 rows',
  'placeholder · maxlength · dir · native attrs',
  'label · hint · error · invalid',
  '寬度由外層版面決定',
];

const values = reactive({
  heights: Object.fromEntries(HEIGHTS.map(([key]) => [key, '演出備註'])),
  content: Object.fromEntries(CONTENT.map((c) => [c.key, c.value])),
  states: Object.fromEntries(STATES.map((s) => [s.key, s.value ?? ''])),
});
</script>

<template>
  <div class="demo-specimens" data-textarea-source="production">
    <p class="demo-specimens__copy">
      多行輸入，共用欄位標籤、提示與錯誤；唯讀保留選取、複製與鍵盤焦點。
    </p>

    <section class="demo-specimens__section">
      <h4>高度與 rows</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="[key, rows, label] in HEIGHTS"
          :key="key"
          class="demo-specimens__case"
          :class="{
            'demo-specimens__density--compact': key === 'compact-floor',
          }"
          :data-textarea-height-case="key"
          :data-textarea-rows="rows"
        >
          <h5>{{ label }}</h5>
          <UiTextarea
            :id="`demo-textarea-height-${key}`"
            v-model="values.heights[key]"
            :label="`${label}高度檢查`"
            :rows="rows"
            label-hidden
          />
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>內容</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="content in CONTENT"
          :key="content.key"
          class="demo-specimens__case"
          :data-textarea-content="content.key"
        >
          <h5>{{ content.label }}</h5>
          <UiTextarea
            :id="`demo-textarea-content-${content.key}`"
            v-model="values.content[content.key]"
            :label="`${content.label}內容檢查`"
            :placeholder="content.placeholder"
            :maxlength="content.maxlength"
            :dir="content.dir"
            :rows="3"
            label-hidden
          />
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>狀態</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="state in STATES"
          :key="state.key"
          class="demo-specimens__case"
          :data-textarea-state="state.key"
        >
          <h5>{{ state.label }}</h5>
          <UiTextarea
            :id="`demo-textarea-state-${state.key}`"
            v-model="values.states[state.key]"
            :label="`${state.label}狀態檢查`"
            :placeholder="state.placeholder"
            :invalid="state.invalid"
            :disabled="state.disabled"
            :readonly="state.readonly || undefined"
            :rows="2"
            label-hidden
          />
        </article>
      </div>
    </section>

    <ul
      class="demo-specimens__contract"
      aria-label="UiTextarea public contract"
    >
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>

<style scoped>
/* Static previews of pointer and keyboard states. */
.demo-specimens__case[data-textarea-state='hover'] :deep(.ui-textarea) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-background-hover);
}

.demo-specimens__case[data-textarea-state='focus'] :deep(.ui-textarea) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
</style>
