<script setup>
import DemoFieldValidationFeedback from './DemoFieldValidationFeedback.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiTextField from '../ui/UiTextField.vue';

const FIELD_WIDTH_TESTS = [
  {
    key: 'narrow',
    label: '12rem 檢查槽 · 非元件 token',
    value: '窄父容器',
  },
  {
    key: 'reference',
    label: '20rem 檢查槽 · 非元件 token',
    value: '一般父容器',
  },
  {
    key: 'fluid',
    label: '可用寬度檢查槽',
    value: '跟隨父層延展',
  },
];

const COVERAGE_COLUMNS = [
  ['surface', 'Surface'],
  ['boundary', 'Boundary'],
  ['content', 'Content'],
  ['feedback', 'Feedback'],
  ['semantics', 'Semantics'],
];

const FIELD_STATES = [
  {
    key: 'default',
    label: '預設／空白',
    placeholder: '輸入曲目名稱',
    coverage: [
      ['base', 'Base'],
      ['base', 'Base border'],
      ['base', 'Placeholder'],
      ['base', '—'],
      ['base', 'Editable'],
    ],
  },
  {
    key: 'filled',
    label: '已填／提示',
    modelValue: '雨愛',
    hint: '使用本機曲目的顯示名稱。',
    required: true,
    coverage: [
      ['base', 'Base'],
      ['base', 'Base border'],
      ['base', 'Value'],
      ['base', 'Hint'],
      ['base', 'Required'],
    ],
  },
  {
    key: 'hover',
    label: 'Hover',
    modelValue: '自動重現 Hover 外觀',
    coverage: [
      ['complete', 'Hover surface'],
      ['complete', 'Strong border'],
      ['base', 'Value'],
      ['base', '—'],
      ['complete', ':hover'],
    ],
  },
  {
    key: 'focus',
    label: 'Focus-visible',
    modelValue: '鍵盤焦點',
    coverage: [
      ['base', 'Base'],
      ['complete', '2px＋2px ring'],
      ['base', 'Value'],
      ['complete', 'Focus cue'],
      ['complete', ':focus-visible'],
    ],
  },
  {
    key: 'invalid',
    label: 'Invalid',
    error: '請輸入曲目名稱。',
    required: true,
    coverage: [
      ['base', 'Base'],
      ['complete', 'Danger border'],
      ['base', 'Placeholder'],
      ['complete', 'Error text'],
      ['complete', 'ARIA＋alert'],
    ],
  },
  {
    key: 'disabled',
    label: 'Disabled',
    modelValue: '由系統管理',
    disabled: true,
    coverage: [
      ['base', 'Base'],
      ['base', 'Base border'],
      ['complete', 'Value · 50%'],
      ['complete', 'Not-allowed'],
      ['complete', 'Disabled'],
    ],
  },
  {
    key: 'readonly',
    label: 'Readonly',
    modelValue: '可選取但不可編輯',
    readonly: true,
    coverage: [
      ['complete', 'Quiet surface'],
      ['base', 'Base border'],
      ['base', 'Value'],
      ['complete', '可選取／複製'],
      ['complete', 'Readonly'],
    ],
  },
];

