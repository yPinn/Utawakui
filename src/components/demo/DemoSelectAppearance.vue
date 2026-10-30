<script setup>
import { reactive } from 'vue';
import UiSelect from '../ui/UiSelect.vue';
import DemoCandidateSelect from './DemoCandidateSelect.vue';
import DemoProposalSpecimen from './DemoProposalSpecimen.vue';
import '../../styles/demoSpecimens.css';

const OPTIONS = [
  { value: 'quick', label: '快速處理' },
  { value: 'general', label: '一般處理' },
  { value: 'benchmark', label: '尚未開放／Unavailable', disabled: true },
];

const WIDTHS = [
  ['narrow', 'Narrow parent · 12rem'],
  ['reference', 'Reference parent · 20rem'],
  ['fluid', 'Fluid parent · 100%'],
];

const CONTENT = [
  {
    key: 'placeholder',
    label: 'Placeholder',
    value: '',
    placeholder: '請選擇輸出裝置',
    options: OPTIONS,
  },
  {
    key: 'long-cjk',
    label: 'Long CJK',
    value: 'cjk',
    options: [
      { value: 'cjk', label: '東京事変／椎名林檎／非常に長い日本語の選択肢' },
      ...OPTIONS,
    ],
  },
  {
    key: 'long-latin',
    label: 'Long Latin',
    value: 'latin',
    options: [
      {
        value: 'latin',
        label:
          'A deliberately long Latin option value for native clipping inspection',
      },
      ...OPTIONS,
    ],
  },
  {
    key: 'multilingual',
    label: 'Multilingual',
    value: 'mixed',
    options: [
      { value: 'mixed', label: '繁體中文／日本語／한국어／English' },
      ...OPTIONS,
    ],
  },
  {
    key: 'number',
    label: 'Number value',
    value: 72,
    options: [
      { value: 72, label: '72 percent' },
      { value: 88, label: '88 percent' },
    ],
  },
];

const STATES = [
  { key: 'default', label: 'Default', value: '', placeholder: '選擇配方' },
  { key: 'filled', label: 'Filled', value: 'general' },
  { key: 'hover', label: 'Hover', value: 'general' },
  { key: 'focus', label: 'Focus-visible', value: 'general' },
  {
    key: 'invalid',
    label: 'Invalid',
    value: '',
    placeholder: '選擇配方',
    invalid: true,
    error: '請選擇可用配方。',
  },
  {
    key: 'required',
    label: 'Required',
    value: '',
    placeholder: '選擇配方',
    required: true,
  },
  { key: 'disabled', label: 'Disabled', value: 'general', disabled: true },
];

const CONTRACT = [
  'Native select · 選單與鍵盤語意由瀏覽器提供',
  'modelValue · update 保留 number 型別',
  'label · hint · error · aria-describedby',
  '寬度由外層版面決定；高度沿用 Field',
];

const values = reactive({
  widths: Object.fromEntries(WIDTHS.map(([key]) => [key, 'general'])),
  content: Object.fromEntries(CONTENT.map((c) => [c.key, c.value])),
  states: Object.fromEntries(STATES.map((s) => [s.key, s.value])),
  hint: 'quick',
  error: '',
  proposal: 'cjk',
});
</script>

<template>
  <div class="demo-specimens" data-select-source="production">
    <p class="demo-specimens__copy">
      原生下拉選擇；必填未填不自動報錯，Hover／Focus 為固定預覽。
    </p>

    <section class="demo-specimens__section">
      <h4>寬度</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="[key, label] in WIDTHS"
          :key="key"
          class="demo-specimens__case"
          :data-select-width="key"
        >
          <h5>{{ label }}</h5>
          <div :class="`demo-select__width--${key}`">
            <UiSelect
              :id="`demo-select-width-${key}`"
              v-model="values.widths[key]"
              label="處理配方"
              :options="OPTIONS"
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
          :data-select-content="content.key"
        >
          <h5>{{ content.label }}</h5>
          <UiSelect
            :id="`demo-select-content-${content.key}`"
            v-model="values.content[content.key]"
            :label="content.label"
            :options="content.options"
            :placeholder="content.placeholder"
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
          :data-select-state="state.key"
        >
          <h5>{{ state.label }}</h5>
          <UiSelect
            :id="`demo-select-state-${state.key}`"
            v-model="values.states[state.key]"
            :label="state.label"
            :options="OPTIONS"
            :placeholder="state.placeholder"
            :invalid="state.invalid"
            :error="state.error"
            :required="state.required"
            :disabled="state.disabled"
          />
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>Hint → Error 與 ARIA</h4>
      <div class="demo-specimens__grid">
        <article class="demo-specimens__case">
          <h5>Hint／valid</h5>
          <UiSelect
            id="demo-select-validation-hint"
            v-model="values.hint"
            label="處理配方"
            hint="一般處理較慢但較完整。"
            aria-describedby="select-external-note"
            name="demo-select-recipe"
            autocomplete="off"
            data-contract="native-forwarding"
            :options="OPTIONS"
          />
        </article>
        <article class="demo-specimens__case">
          <h5>Error／invalid</h5>
          <UiSelect
            id="demo-select-validation-error"
            v-model="values.error"
            label="處理配方"
            hint="一般處理較慢但較完整。"
            error="請選擇可用配方。"
            aria-describedby="select-external-note"
            placeholder="選擇配方"
            required
            :options="OPTIONS"
          />
        </article>
      </div>
    </section>

    <DemoProposalSpecimen
      note="自訂箭頭、placeholder 改淡色、長值靜態省略並在 hover／focus 顯示完整值；選單與操作語意維持原生。"
    >
      <div class="demo-select__width--narrow">
        <DemoCandidateSelect
          id="demo-select-proposal"
          v-model="values.proposal"
          label="提案 · 長值"
          :options="CONTENT[1].options"
        />
      </div>
    </DemoProposalSpecimen>

    <ul class="demo-specimens__contract" aria-label="UiSelect public contract">
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>

<style scoped>
.demo-select__width--narrow {
  width: min(12rem, 100%);
}

.demo-select__width--reference {
  width: min(20rem, 100%);
}

/* Static previews of pointer and keyboard states. */
.demo-specimens__case[data-select-state='hover'] :deep(.ui-select) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-background-hover);
}

.demo-specimens__case[data-select-state='focus'] :deep(.ui-select) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
</style>
