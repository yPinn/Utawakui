<script setup>
import { reactive } from 'vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiTextarea from '../ui/UiTextarea.vue';

const WIDTH_CASES = [
  ['narrow', '12rem 檢查槽', '窄父容器'],
  ['reference', '20rem 檢查槽', '一般父容器'],
  ['fluid', '可用寬度檢查槽', '跟隨父層延展'],
];

const CONTENT_CASES = [
  {
    key: 'placeholder',
    label: '空白／Placeholder',
    value: '',
    placeholder: '輸入演出備註',
    contract: '空值保留 rows 容量',
  },
  {
    key: 'line-breaks',
    label: '顯式換行',
    value: '第一段結束後停四拍\n第二段由副歌進入',
    contract: '保留 newline',
  },
  {
    key: 'wrap',
    label: '多語長句',
    value:
      'LOVE YOURSELF 結 Answer／愛をこめて花束を／사랑했지만，長內容在可用寬度內自然換行。',
    contract: '顯式換行＋自動換行',
  },
  {
    key: 'maxlength',
    label: 'Maxlength',
    value: '公開輸出的文字長度限制為二十四個字元',
    maxlength: 24,
    contract: 'maxlength 24 · 原生上限',
  },
  {
    key: 'direction',
    label: 'Direction auto',
    value: 'ملاحظة أداء متعددة الأسطر',
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
    placeholder: '輸入公開說明',
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
    value: '第二段副歌前保留四拍。\n結尾等待燈號。',
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
    value: 'Pointer hover\n保留可編輯狀態',
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
    value: 'Keyboard focus\n顯示外框',
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
    value: '由系統管理\n禁止編輯與選取',
    disabled: true,
    candidate: [
      ['complete', '50% control'],
      ['base', 'Base border'],
      ['complete', 'Value'],
      ['complete', 'None'],
      ['complete', 'Disabled'],
    ],
    current: [
      ['complete', '50% textarea'],
      ['base', 'Base border'],
      ['complete', 'Value'],
      ['pending', '仍可選取'],
      ['complete', 'Disabled'],
    ],
  },
  {
    key: 'readonly',
    label: 'Readonly',
    value: '可選取與複製\nQuiet surface',
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
    title: 'Token v2 候選 Textarea',
    note: '沿用候選 Field 外框；多行本體只定義 rows、換行、溢位與 resize。',
    floor: 'Standard 72／Compact 64 CSS px',
    heightCases: [
      ['standard-floor', 2, 'Standard hard floor', '2 rows · 72 CSS px'],
      ['compact-floor', 2, 'Compact hard floor', '2 rows · 64 CSS px'],
      ['default', 3, 'Default rows · 3', 'native content · 73 CSS px'],
      ['rows-5', 5, 'Rows 5', 'content capacity · 115 CSS px'],
    ],
  },
  {
    key: 'current',
    title: '現行 UiTextarea',
    note: '以 active token 快照呈現；現行 hard floor 為 60 CSS px。',
    floor: 'Active 60 CSS px',
    heightCases: [
      ['active-floor', 2, 'Active hard floor', '2 rows · 60 CSS px'],
      ['default', 3, 'Default rows · 3', 'native content · 73 CSS px'],
      ['rows-5', 5, 'Rows 5', 'content capacity · 115 CSS px'],
    ],
  },
];