const FIELD_LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 候選外觀',
    note: '尚未套用正式元件；本區由 F8 的 Token v2 scope 驅動。',
    labelSelection: ['complete', 'Select none'],
    disabledFeedback: ['complete', 'Not-allowed · Select none'],
    readonlySurface: ['complete', 'Quiet surface'],
    pendingNote: 'Readonly 使用 quiet surface · 保留文字選取、複製與 focus',
    sizes: [
      ['standard', 'Standard', '36 CSS px'],
      ['compact', 'Compact', '32 CSS px'],
    ],
    values: [
      ['高度', 'Standard 2.25rem／36 CSS px', 'Compact 2rem／32 CSS px'],
      ['內距', 'Block 0.25rem／4 CSS px', 'Inline 0.5rem／8 CSS px'],
      ['圓角', '0.375rem／6 CSS px', '一般操作矩形'],
      ['邊界', '1 CSS px', 'Hover 提升為 strong border'],
      ['Focus', '2 CSS px＋2 CSS px offset', 'Indigo 外框'],
      ['Disabled', '50%', '原生 disabled · Select none'],
      ['Placeholder', 'Dark 5.69:1', 'Light 7.37:1 · AA'],
    ],
  },
  {
    key: 'current',
    title: '現行 Field 外觀',
    note: '以 active token 快照呈現，避免繼承 F8 候選配色。',
    labelSelection: ['pending', '可選取（待補）'],
    disabledFeedback: ['pending', 'Not-allowed · 可選取（待補）'],
    readonlySurface: ['base', 'Same as editable'],
    pendingNote:
      'Readonly 與 Editable 同表面 · Label／Disabled Select none 尚未套用',
    sizes: [['active', 'Active default', '30 CSS px']],
    values: [
      ['高度', '1.875rem／30 CSS px', '無 Compact 映射'],
      ['內距', 'Block 0.25rem／4 CSS px', 'Inline 0.5rem／8 CSS px'],
      ['圓角', '0.375rem／6 CSS px', '與候選相同'],
      ['表面', 'Hover surface 作預設', 'Active surface 作 Hover'],
      ['Focus', '2 CSS px＋2 CSS px offset', 'Coral 外框'],
      ['Disabled', '50%', '仍可選取 · Select none 待補'],
      ['Placeholder', 'Dark 5.25:1', 'Light 4.23:1 · 未達 4.5:1'],
    ],
  },
];

function coverageFor(layer, state, index) {
  const category = COVERAGE_COLUMNS[index][0];

  if (state.key === 'disabled' && category === 'feedback') {
    return layer.disabledFeedback;
  }

  if (state.key === 'readonly' && category === 'surface') {
    return layer.readonlySurface;
  }

  return state.coverage[index];
}
</script>

