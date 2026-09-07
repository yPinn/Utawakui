<script setup>
import { reactive } from 'vue';
import UiTextField from '../ui/UiTextField.vue';

const WIDTH_TESTS = [
  { key: 'narrow', label: '12rem 檢查槽', value: '窄父容器' },
  { key: 'reference', label: '20rem 檢查槽', value: '一般父容器' },
  { key: 'fluid', label: '可用寬度檢查槽', value: '跟隨父層延展' },
];

const CONTENT_CASES = [
  {
    key: 'placeholder',
    label: '空白／Placeholder',
    value: '',
    placeholder: '輸入曲目名稱',
    contract: '空值不建立額外高度',
  },
  {
    key: 'short',
    label: '短字／CJK',
    value: '雨愛',
    contract: '14 CSS px · 單行',
  },
  {
    key: 'long',
    label: '多語長字',
    value: 'LOVE YOURSELF 結 Answer／愛をこめて花束を／사랑했지만',
    contract: '不換行 · native inline scroll',
  },
  {
    key: 'maxlength',
    label: 'Maxlength',
    value: '演出標題長度限制十二個字',
    maxlength: 12,
    contract: '12 grapheme fixture · 原生上限',
  },
  {
    key: 'direction',
    label: 'Direction auto',
    value: 'تعليق تجريبي',
    dir: 'auto',
    contract: '由內容決定 inline 起點',
  },
];

const STATE_COLUMNS = [
  ['surface', 'Surface'],
  ['boundary', 'Boundary'],
  ['content', 'Content'],
  ['selection', 'Selection'],
  ['native', 'Native'],
];

const STATES = [
  {
    key: 'default',
    label: 'Default',
    placeholder: '輸入演出者名稱',
    candidate: [
      ['base', 'Raised'],
      ['base', 'Base border'],
      ['base', 'Placeholder'],
      ['complete', 'Text'],
      ['complete', 'Editable'],
    ],
    current: [
      ['base', 'Hover surface'],
      ['base', 'Base border'],
      ['pending', 'Light 4.23:1'],
      ['complete', 'Text'],
      ['complete', 'Editable'],
    ],
  },
  {
    key: 'filled',
    label: 'Filled',
    value: '雨愛',
    candidate: [
      ['base', 'Raised'],
      ['base', 'Base border'],
      ['complete', 'Value'],
      ['complete', 'Text'],
      ['complete', 'Editable'],
    ],
    current: [
      ['base', 'Hover surface'],
      ['base', 'Base border'],
      ['complete', 'Value'],
      ['complete', 'Text'],
      ['complete', 'Editable'],
    ],
  },
  {
    key: 'hover',
    label: 'Hover',
    value: 'Pointer hover',
    candidate: [
      ['complete', 'Hover surface'],
      ['complete', 'Strong border'],
      ['base', 'Value'],
      ['complete', 'Text'],
      ['complete', ':hover'],
    ],
    current: [
      ['complete', 'Active surface'],
      ['complete', 'Strong border'],
      ['base', 'Value'],
      ['complete', 'Text'],
      ['complete', ':hover'],
    ],
  },
  {
    key: 'focus',
    label: 'Focus-visible',
    value: 'Keyboard focus',
    candidate: [
      ['base', 'Raised'],
      ['complete', '2px＋2px ring'],
      ['base', 'Value'],
      ['complete', 'Text'],
      ['complete', ':focus-visible'],
    ],
    current: [
      ['base', 'Hover surface'],
      ['complete', '2px＋2px ring'],
      ['base', 'Value'],
      ['complete', 'Text'],
      ['complete', ':focus-visible'],
    ],
  },
  {
    key: 'invalid',
    label: 'Invalid',
    placeholder: '必要欄位',
    invalid: true,
    candidate: [
      ['base', 'Raised'],
      ['complete', 'Danger border'],
      ['base', 'Placeholder'],
      ['complete', 'Text'],
      ['complete', 'aria-invalid'],
    ],
    current: [
      ['base', 'Hover surface'],
      ['complete', 'Danger border'],
      ['base', 'Placeholder'],
      ['complete', 'Text'],
      ['complete', 'aria-invalid'],
    ],
  },
  {
    key: 'disabled',
    label: 'Disabled',
    value: '由系統管理',
    disabled: true,
    candidate: [
      ['complete', '50% control'],
      ['base', 'Base border'],
      ['complete', 'Value'],
      ['complete', 'None'],
      ['complete', 'Disabled'],
    ],
    current: [
      ['complete', '50% input'],
      ['base', 'Base border'],
      ['complete', 'Value'],
      ['pending', '仍可選取'],
      ['complete', 'Disabled'],
    ],
  },
  {
    key: 'readonly',
    label: 'Readonly',
    value: '可選取與複製',
    readonly: true,
    candidate: [
      ['complete', 'Quiet surface'],
      ['base', 'Base border'],
      ['complete', 'Value'],
      ['complete', 'Text'],
      ['complete', 'Readonly'],
    ],
    current: [
      ['pending', '同 Editable'],
      ['base', 'Base border'],
      ['complete', 'Value'],
      ['complete', 'Text'],
      ['complete', 'Readonly'],
    ],
  },
];

const LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 候選 Text Field',
    note: '沿用已核定 Field 外殼；此區只新增單行輸入本體的候選規格。',
    sizes: [
      ['standard', 'Standard', '36 CSS px'],
      ['compact', 'Compact', '32 CSS px'],
    ],
    anatomy: [
      ['Start inset', '0.5rem／8 CSS px'],
      ['Text lane', '單行、min-width 0、native inline scroll'],
      ['End inset', '0.5rem／8 CSS px'],
    ],
    api: [
      ['Value', 'modelValue → update:modelValue'],
      ['Text', 'placeholder · maxlength · dir'],
      ['Browser', 'autocomplete · native attrs'],
      ['Field', 'label · hint · error · invalid'],
    ],
  },
  {
    key: 'current',
    title: '現行 UiTextField',
    note: '以 active token 快照呈現；正式元件目前沒有 size prop 或 accessory slot。',
    sizes: [['active', 'Active default', '30 CSS px']],
    anatomy: [
      ['Start inset', '0.5rem／8 CSS px'],
      ['Text lane', '單行、min-width 0、native inline scroll'],
      ['End inset', '0.5rem／8 CSS px'],
    ],
    api: [
      ['Value', 'modelValue → update:modelValue'],
      ['Text', 'placeholder · maxlength · dir'],
      ['Browser', 'autocomplete · native attrs'],
      ['Field', 'label · hint · error · invalid'],
    ],
  },
];

const specimenValues = reactive(
  Object.fromEntries(
    LAYERS.map((layer) => [
      layer.key,
      {
        sizes: Object.fromEntries(
          layer.sizes.map((size) => [size[0], size[2]]),
        ),
        widths: Object.fromEntries(
          WIDTH_TESTS.map((width) => [width.key, width.value]),
        ),
        content: Object.fromEntries(
          CONTENT_CASES.map((content) => [content.key, content.value]),
        ),
        states: Object.fromEntries(
          STATES.map((state) => [state.key, state.value ?? '']),
        ),
      },
    ]),
  ),
);

function coverageFor(layer, state) {
  return state[layer.key];
}
</script>