const values = reactive(
  Object.fromEntries(
    LAYERS.map((layer) => [
      layer.key,
      {
        heights: Object.fromEntries(
          layer.heightCases.map(([key, , label]) => [
            key,
            `${label}\n第二行標本`,
          ]),
        ),
        widths: Object.fromEntries(
          WIDTH_CASES.map(([key, , value]) => [key, `${value}\n第二行標本`]),
        ),
        anatomy: '第一行文字\n第二行自然延伸',
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
  <div class="demo-textarea-appearance">
    <p class="demo-textarea-appearance__intro">
      <strong
        >Textarea 沿用 Field，只增加多行高度與 resize／overflow 行為。</strong
      >
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-textarea-layer"
      :class="`demo-textarea-layer--${layer.key}`"
      :data-textarea-source="layer.key"
      :data-demo-review-layer="layer.key"
    >
      <header class="demo-textarea-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <section class="demo-textarea-foundation">
        <header class="demo-textarea-subsection__header">
          <h5>基礎性質</h5>
          <p>先檢查 rows 與 hard floor，再檢查流體寬度及內部解剖。</p>
        </header>

        <div class="demo-textarea-contracts" aria-label="Textarea 尺寸責任">
          <span>Hard floor · 2 × Field height</span>
          <span>Default rows · 3</span>
          <span>Width · 100% parent／min 0／max none</span>
          <span>{{ layer.floor }}</span>
        </div>

        <div class="demo-textarea-height-list">
          <article
            v-for="heightCase in layer.heightCases"
            :key="heightCase[0]"
            class="demo-textarea-height"
            :class="`demo-textarea-height--${heightCase[0]}`"
            :data-textarea-height-case="heightCase[0]"
            :data-textarea-rows="heightCase[1]"
          >
            <h6>{{ heightCase[2] }}</h6>
            <UiTextarea
              :id="`demo-textarea-${layer.key}-height-${heightCase[0]}`"
              v-model="values[layer.key].heights[heightCase[0]]"
              :label="`${heightCase[2]}高度檢查`"
              :rows="heightCase[1]"
              label-hidden
            />
            <p>{{ heightCase[3] }}</p>
          </article>
        </div>

        <section class="demo-textarea-width-block">
          <h6>Width responsibility · parent-owned</h6>
          <div class="demo-textarea-width-list">
            <article
              v-for="widthCase in WIDTH_CASES"
              :key="widthCase[0]"
              class="demo-textarea-width"
              :class="`demo-textarea-width--${widthCase[0]}`"
              :data-textarea-width="widthCase[0]"
            >
              <UiTextarea
                :id="`demo-textarea-${layer.key}-width-${widthCase[0]}`"
                v-model="values[layer.key].widths[widthCase[0]]"
                :label="`${widthCase[1]}寬度檢查`"
                :rows="2"
                label-hidden
              />
              <span>{{ widthCase[1] }}</span>
            </article>
          </div>
        </section>

        <section class="demo-textarea-anatomy-block">
          <h6>Block／inline anatomy · no slots</h6>
          <div class="demo-textarea-anatomy">
            <div class="demo-textarea-anatomy__block-rail" aria-hidden="true">
              <span data-textarea-anatomy="top"></span>
              <span data-textarea-anatomy="content"></span>
              <span data-textarea-anatomy="bottom"></span>
            </div>
            <div class="demo-textarea-anatomy__control">
              <UiTextarea
                :id="`demo-textarea-${layer.key}-anatomy`"
                v-model="values[layer.key].anatomy"
                label="Textarea anatomy"
                :rows="3"
                label-hidden
                readonly
              />
              <div
                class="demo-textarea-anatomy__inline-rail"
                aria-hidden="true"
              >
                <span data-textarea-anatomy="inline"></span>
              </div>
            </div>
          </div>
          <dl class="demo-textarea-reference">
            <div>
              <dt>Padding</dt>
              <dd>4 CSS px block · 8 CSS px inline</dd>
            </div>
            <div>
              <dt>Text flow</dt>
              <dd>Soft wrap · native vertical overflow</dd>
            </div>
            <div>
              <dt>Resize</dt>
              <dd>Resize · vertical／consumer may constrain</dd>
            </div>
            <div>
              <dt>Height ceiling</dt>
              <dd>Max none · consumer owns</dd>
            </div>
          </dl>
        </section>
      </section>

      <section class="demo-textarea-content-review">
        <header class="demo-textarea-subsection__header">
          <h5>內容行為</h5>
          <p>名稱與規格留在 control 外，Textarea 本身只承載可編輯內容。</p>
        </header>
        <div class="demo-textarea-content-list">
          <article
            v-for="content in CONTENT_CASES"
            :key="content.key"
            class="demo-textarea-content"
            :data-textarea-content="content.key"
          >
            <h6>{{ content.label }}</h6>
            <UiTextarea
              :id="`demo-textarea-${layer.key}-content-${content.key}`"
              v-model="values[layer.key].content[content.key]"
              :label="`${content.label}內容檢查`"
              :placeholder="content.placeholder"
              :maxlength="content.maxlength"
              :dir="content.dir"
              :rows="3"
              label-hidden
            />
            <p>{{ content.contract }}</p>
          </article>
        </div>
      </section>

      <section class="demo-textarea-state-review">
        <header class="demo-textarea-subsection__header">
          <h5>狀態外觀與覆蓋</h5>
          <p>
            Readonly 使用跨 Field 家族核定的 quiet surface，保留選取、複製與
            keyboard focus。
          </p>
        </header>
        <div class="demo-textarea-state-list">
          <article
            v-for="state in STATES"
            :key="state.key"
            class="demo-textarea-state"
            :data-textarea-state="state.key"
          >
            <h6>{{ state.label }}</h6>
            <UiTextarea
              :id="`demo-textarea-${layer.key}-state-${state.key}`"
              v-model="values[layer.key].states[state.key]"
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

        <UiScrollRegion
          class="demo-textarea-coverage"
          axis="horizontal"
          data-textarea-coverage-matrix
          tabindex="0"
          aria-label="Textarea 狀態樣式覆蓋矩陣"
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
                  :data-textarea-coverage="`${layer.key}-${state.key}-${STATE_COLUMNS[index][0]}`"
                  :data-coverage-status="coverage[0]"
                >
                  {{ coverage[1] }}
                </td>
              </tr>
            </tbody>
          </table>
        </UiScrollRegion>
      </section>

      <section class="demo-textarea-api">
        <h5>Public contract</h5>
        <dl>
          <div>
            <dt>Value</dt>
            <dd>modelValue → update:modelValue</dd>
          </div>
          <div>
            <dt>Multiline</dt>
            <dd>rows · maxlength · dir · placeholder</dd>
          </div>
          <div>
            <dt>Browser</dt>
            <dd>autocomplete · readonly · native attrs</dd>
          </div>
          <div>
            <dt>Field</dt>
            <dd>label · hint · error · invalid</dd>
          </div>
        </dl>
        <p>No size prop · No min／max width or height token · No slots</p>
      </section>
    </section>
  </div>
</template>

<style scoped>
.demo-textarea-appearance {
  display: grid;
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-textarea-appearance__intro,
.demo-textarea-layer__header h4,
.demo-textarea-layer__header p,
.demo-textarea-subsection__header h5,
.demo-textarea-subsection__header p,
.demo-textarea-height h6,
.demo-textarea-height p,
.demo-textarea-anatomy-block h6,
.demo-textarea-width-block h6,
.demo-textarea-content h6,
.demo-textarea-content p,
.demo-textarea-state h6,
.demo-textarea-api h5,
.demo-textarea-api p {
  margin: 0;
}

.demo-textarea-appearance__intro,
.demo-textarea-layer__header p,
.demo-textarea-subsection__header p,
.demo-textarea-height p,
.demo-textarea-content p,
.demo-textarea-api p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-textarea-appearance__intro {
  max-width: 76ch;
}

.demo-textarea-appearance__intro strong,
.demo-textarea-layer__header h4,
.demo-textarea-subsection__header h5,
.demo-textarea-height h6,
.demo-textarea-anatomy-block h6,
.demo-textarea-width-block h6,
.demo-textarea-content h6,
.demo-textarea-state h6,
.demo-textarea-api h5 {
  color: var(--ui-color-text);
}

.demo-textarea-layer {
  min-width: 0;
}

.demo-textarea-layer__header,
.demo-textarea-subsection__header {
  display: grid;
  grid-template-columns: minmax(12rem, 16rem) minmax(0, 1fr);
  gap: var(--ui-space-4);
}

.demo-textarea-layer__header {
  align-items: end;
  padding-block: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border-strong);
}

.demo-textarea-layer__header h4 {
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-heading);
}

.demo-textarea-foundation,
.demo-textarea-content-review,
.demo-textarea-state-review,
.demo-textarea-api {
  margin-top: var(--ui-space-4);
}

.demo-textarea-subsection__header {
  align-items: baseline;
  margin-bottom: var(--ui-space-3);
}

.demo-textarea-subsection__header h5,
.demo-textarea-height h6,
.demo-textarea-anatomy-block h6,
.demo-textarea-width-block h6,
.demo-textarea-content h6,
.demo-textarea-state h6,
.demo-textarea-api h5 {
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-textarea-contracts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--ui-space-2);
}

.demo-textarea-contracts span {
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-textarea-height-list,
.demo-textarea-content-list,
.demo-textarea-state-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
  gap: var(--ui-space-4);
}

.demo-textarea-height-list {
  align-items: start;
  margin-top: var(--ui-space-4);
}

.demo-textarea-height,
.demo-textarea-content,
.demo-textarea-state {
  min-width: 0;
}

.demo-textarea-height h6,
.demo-textarea-content h6,
.demo-textarea-state h6 {
  margin-bottom: var(--ui-space-2);
}

.demo-textarea-content p {
  margin-top: var(--ui-space-1);
}

.demo-textarea-height p {
  margin-top: var(--ui-space-1);
}

.demo-textarea-height--compact-floor {
  --ui-field-height: 2rem;
}

.demo-textarea-width-block,
.demo-textarea-anatomy-block {
  margin-top: var(--ui-space-4);
  padding-top: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-textarea-width-list {
  display: grid;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-3);
}

.demo-textarea-width {
  min-width: 0;
  padding: var(--ui-space-2);
  border: var(--ui-border-width) dashed var(--ui-color-border-strong);
}

.demo-textarea-width > span {
  display: block;
  margin-top: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-textarea-width--narrow {
  width: min(12rem, 100%);
}

.demo-textarea-width--reference {
  width: min(20rem, 100%);
}

.demo-textarea-width--fluid {
  width: 100%;
}

.demo-textarea-anatomy {
  display: grid;
  grid-template-columns: var(--ui-space-1) minmax(0, 1fr);
  align-items: stretch;
  gap: var(--ui-space-2);
  width: min(36rem, 100%);
  margin-top: var(--ui-space-3);
}

.demo-textarea-anatomy__block-rail {
  display: grid;
  grid-template-rows: 0.25rem minmax(0, 1fr) 0.25rem;
  gap: var(--ui-border-width);
}

.demo-textarea-anatomy__control {
  min-width: 0;
}

.demo-textarea-anatomy__block-rail span,
.demo-textarea-anatomy__inline-rail span {
  background: var(--ui-color-warning);
}

.demo-textarea-anatomy__block-rail span:nth-child(2) {
  background: var(--ui-color-border-strong);
}

.demo-textarea-anatomy__inline-rail {
  display: grid;
  grid-template-columns: 0.5rem minmax(0, 1fr) 0.5rem;
  height: var(--ui-space-1);
  margin-top: var(--ui-space-2);
}

.demo-textarea-anatomy__inline-rail::before,
.demo-textarea-anatomy__inline-rail::after {
  content: '';
  background: var(--ui-color-warning);
}

.demo-textarea-anatomy__inline-rail span {
  background: var(--ui-color-border-strong);
}

.demo-textarea-reference,
.demo-textarea-api dl {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr));
  gap: var(--ui-space-2);
  margin: var(--ui-space-3) 0 0;
}

.demo-textarea-reference dt,
.demo-textarea-api dt {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-textarea-reference dd,
.demo-textarea-api dd {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-textarea-coverage {
  min-width: 0;
  margin-top: var(--ui-space-4);
  outline: none;
}

.demo-textarea-coverage:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-textarea-coverage table {
  width: 100%;
  min-width: 44rem;
  border-collapse: collapse;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-textarea-coverage th,
.demo-textarea-coverage td {
  padding: var(--ui-space-2);
  border-block: var(--ui-border-width) solid var(--ui-color-border);
  text-align: start;
}

.demo-textarea-coverage th {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-textarea-coverage td[data-coverage-status='complete'] {
  color: var(--ui-color-success);
}

.demo-textarea-coverage td[data-coverage-status='review'] {
  color: var(--ui-color-warning);
}

.demo-textarea-coverage td[data-coverage-status='pending'] {
  color: var(--ui-color-danger);
}

.demo-textarea-api {
  padding-top: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-textarea-api p {
  margin-top: var(--ui-space-3);
}

.demo-textarea-layer--candidate :deep(.ui-field__label) {
  -webkit-user-select: none;
  user-select: none;
}

.demo-textarea-layer--candidate
  .demo-textarea-state[data-textarea-state='hover']
  :deep(.ui-textarea) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-bg-hover);
}

.demo-textarea-layer--candidate
  .demo-textarea-state[data-textarea-state='focus']
  :deep(.ui-textarea),
.demo-textarea-layer--current
  .demo-textarea-state[data-textarea-state='focus']
  :deep(.ui-textarea) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-textarea-layer--candidate
  .demo-textarea-state[data-textarea-state='invalid']
  :deep(.ui-textarea),
.demo-textarea-layer--current
  .demo-textarea-state[data-textarea-state='invalid']
  :deep(.ui-textarea) {
  border-color: var(--ui-field-border-invalid);
}

.demo-textarea-layer--candidate
  .demo-textarea-state[data-textarea-state='disabled']
  :deep(.ui-textarea) {
  -webkit-user-select: none;
  user-select: none;
}

.demo-textarea-layer--candidate
  .demo-textarea-state[data-textarea-state='readonly']
  :deep(.ui-textarea) {
  background: var(--ui-field-bg-readonly);
  border-color: var(--ui-field-border);
}

.demo-textarea-layer--current {
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

:global(:root[data-ui-theme='light'] .demo-textarea-layer--current) {
  --ui-field-bg: #edf2ef;
  --ui-field-bg-hover: #e4ece8;
  --ui-field-fg: #1f2328;
  --ui-field-placeholder: #69747a;
  --ui-field-border: #d8ded9;
  --ui-field-border-hover: #b9c4c0;
  --ui-field-border-invalid: #bd5961;
  --ui-color-focus: #d26a45;
}

.demo-textarea-layer--current
  .demo-textarea-state[data-textarea-state='hover']
  :deep(.ui-textarea) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-bg-hover);
}

@container (max-width: 48rem) {
  .demo-textarea-layer__header,
  .demo-textarea-subsection__header {
    grid-template-columns: 1fr;
  }
}
</style>