<template>
  <div class="demo-field-appearance">
    <p class="demo-field-appearance__intro">
      <strong>Field 統一 Label、control、Hint／Error 的排列與狀態語法。</strong>
      各輸入元件只補自己的 control 結構。
    </p>

    <section
      v-for="layer in FIELD_LAYERS"
      :key="layer.key"
      class="demo-field-layer"
      :class="`demo-field-layer--${layer.key}`"
      :data-field-source="layer.key"
      :data-demo-review-layer="layer.key"
      :aria-labelledby="`demo-field-${layer.key}-title`"
    >
      <header class="demo-field-layer__header">
        <h4 :id="`demo-field-${layer.key}-title`">{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <section class="demo-field-foundation" data-field-foundation="true">
        <header class="demo-field-subsection__header">
          <h5>基礎性質</h5>
          <p>先確認控制本體，再檢查文字與狀態；寬度由使用它的 layout 決定。</p>
        </header>

        <div class="demo-field-foundation__grid">
          <section class="demo-field-foundation__block">
            <h6>Control hard floor</h6>
            <div class="demo-field-size-list">
              <article
                v-for="size in layer.sizes"
                :key="size[0]"
                class="demo-field-size"
                :class="`demo-field-size--${size[0]}`"
                :data-field-size="size[0]"
              >
                <span>{{ size[1] }}</span>
                <UiTextField
                  :id="`demo-field-${layer.key}-size-${size[0]}`"
                  :label="`${size[1]} 高度檢查`"
                  :model-value="size[2]"
                  label-hidden
                  readonly
                />
              </article>
            </div>
          </section>

          <section class="demo-field-foundation__block">
            <h6>Width responsibility</h6>
            <dl class="demo-field-width-contract">
              <div>
                <dt>Default</dt>
                <dd>100% parent</dd>
              </div>
              <div>
                <dt>Min</dt>
                <dd>0 · layout floor</dd>
              </div>
              <div>
                <dt>Max</dt>
                <dd>none · parent owns</dd>
              </div>
            </dl>
            <div class="demo-field-width-tests">
              <article
                v-for="width in FIELD_WIDTH_TESTS"
                :key="width.key"
                class="demo-field-width-test"
                :class="`demo-field-width-test--${width.key}`"
                :data-field-width-test="width.key"
              >
                <span>{{ width.label }}</span>
                <UiTextField
                  :id="`demo-field-${layer.key}-width-${width.key}`"
                  :label="`${width.label} 寬度檢查`"
                  :model-value="width.value"
                  label-hidden
                  readonly
                />
              </article>
            </div>
          </section>

          <section
            class="demo-field-foundation__block demo-field-foundation__block--structure"
          >
            <h6>Owned structure</h6>
            <div class="demo-field-structure" aria-label="Field 結構槽位">
              <div
                class="demo-field-structure__label"
                data-field-structure="label"
                :data-field-label-selection="layer.key"
                :data-selection-status="layer.labelSelection[0]"
              >
                <span>Label prop</span>
                <small>{{ layer.labelSelection[1] }}</small>
              </div>
              <div
                class="demo-field-structure__control"
                data-field-structure="control"
              >
                <span>Control scoped slot</span>
                <UiTextField
                  :id="`demo-field-${layer.key}-structure-control`"
                  label="控制區"
                  model-value="輸入本體"
                  label-hidden
                  readonly
                />
              </div>
              <div
                class="demo-field-structure__support"
                data-field-structure="support"
              >
                Hint／Error prop
              </div>
            </div>
            <p class="demo-field-foundation__boundary">
              Leading／Trailing 由具體元件負責，不建立通用 accessory slot。
            </p>
          </section>
        </div>
      </section>

      <section class="demo-field-state-review">
        <header class="demo-field-subsection__header">
          <h5>狀態外觀</h5>
          <p>先看實際結果，再由覆蓋矩陣確認每個狀態是否有完整設定。</p>
        </header>

        <div class="demo-field-layer__states">
          <article
            v-for="state in FIELD_STATES"
            :key="state.key"
            class="demo-field-state"
            :data-field-state="state.key"
          >
            <h6>{{ state.label }}</h6>
            <UiTextField
              :id="`demo-field-${layer.key}-${state.key}`"
              label="曲目名稱"
              :model-value="state.modelValue"
              :placeholder="state.placeholder"
              :hint="state.hint"
              :error="state.error"
              :required="state.required"
              :disabled="state.disabled"
              :readonly="state.readonly || undefined"
            />
          </article>
        </div>

        <UiScrollRegion
          class="demo-field-coverage"
          axis="horizontal"
          data-field-coverage-matrix="true"
          tabindex="0"
          aria-label="Field 狀態樣式覆蓋矩陣"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">State</th>
                <th
                  v-for="column in COVERAGE_COLUMNS"
                  :key="column[0]"
                  scope="col"
                >
                  {{ column[1] }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="state in FIELD_STATES" :key="state.key">
                <th scope="row">{{ state.label }}</th>
                <td
                  v-for="(coverage, index) in state.coverage"
                  :key="COVERAGE_COLUMNS[index][0]"
                  :data-field-coverage="`${layer.key}-${state.key}-${COVERAGE_COLUMNS[index][0]}`"
                  :data-coverage-status="coverageFor(layer, state, index)[0]"
                >
                  {{ coverageFor(layer, state, index)[1] }}
                </td>
              </tr>
            </tbody>
          </table>
        </UiScrollRegion>
        <p class="demo-field-coverage__pending">{{ layer.pendingNote }}</p>
      </section>

      <dl class="demo-field-layer__reference">
        <div v-for="value in layer.values" :key="value[0]">
          <dt>{{ value[0] }}</dt>
          <dd>{{ value[1] }}</dd>
          <dd>{{ value[2] }}</dd>
        </div>
      </dl>
    </section>

    <DemoFieldValidationFeedback />
  </div>
</template>

<style scoped>
.demo-field-appearance {
  display: grid;
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-field-appearance__intro {
  max-width: 72ch;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-field-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-field-layer {
  min-width: 0;
}

.demo-field-layer__header {
  display: grid;
  grid-template-columns: minmax(12rem, 16rem) minmax(0, 1fr);
  align-items: end;
  gap: var(--ui-space-4);
  padding-block: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border-strong);
}

.demo-field-layer__header h4,
.demo-field-layer__header p,
.demo-field-subsection__header h5,
.demo-field-subsection__header p,
.demo-field-foundation__block h6,
.demo-field-state h6,
.demo-field-foundation__boundary,
.demo-field-coverage__pending {
  margin: 0;
}

.demo-field-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-heading);
}

.demo-field-layer__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-field-foundation,
.demo-field-state-review {
  margin-top: var(--ui-space-4);
}

.demo-field-subsection__header {
  display: grid;
  grid-template-columns: minmax(9rem, 12rem) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
  margin-bottom: var(--ui-space-3);
}

.demo-field-subsection__header h5,
.demo-field-foundation__block h6,
.demo-field-state h6 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-field-subsection__header p,
.demo-field-foundation__boundary,
.demo-field-coverage__pending {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-field-foundation__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

.demo-field-foundation__block {
  min-width: 0;
  padding-top: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-field-foundation__block--structure {
  grid-column: 1 / -1;
}

.demo-field-size-list,
.demo-field-width-tests {
  display: grid;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-3);
}

.demo-field-size-list {
  grid-template-columns: repeat(auto-fit, minmax(min(10rem, 100%), 1fr));
}

.demo-field-size,
.demo-field-width-test {
  min-width: 0;
}

.demo-field-size > span,
.demo-field-width-test > span {
  display: block;
  margin-bottom: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-field-size--standard {
  --ui-field-height: 2.25rem;
}

.demo-field-size--compact {
  --ui-field-height: 2rem;
}

.demo-field-size--active {
  --ui-field-height: 1.875rem;
}

.demo-field-width-contract {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(7rem, 100%), 1fr));
  gap: var(--ui-space-2);
  margin: var(--ui-space-3) 0 0;
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
  line-height: var(--ui-line-height-caption);
}

.demo-field-width-contract > div {
  min-width: 0;
}

.demo-field-width-contract dt {
  color: var(--ui-color-text-subtle);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-field-width-contract dd {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text-muted);
}

.demo-field-width-test {
  padding: var(--ui-space-2);
  border: var(--ui-border-width) dashed var(--ui-color-border-strong);
}

.demo-field-width-test--narrow {
  width: min(12rem, 100%);
}

.demo-field-width-test--reference {
  width: min(20rem, 100%);
}

.demo-field-width-test--fluid {
  width: 100%;
}

.demo-field-structure {
  display: grid;
  grid-template-columns: minmax(8rem, 12rem) minmax(12rem, 1fr) minmax(
      8rem,
      12rem
    );
  align-items: stretch;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-3);
}

