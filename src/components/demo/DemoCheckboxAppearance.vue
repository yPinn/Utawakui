<script setup>
import { reactive } from 'vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import '../../styles/demoSpecimens.css';

const DENSITIES = [
  ['standard', 'Standard target · 36 CSS px'],
  ['compact', 'Compact target · 32 CSS px'],
];

const CONTENT = [
  { key: 'short', label: 'Short label', value: true, text: '包含導唱聲道' },
  {
    key: 'long-cjk',
    label: 'Long CJK',
    text: '演出開始後自動切換到下一首並保留目前播放狀態與導唱設定',
  },
  {
    key: 'long-latin',
    label: 'Long Latin',
    value: true,
    text: 'Automatically advance to the next performance item while preserving the current guide-vocal setting',
  },
  {
    key: 'multilingual',
    label: 'Multilingual',
    text: '顯示繁體中文／日本語／한국어／English 的歌詞來源資訊',
  },
];

const STATES = [
  { key: 'unchecked', label: 'Unchecked' },
  { key: 'checked', label: 'Checked', value: true },
  { key: 'indeterminate', label: 'Indeterminate', indeterminate: true },
  { key: 'hover', label: 'Hover' },
  { key: 'focus', label: 'Focus-visible', value: true },
  {
    key: 'invalid',
    label: 'Invalid',
    invalid: true,
    required: true,
    error: '啟用公開輸出前需要確認。',
  },
  { key: 'required', label: 'Required pristine', required: true },
  { key: 'disabled', label: 'Disabled', value: true, disabled: true },
];

const CONTRACT = [
  'Visual indicator · 16 CSS px',
  'Target · full label row',
  'Width · content／parent-owned',
  'indeterminate · caller-owned · clear on selection',
  'No readonly prop · No size prop',
];

const values = reactive({
  density: Object.fromEntries(DENSITIES.map(([key]) => [key, false])),
  content: Object.fromEntries(CONTENT.map((c) => [c.key, Boolean(c.value)])),
  states: Object.fromEntries(STATES.map((s) => [s.key, Boolean(s.value)])),
  mixed: true,
  hint: false,
  error: false,
});
</script>

<template>
  <div class="demo-specimens" data-checkbox-source="production">
    <p class="demo-specimens__copy">
      勾選與部分選取，整列可點擊；標籤完整換行，無唯讀狀態。
    </p>

    <section class="demo-specimens__section">
      <h4>密度與 target</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="[key, label] in DENSITIES"
          :key="key"
          class="demo-specimens__case"
          :class="`demo-specimens__density--${key}`"
          :data-checkbox-size="key"
        >
          <h5>{{ label }}</h5>
          <UiCheckbox
            :id="`demo-checkbox-size-${key}`"
            v-model="values.density[key]"
            :label="`${label} 切換`"
          />
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>內容與換行</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="content in CONTENT"
          :key="content.key"
          class="demo-specimens__case"
          :data-checkbox-content="content.key"
        >
          <h5>{{ content.label }}</h5>
          <UiCheckbox
            :id="`demo-checkbox-content-${content.key}`"
            v-model="values.content[content.key]"
            :label="content.text"
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
          :data-checkbox-state="state.key"
        >
          <h5>{{ state.label }}</h5>
          <UiCheckbox
            :id="`demo-checkbox-state-${state.key}`"
            v-model="values.states[state.key]"
            :label="state.label"
            :indeterminate="state.indeterminate && values.mixed"
            :invalid="state.invalid"
            :error="state.error"
            :required="state.required"
            :disabled="state.disabled"
            @update:model-value="state.indeterminate && (values.mixed = false)"
          />
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>Hint → Error 與 ARIA</h4>
      <p class="demo-specimens__copy">錯誤訊息取代提示，保留其他描述關聯。</p>
      <div class="demo-specimens__grid">
        <article class="demo-specimens__case">
          <h5>Hint／valid</h5>
          <UiCheckbox
            id="demo-checkbox-validation-hint"
            v-model="values.hint"
            label="允許公開顯示曲目資訊"
            hint="只顯示曲名與演出狀態。"
            aria-describedby="checkbox-external-note"
            name="demo-checkbox-consent"
            value="accepted"
            data-contract="native-forwarding"
          />
        </article>
        <article class="demo-specimens__case">
          <h5>Error／invalid</h5>
          <UiCheckbox
            id="demo-checkbox-validation-error"
            v-model="values.error"
            label="確認本次輸出權利"
            hint="啟用公開輸出前確認。"
            error="請先確認本次輸出權利。"
            aria-describedby="checkbox-external-note"
            required
          />
        </article>
      </div>
    </section>

    <ul
      class="demo-specimens__contract"
      aria-label="UiCheckbox public contract"
    >
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>

<style scoped>
/* Static previews of pointer and keyboard states. */
.demo-specimens__case[data-checkbox-state='hover']
  :deep(
    .ui-checkbox__native:where(:not(:checked):not([aria-checked='mixed']))
      + .ui-checkbox__indicator
  ) {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-surface-hover);
}

.demo-specimens__case[data-checkbox-state='focus']
  :deep(.ui-checkbox__indicator) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
</style>
