<script setup>
import { reactive } from 'vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import '../../styles/demoSpecimens.css';

const DENSITIES = [
  ['standard', 'Standard · 36 CSS px'],
  ['compact', 'Compact · 32 CSS px'],
];

const WIDTHS = [
  { key: 'narrow', label: '12rem 父容器', value: '雨愛' },
  { key: 'reference', label: '20rem 父容器', value: '搜尋曲目或演出者' },
  { key: 'fluid', label: '可用寬度', value: '跟隨父層延展' },
];

const STATES = [
  { key: 'default', label: 'Default／空白', placeholder: '搜尋曲目' },
  { key: 'filled', label: 'Filled／可清除', modelValue: '雨愛' },
  { key: 'field-hover', label: 'Field Hover', modelValue: 'Fly Machine' },
  { key: 'input-focus', label: 'Input Focus-visible', modelValue: '鍵盤焦點' },
  { key: 'clear-hover', label: 'Clear Hover', modelValue: 'Hover Clear' },
  { key: 'clear-pressed', label: 'Clear Pressed', modelValue: 'Pressed Clear' },
  {
    key: 'clear-focus',
    label: 'Clear Focus-visible',
    modelValue: 'Focus Clear',
  },
  {
    key: 'disabled',
    label: 'Disabled',
    modelValue: '由系統管理',
    disabled: true,
  },
];

const CONTRACT = [
  'id · label · modelValue · placeholder · disabled → update:modelValue',
  '左右各 32 CSS px icon slot，16-unit glyph 居中，文字區兩側各留 4 CSS px',
  '有內容時才顯示 Clear；原生 cancel 隱藏',
  '寬度預設 100%，由外層版面決定',
  'Fixed anatomy · no slots；標籤隱藏仍可點擊聚焦',
];

// Keyed like the other field specimens so Clear can empty each query.
const layer = { key: 'production' };
const specimenValues = reactive({
  [layer.key]: {
    sizes: Object.fromEntries(DENSITIES.map(([key, label]) => [key, label])),
    widths: Object.fromEntries(WIDTHS.map((w) => [w.key, w.value])),
    states: Object.fromEntries(STATES.map((s) => [s.key, s.modelValue ?? ''])),
  },
});
</script>

<template>
  <div class="demo-specimens" data-search-source="production">
    <p class="demo-specimens__copy">搜尋輸入與清除；結果另行呈現。</p>

    <section class="demo-specimens__section">
      <h4>密度與寬度</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="size in DENSITIES"
          :key="size[0]"
          class="demo-specimens__case"
          :class="`demo-specimens__density--${size[0]}`"
          :data-search-size="size[0]"
        >
          <h5>{{ size[1] }}</h5>
          <UiSearchBox
            :id="`demo-search-size-${size[0]}`"
            v-model="specimenValues[layer.key].sizes[size[0]]"
            :label="`${size[1]} 搜尋高度檢查`"
          />
        </article>
        <article
          v-for="width in WIDTHS"
          :key="width.key"
          class="demo-specimens__case"
          :data-search-width-test="width.key"
        >
          <h5>{{ width.label }}</h5>
          <div :class="`demo-search__width--${width.key}`">
            <UiSearchBox
              :id="`demo-search-width-${width.key}`"
              v-model="specimenValues[layer.key].widths[width.key]"
              :label="`${width.label} 搜尋寬度檢查`"
            />
          </div>
        </article>
      </div>
    </section>

    <section class="demo-specimens__section" data-search-state-review="true">
      <h4>狀態</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="state in STATES"
          :key="state.key"
          class="demo-specimens__case"
          :data-search-state="state.key"
        >
          <h5>{{ state.label }}</h5>
          <UiSearchBox
            :id="`demo-search-state-${state.key}`"
            v-model="specimenValues[layer.key].states[state.key]"
            :label="`${state.label} 搜尋狀態`"
            :placeholder="state.placeholder"
            :disabled="state.disabled"
          />
        </article>
      </div>
    </section>

    <ul
      class="demo-specimens__contract"
      aria-label="UiSearchBox public contract"
    >
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>

<style scoped>
.demo-search__width--narrow {
  width: min(12rem, 100%);
}

.demo-search__width--reference {
  width: min(20rem, 100%);
}

/* Static previews of pointer and keyboard states. */
.demo-specimens__case[data-search-state='field-hover']
  :deep(.ui-search-box__control) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-background-hover);
}

.demo-specimens__case[data-search-state='input-focus']
  :deep(.ui-search-box__control) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-specimens__case[data-search-state='clear-hover']
  :deep(.ui-search-box__clear),
.demo-specimens__case[data-search-state='clear-pressed']
  :deep(.ui-search-box__clear) {
  color: var(--ui-color-text);
}

.demo-specimens__case[data-search-state='clear-hover']
  :deep(.ui-search-box__clear)::before {
  background: var(--ui-color-surface-hover);
}

.demo-specimens__case[data-search-state='clear-pressed']
  :deep(.ui-search-box__clear)::before {
  background: var(--ui-color-surface-active);
}

.demo-specimens__case[data-search-state='clear-focus']
  :deep(.ui-search-box__clear) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
  color: var(--ui-color-text);
}
</style>