.demo-field-structure > div {
  display: grid;
  align-content: center;
  min-width: 0;
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-field-structure__control {
  gap: var(--ui-space-2);
  border-color: var(--ui-color-border-strong);
}

.demo-field-structure__label small {
  color: var(--ui-color-text-muted);
}

.demo-field-foundation__boundary {
  margin-top: var(--ui-space-2);
}

.demo-field-layer__reference {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(10rem, 100%), 1fr));
  gap: var(--ui-space-2) var(--ui-space-4);
  min-width: 0;
  margin: var(--ui-space-4) 0 0;
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
  line-height: var(--ui-line-height-caption);
}

.demo-field-layer__reference > div {
  min-width: 0;
}

.demo-field-layer__reference dt {
  color: var(--ui-color-text-subtle);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-field-layer__reference dd {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text-muted);
  overflow-wrap: anywhere;
}

.demo-field-layer__states {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
  gap: var(--ui-space-4);
}

.demo-field-state {
  min-width: 0;
  padding-top: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-field-state h6 {
  margin-bottom: var(--ui-space-2);
  color: var(--ui-color-text-muted);
}

.demo-field-coverage {
  max-width: 100%;
  margin-top: var(--ui-space-4);
  outline-offset: var(--ui-focus-offset-inset);
}

.demo-field-coverage:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
}