<template>
  <div class="demo-text-field-appearance">
    <p class="demo-text-field-appearance__intro">
      <strong>Text Field 只擁有單行 input。</strong>
      Label、Hint 與 Error 已由共用 Field 核定；以下說明全部置於標本外，不參與
      control 幾何。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-text-field-layer"
      :class="`demo-text-field-layer--${layer.key}`"
      :data-text-field-source="layer.key"
      :data-demo-review-layer="layer.key"
      :aria-labelledby="`demo-text-field-${layer.key}-title`"
    >
      <header class="demo-text-field-layer__header">
        <h4 :id="`demo-text-field-${layer.key}-title`">{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <section class="demo-text-field-foundation" data-text-field-foundation>
        <header class="demo-text-field-subsection__header">
          <h5>基礎性質</h5>
          <p>先量 control，再看內容；寬度測試槽不是元件 token。</p>
        </header>

        <div class="demo-text-field-foundation__grid">
          <section class="demo-text-field-foundation__block">
            <h6>Control height</h6>
            <div class="demo-text-field-size-list">
              <article
                v-for="size in layer.sizes"
                :key="size[0]"
                class="demo-text-field-size"
                :class="`demo-text-field-size--${size[0]}`"
                :data-text-field-size="size[0]"
              >
                <UiTextField
                  :id="`demo-text-field-${layer.key}-size-${size[0]}`"
                  v-model="specimenValues[layer.key].sizes[size[0]]"
                  :label="`${size[1]} 高度檢查`"
                  label-hidden
                />
                <span>{{ size[1] }} · {{ size[2] }}</span>
              </article>
            </div>
          </section>

          <section class="demo-text-field-foundation__block">
            <h6>Width responsibility</h6>
            <div class="demo-text-field-width-contract" aria-label="寬度責任">
              <span>Default 100% parent</span>
              <span>Min 0 · layout floor</span>
              <span>Max none · parent owns</span>
            </div>
            <div class="demo-text-field-width-tests">
              <article
                v-for="width in WIDTH_TESTS"
                :key="width.key"
                class="demo-text-field-width-test"
                :class="`demo-text-field-width-test--${width.key}`"
                :data-text-field-width="width.key"
              >
                <UiTextField
                  :id="`demo-text-field-${layer.key}-width-${width.key}`"
                  v-model="specimenValues[layer.key].widths[width.key]"
                  :label="`${width.label}寬度檢查`"
                  label-hidden
                />
                <span>{{ width.label }}</span>
              </article>
            </div>
          </section>

          <section
            class="demo-text-field-foundation__block demo-text-field-foundation__block--anatomy"
          >
            <h6>Inline anatomy · no slots</h6>
            <div class="demo-text-field-anatomy">
              <UiTextField
                :id="`demo-text-field-${layer.key}-anatomy`"
                label="Text Field inline anatomy"
                model-value="單行文字的可用區域"
                label-hidden
                readonly
              />
              <div class="demo-text-field-anatomy__rail" aria-hidden="true">
                <span data-text-field-anatomy="start"></span>
                <span data-text-field-anatomy="content"></span>
                <span data-text-field-anatomy="end"></span>
              </div>
              <div class="demo-text-field-anatomy__labels">
                <span>8 CSS px</span>
                <span>單行 text lane · fluid／min 0</span>
                <span>8 CSS px</span>
              </div>
            </div>
            <dl class="demo-text-field-anatomy__reference">
              <div v-for="item in layer.anatomy" :key="item[0]">
                <dt>{{ item[0] }}</dt>
                <dd>{{ item[1] }}</dd>
              </div>
            </dl>
          </section>
        </div>
      </section>

      <section class="demo-text-field-content-review">
        <header class="demo-text-field-subsection__header">
          <h5>內容行為</h5>
          <p>所有名稱與說明位於 control 外；輸入本體維持相同高度。</p>
        </header>
        <div class="demo-text-field-content-list">
          <article
            v-for="content in CONTENT_CASES"
            :key="content.key"
            class="demo-text-field-content"
            :data-text-field-content="content.key"
          >
            <h6>{{ content.label }}</h6>
            <UiTextField
              :id="`demo-text-field-${layer.key}-content-${content.key}`"
              v-model="specimenValues[layer.key].content[content.key]"
              :label="`${content.label}內容檢查`"
              :placeholder="content.placeholder"
              :maxlength="content.maxlength"
              :dir="content.dir"
              label-hidden
            />
            <p>{{ content.contract }}</p>
          </article>
        </div>
      </section>

      <section
        class="demo-text-field-state-review"
        data-text-field-state-review
      >
        <header class="demo-text-field-subsection__header">
          <h5>狀態外觀與覆蓋</h5>
          <p>
            Readonly 使用跨 Field 家族核定的 quiet surface，保留選取、複製與
            keyboard focus。
          </p>
        </header>
        <div class="demo-text-field-state-list">
          <article
            v-for="state in STATES"
            :key="state.key"
            class="demo-text-field-state"
            :data-text-field-state="state.key"
          >
            <h6>{{ state.label }}</h6>
            <UiTextField
              :id="`demo-text-field-${layer.key}-state-${state.key}`"
              v-model="specimenValues[layer.key].states[state.key]"
              :label="`${state.label}狀態檢查`"
              :placeholder="state.placeholder"
              :invalid="state.invalid"
              :disabled="state.disabled"
              :readonly="state.readonly || undefined"
              label-hidden
            />
          </article>
        </div>

        <div
          class="demo-text-field-coverage"
          data-text-field-coverage-matrix
          tabindex="0"
          aria-label="Text Field 狀態樣式覆蓋矩陣"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">State</th>
                <th
                  v-for="column in STATE_COLUMNS"
                  :key="column[0]"
                  scope="col"
                >
                  {{ column[1] }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="state in STATES" :key="state.key">
                <th scope="row">{{ state.label }}</th>
                <td
                  v-for="(coverage, index) in coverageFor(layer, state)"
                  :key="STATE_COLUMNS[index][0]"
                  :data-text-field-coverage="`${layer.key}-${state.key}-${STATE_COLUMNS[index][0]}`"
                  :data-coverage-status="coverage[0]"
                >
                  {{ coverage[1] }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="demo-text-field-api">
        <h5>Public contract</h5>
        <dl>
          <div v-for="item in layer.api" :key="item[0]">
            <dt>{{ item[0] }}</dt>
            <dd>{{ item[1] }}</dd>
          </div>
        </dl>
        <p>No size prop · No min／max width token · No slots</p>
      </section>
    </section>
  </div>
</template>

<style scoped>
.demo-text-field-appearance {
  display: grid;
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-text-field-appearance__intro,
.demo-text-field-layer__header h4,
.demo-text-field-layer__header p,
.demo-text-field-subsection__header h5,
.demo-text-field-subsection__header p,
.demo-text-field-foundation__block h6,
.demo-text-field-content h6,
.demo-text-field-content p,
.demo-text-field-state h6,
.demo-text-field-api h5,
.demo-text-field-api p {
  margin: 0;
}

.demo-text-field-appearance__intro {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-text-field-appearance__intro strong,
.demo-text-field-layer__header h4,
.demo-text-field-subsection__header h5,
.demo-text-field-foundation__block h6,
.demo-text-field-content h6,
.demo-text-field-state h6,
.demo-text-field-api h5 {
  color: var(--ui-color-text);
}

.demo-text-field-layer {
  min-width: 0;
}

.demo-text-field-layer__header,
.demo-text-field-subsection__header {
  display: grid;
  grid-template-columns: minmax(12rem, 16rem) minmax(0, 1fr);
  gap: var(--ui-space-4);
}

.demo-text-field-layer__header {
  align-items: end;
  padding-block: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border-strong);
}

.demo-text-field-layer__header h4 {
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-heading);
}

.demo-text-field-layer__header p,
.demo-text-field-subsection__header p,
.demo-text-field-content p,
.demo-text-field-api p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-text-field-foundation,
.demo-text-field-content-review,
.demo-text-field-state-review,
.demo-text-field-api {
  margin-top: var(--ui-space-4);
}

.demo-text-field-subsection__header {
  align-items: baseline;
  margin-bottom: var(--ui-space-3);
}

.demo-text-field-subsection__header h5,
.demo-text-field-foundation__block h6,
.demo-text-field-content h6,
.demo-text-field-state h6,
.demo-text-field-api h5 {
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-text-field-foundation__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

.demo-text-field-foundation__block {
  min-width: 0;
  padding-top: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-text-field-foundation__block--anatomy {
  grid-column: 1 / -1;
}

.demo-text-field-size-list,
.demo-text-field-width-tests {
  display: grid;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-3);
}

.demo-text-field-size-list {
  grid-template-columns: repeat(auto-fit, minmax(min(10rem, 100%), 1fr));
}

.demo-text-field-size,
.demo-text-field-width-test {
  min-width: 0;
}

.demo-text-field-size > span,
.demo-text-field-width-test > span {
  display: block;
  margin-top: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-text-field-size--standard {
  --ui-field-height: 2.25rem;
}

.demo-text-field-size--compact {
  --ui-field-height: 2rem;
}

.demo-text-field-size--active {
  --ui-field-height: 1.875rem;
}

.demo-text-field-width-contract {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-3);
}

.demo-text-field-width-contract span {
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-text-field-width-test {
  padding: var(--ui-space-2);
  border: var(--ui-border-width) dashed var(--ui-color-border-strong);
}

.demo-text-field-width-test--narrow {
  width: min(12rem, 100%);
}

.demo-text-field-width-test--reference {
  width: min(20rem, 100%);
}

.demo-text-field-width-test--fluid {
  width: 100%;
}

.demo-text-field-anatomy {
  width: min(36rem, 100%);
  margin-top: var(--ui-space-3);
}

.demo-text-field-anatomy__rail {
  display: grid;
  grid-template-columns: 0.5rem minmax(0, 1fr) 0.5rem;
  height: var(--ui-space-1);
  margin-top: var(--ui-space-2);
  gap: var(--ui-border-width);
}

.demo-text-field-anatomy__rail span {
  background: var(--ui-color-warning);
}

.demo-text-field-anatomy__rail span:nth-child(2) {
  background: var(--ui-color-border-strong);
}

.demo-text-field-anatomy__labels {
  display: grid;
  grid-template-columns: minmax(4.5rem, auto) 1fr minmax(4.5rem, auto);
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-1);
  color: var(--ui-color-warning);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-text-field-anatomy__labels span:nth-child(2) {
  color: var(--ui-color-text-muted);
  text-align: center;
}

.demo-text-field-anatomy__labels span:last-child {
  text-align: end;
}

.demo-text-field-anatomy__reference,
.demo-text-field-api dl {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr));
  gap: var(--ui-space-2);
  margin: var(--ui-space-3) 0 0;
}

.demo-text-field-anatomy__reference > div,
.demo-text-field-api dl > div {
  min-width: 0;
}

.demo-text-field-anatomy__reference dt,
.demo-text-field-api dt {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-text-field-anatomy__reference dd,
.demo-text-field-api dd {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-text-field-content-list,
.demo-text-field-state-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--ui-space-4);
}

.demo-text-field-content,
.demo-text-field-state {
  min-width: 0;
}

.demo-text-field-content h6,
.demo-text-field-state h6 {
  margin-bottom: var(--ui-space-2);
}

.demo-text-field-content p {
  margin-top: var(--ui-space-1);
}

.demo-text-field-coverage {
  min-width: 0;
  margin-top: var(--ui-space-4);
  overflow-x: auto;
  outline: none;
}

.demo-text-field-coverage:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-text-field-coverage table {
  width: 100%;
  min-width: 44rem;
  border-collapse: collapse;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-text-field-coverage th,
.demo-text-field-coverage td {
  padding: var(--ui-space-2);
  border-block: var(--ui-border-width) solid var(--ui-color-border);
  text-align: start;
}

.demo-text-field-coverage th {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-text-field-coverage td[data-coverage-status='complete'] {
  color: var(--ui-color-success);
}

.demo-text-field-coverage td[data-coverage-status='review'] {
  color: var(--ui-color-warning);
}

.demo-text-field-coverage td[data-coverage-status='pending'] {
  color: var(--ui-color-danger);
}

.demo-text-field-api {
  padding-top: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-text-field-api p {
  margin-top: var(--ui-space-3);
}

.demo-text-field-layer--candidate :deep(.ui-field__label) {
  -webkit-user-select: none;
  user-select: none;
}

.demo-text-field-layer--candidate
  .demo-text-field-state[data-text-field-state='hover']
  :deep(.ui-text-field) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-bg-hover);
}

.demo-text-field-layer--candidate
  .demo-text-field-state[data-text-field-state='focus']
  :deep(.ui-text-field),
.demo-text-field-layer--current
  .demo-text-field-state[data-text-field-state='focus']
  :deep(.ui-text-field) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-text-field-layer--candidate
  .demo-text-field-state[data-text-field-state='invalid']
  :deep(.ui-text-field),
.demo-text-field-layer--current
  .demo-text-field-state[data-text-field-state='invalid']
  :deep(.ui-text-field) {
  border-color: var(--ui-field-border-invalid);
}

.demo-text-field-layer--candidate
  .demo-text-field-state[data-text-field-state='disabled']
  :deep(.ui-text-field) {
  -webkit-user-select: none;
  user-select: none;
}

.demo-text-field-layer--candidate
  .demo-text-field-state[data-text-field-state='readonly']
  :deep(.ui-text-field) {
  background: var(--ui-field-bg-readonly);
  border-color: var(--ui-field-border);
}

.demo-text-field-layer--current {
  --ui-field-height: 1.875rem;
  --ui-field-padding-block: 0.25rem;
  --ui-field-padding-inline: 0.5rem;
  --ui-field-radius: 0.375rem;
  --ui-field-bg: #344046;
  --ui-field-bg-hover: #3a464c;
  --ui-field-fg: #f7f1e7;
  --ui-field-placeholder: #aeb8b6;
  --ui-field-border: #3c4749;
  --ui-field-border-hover: #536165;
  --ui-field-border-invalid: #dd7078;
  --ui-color-focus: #dd8267;
}

:global(:root[data-ui-theme='light'] .demo-text-field-layer--current) {
  --ui-field-bg: #edf2ef;
  --ui-field-bg-hover: #e4ece8;
  --ui-field-fg: #1f2328;
  --ui-field-placeholder: #69747a;
  --ui-field-border: #d8ded9;
  --ui-field-border-hover: #b9c4c0;
  --ui-field-border-invalid: #bd5961;
  --ui-color-focus: #d26a45;
}

.demo-text-field-layer--current
  .demo-text-field-state[data-text-field-state='hover']
  :deep(.ui-text-field) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-bg-hover);
}

@container (max-width: 48rem) {
  .demo-text-field-layer__header,
  .demo-text-field-subsection__header,
  .demo-text-field-foundation__grid {
    grid-template-columns: 1fr;
  }

  .demo-text-field-foundation__block--anatomy {
    grid-column: auto;
  }

  .demo-text-field-width-contract {
    grid-template-columns: 1fr;
  }
}
</style>
