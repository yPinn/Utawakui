<script setup>
import { reactive } from 'vue';
import UiTextField from '../ui/UiTextField.vue';
import DemoFieldValidationFeedback from './DemoFieldValidationFeedback.vue';
import '../../styles/demoSpecimens.css';

const STATES = [
  { key: 'default', label: '預設／空白', placeholder: '輸入曲目名稱' },
  {
    key: 'filled',
    label: '已填／提示／必填',
    modelValue: '雨愛',
    hint: '使用本機曲目的顯示名稱。',
    required: true,
  },
  { key: 'hover', label: 'Hover', modelValue: '自動重現 Hover 外觀' },
  { key: 'focus', label: 'Focus-visible', modelValue: '鍵盤焦點' },
  {
    key: 'invalid',
    label: 'Invalid',
    error: '請輸入曲目名稱。',
    required: true,
  },
  {
    key: 'disabled',
    label: 'Disabled',
    modelValue: '由系統管理',
    disabled: true,
  },
  {
    key: 'readonly',
    label: 'Readonly',
    modelValue: '可選取但不可編輯',
    readonly: true,
  },
];

const VALUES = [
  ['高度', 'Standard 2.25rem／36 CSS px · Compact 2rem／32 CSS px'],
  ['內距', 'Block 0.25rem／4 CSS px · Inline 0.5rem／8 CSS px'],
  ['圓角', '0.375rem／6 CSS px'],
  ['邊界', '1 CSS px · Hover 提升為 strong border'],
  ['Focus', '2 CSS px＋2 CSS px offset'],
  ['Disabled', '50% · 原生 disabled'],
  ['Placeholder', 'Dark 5.69:1 · Light 7.37:1 · AA'],
];

const values = reactive(
  Object.fromEntries(STATES.map((s) => [s.key, s.modelValue ?? ''])),
);
</script>

<template>
  <div class="demo-specimens" data-field-source="production">
    <p class="demo-specimens__copy">
      UiField
      擁有標籤、提示與錯誤的排列與關聯；各輸入元件的尺寸與內容另見各自段落。
    </p>

    <section class="demo-specimens__section">
      <h4>欄位狀態</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="state in STATES"
          :key="state.key"
          class="demo-specimens__case"
          :data-field-state="state.key"
        >
          <h5>{{ state.label }}</h5>
          <UiTextField
            :id="`demo-field-state-${state.key}`"
            v-model="values[state.key]"
            label="曲目名稱"
            :placeholder="state.placeholder"
            :hint="state.hint"
            :error="state.error"
            :required="state.required"
            :disabled="state.disabled"
            :readonly="state.readonly || undefined"
          />
        </article>
      </div>
    </section>

    <DemoFieldValidationFeedback />

    <section class="demo-specimens__section">
      <h4>共用數值</h4>
      <dl class="demo-field__values">
        <div v-for="[name, value] in VALUES" :key="name">
          <dt>{{ name }}</dt>
          <dd>{{ value }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.demo-field__values {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
  gap: var(--ui-space-2) var(--ui-space-4);
}

.demo-field__values dt {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}

.demo-field__values dd {
  margin: 0;
}

/* Static previews of pointer and keyboard states. */
.demo-specimens__case[data-field-state='hover'] :deep(.ui-text-field) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-background-hover);
}

.demo-specimens__case[data-field-state='focus'] :deep(.ui-text-field) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
</style>