.demo-field-coverage table {
  width: 100%;
  min-width: 46rem;
  border-collapse: collapse;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  text-align: left;
}

.demo-field-coverage th,
.demo-field-coverage td {
  padding: var(--ui-space-2);
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-field-coverage th {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-field-coverage td[data-coverage-status='complete'] {
  color: var(--ui-color-text);
}

.demo-field-coverage td[data-coverage-status='pending'],
.demo-field-coverage__pending {
  color: var(--ui-color-warning);
}

.demo-field-coverage__pending {
  margin-top: var(--ui-space-2);
}

.demo-field-state[data-field-state='hover'] :deep(.ui-text-field) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-bg-hover);
}

.demo-field-state[data-field-state='focus'] :deep(.ui-text-field) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-field-layer--candidate
  :deep(.ui-field__label:not(.ui-field__label--hidden)),
.demo-field-layer--candidate :deep(.ui-field__required) {
  -webkit-user-select: none;
  user-select: none;
}

.demo-field-layer--candidate
  .demo-field-state[data-field-state='disabled']
  :deep(.ui-text-field:disabled) {
  -webkit-user-select: none;
  user-select: none;
}

.demo-field-layer--candidate
  .demo-field-state[data-field-state='readonly']
  :deep(.ui-text-field:read-only) {
  background: var(--ui-field-bg-readonly);
  border-color: var(--ui-field-border);
}

.demo-field-layer--current {
  --demo-current-field-height: 1.875rem;
  --demo-current-field-bg: #344046;
  --demo-current-field-bg-hover: #3a464c;
  --demo-current-field-fg: #f7f1e7;
  --demo-current-field-placeholder: #aeb8b6;
  --demo-current-field-border: #3c4749;
  --demo-current-field-border-hover: #586568;
  --demo-current-field-invalid: #dd7078;
  --demo-current-focus: #dd7a64;

  --ui-field-height: var(--demo-current-field-height);
  --ui-field-bg: var(--demo-current-field-bg);
  --ui-field-bg-hover: var(--demo-current-field-bg-hover);
  --ui-field-fg: var(--demo-current-field-fg);
  --ui-field-placeholder: var(--demo-current-field-placeholder);
  --ui-field-border: var(--demo-current-field-border);
  --ui-field-border-hover: var(--demo-current-field-border-hover);
  --ui-field-border-invalid: var(--demo-current-field-invalid);
  --ui-color-focus: var(--demo-current-focus);
  --ui-color-danger: var(--demo-current-field-invalid);
  --ui-color-text: var(--demo-current-field-fg);
  --ui-color-text-muted: var(--demo-current-field-placeholder);
}

:global(:root[data-ui-theme='light'] .demo-field-layer--current) {
  --demo-current-field-bg: #edf2ef;
  --demo-current-field-bg-hover: #e4ece8;
  --demo-current-field-fg: #1f2328;
  --demo-current-field-placeholder: #69747a;
  --demo-current-field-border: #d8ded9;
  --demo-current-field-border-hover: #b9c4c0;
  --demo-current-field-invalid: #bd5961;
  --demo-current-focus: #d26a45;
}

@container (max-width: 48rem) {
  .demo-field-layer__header,
  .demo-field-subsection__header,
  .demo-field-foundation__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-field-layer__header,
  .demo-field-subsection__header {
    align-items: start;
    gap: var(--ui-space-1);
  }

  .demo-field-foundation__block--structure {
    grid-column: auto;
  }

  .demo-field-structure {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
