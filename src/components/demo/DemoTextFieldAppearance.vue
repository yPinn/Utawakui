<script setup>
import { reactive } from 'vue';
import UiTextField from '../ui/UiTextField.vue';
import '../../styles/demoSpecimens.css';

const DENSITIES = [
  ['standard', 'Standard · 36 CSS px'],
  ['compact', 'Compact · 32 CSS px'],
];

const WIDTHS = [
  { key: 'narrow', label: '12rem 父容器', value: '窄父容器' },
  { key: 'reference', label: '20rem 父容器', value: '一般父容器' },
  { key: 'fluid', label: '可用寬度', value: '跟隨父層延展' },
];

const CONTENT = [
  {
    key: 'placeholder',
    label: '空白／Placeholder',
    value: '',
    placeholder: '輸入曲目名稱',
  },
  { key: 'short', label: '短字／CJK', value: '雨愛' },
  {
    key: 'long',
    label: '多語長字 · 不換行，原生水平捲動',
    value: 'LOVE YOURSELF 結 Answer／愛をこめて花束を／사랑했지만',
  },
  {
    key: 'maxlength',
    label: 'Maxlength 12',
    value: '演出標題長度限制十二個字',
    maxlength: 12,
  },
  {
    key: 'direction',
    label: 'Direction auto',
    value: 'تعليق تجريبي',
    dir: 'auto',
  },
];

const STATES = [
  { key: 'default', label: 'Default', placeholder: '輸入演出者名稱' },
  { key: 'filled', label: 'Filled', value: '雨愛' },
  { key: 'hover', label: 'Hover', value: 'Pointer hover' },
  { key: 'focus', label: 'Focus-visible', value: 'Keyboard focus' },
  { key: 'invalid', label: 'Invalid', placeholder: '必要欄位', invalid: true },
  { key: 'disabled', label: 'Disabled', value: '由系統管理', disabled: true },
  { key: 'readonly', label: 'Readonly', value: '可選取與複製', readonly: true },
];

const CONTRACT = [
  'modelValue → update:modelValue',
  'placeholder · maxlength · dir · autocomplete · native attrs',
  'label · hint · error · invalid',
  '8px 左右內距；單行 text lane',
  'No size prop · No min／max width token · No slots',
];

const values = reactive({
  density: Object.fromEntries(DENSITIES.map(([key]) => [key, '曲目名稱'])),
  widths: Object.fromEntries(WIDTHS.map((w) => [w.key, w.value])),
  content: Object.fromEntries(CONTENT.map((c) => [c.key, c.value])),
  states: Object.fromEntries(STATES.map((s) => [s.key, s.value ?? ''])),
});
</script>

<template>
  <div class="demo-specimens" data-text-field-source="production">
    <p class="demo-specimens__copy">
      單行輸入，共用欄位標籤、提示與錯誤；唯讀保留選取、複製與鍵盤焦點。
    </p>

    <section class="demo-specimens__section">
      <h4>密度與寬度</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="[key, label] in DENSITIES"
          :key="key"
          class="demo-specimens__case"
          :class="`demo-specimens__density--${key}`"
          :data-text-field-size="key"
        >
          <h5>{{ label }}</h5>
          <UiTextField
            :id="`demo-text-field-size-${key}`"
            v-model="values.density[key]"
            :label="label"
            label-hidden
          />
        </article>
        <article
          v-for="width in WIDTHS"
          :key="width.key"
          class="demo-specimens__case"
          :data-text-field-width="width.key"
        >
          <h5>{{ width.label }}</h5>
          <div :class="`demo-text-field__width--${width.key}`">
            <UiTextField
              :id="`demo-text-field-width-${width.key}`"
              v-model="values.widths[width.key]"
              :label="width.label"
              label-hidden
            />
          </div>
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
          :data-text-field-content="content.key"
        >
          <h5>{{ content.label }}</h5>
          <UiTextField
            :id="`demo-text-field-content-${content.key}`"
            v-model="values.content[content.key]"
            :label="`${content.label}內容檢查`"
            :placeholder="content.placeholder"
            :maxlength="content.maxlength"
            :dir="content.dir"
            label-hidden
          />
        </article>
      </div>
    </section>

    <section class="demo-specimens__section" data-text-field-state-review>
      <h4>狀態</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="state in STATES"
          :key="state.key"
          class="demo-specimens__case"
          :data-text-field-state="state.key"
        >
          <h5>{{ state.label }}</h5>
          <UiTextField
            :id="`demo-text-field-state-${state.key}`"
            v-model="values.states[state.key]"
            :label="`${state.label}狀態檢查`"
            :placeholder="state.placeholder"
            :invalid="state.invalid"
            :disabled="state.disabled"
            :readonly="state.readonly || undefined"
            label-hidden
          />
        </article>
      </div>
    </section>

    <ul
      class="demo-specimens__contract"
      aria-label="UiTextField public contract"
    >
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>

<style scoped>
.demo-text-field__width--narrow {
  width: min(12rem, 100%);
}

.demo-text-field__width--reference {
  width: min(20rem, 100%);
}

/* Static previews of pointer and keyboard states. */
.demo-specimens__case[data-text-field-state='hover'] :deep(.ui-text-field) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-background-hover);
}

.demo-specimens__case[data-text-field-state='focus'] :deep(.ui-text-field) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
</style>
