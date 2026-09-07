<script setup>
import { reactive } from 'vue';
import UiSelect from '../ui/UiSelect.vue';
import DemoCandidateSelect from './DemoCandidateSelect.vue';

const WIDTH_CASES = [
  ['narrow', 'Narrow parent · 12rem'],
  ['reference', 'Reference parent · 20rem'],
  ['fluid', 'Fluid parent · 100%'],
];

const RECIPE_OPTIONS = [
  { value: 'quick', label: '快速處理' },
  { value: 'general', label: '一般處理' },
  { value: 'benchmark', label: '尚未開放／Unavailable', disabled: true },
];

const NUMBER_OPTIONS = [
  { value: 72, label: '72 percent' },
  { value: 88, label: '88 percent' },
];

const CONTENT_CASES = [
  {
    key: 'placeholder',
    label: 'Placeholder',
    value: '',
    placeholder: '請選擇輸出裝置',
    options: RECIPE_OPTIONS,
    candidateNote: 'Placeholder · muted closed lane／hidden from native popup',
    currentNote: 'Disabled empty option · closed lane uses value foreground',
  },
  {
    key: 'long-cjk',
    label: 'Long CJK',
    value: 'cjk',
    options: [
      {
        value: 'cjk',
        label: '東京事変／椎名林檎／非常に長い日本語の選択肢',
      },
      ...RECIPE_OPTIONS,
    ],
    candidateNote: 'Closed：ellipsis；hover／focus 顯示完整值',
    currentNote: 'Closed：native clipping；popup 寬度由 UA 決定',
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
      ...RECIPE_OPTIONS,
    ],
    candidateNote: 'Closed：ellipsis；靜態完整值提示，不跑馬燈',
    currentNote: 'Closed：native clipping；popup 可配合最長 option 加寬',
  },
  {
    key: 'multilingual',
    label: 'Multilingual',
    value: 'mixed',
    options: [
      {
        value: 'mixed',
        label: '繁體中文／日本語／한국어／English',
      },
      ...RECIPE_OPTIONS,
    ],
    note: 'Windows system fallback stack',
  },
  {
    key: 'number',
    label: 'Number value',
    value: 72,
    options: NUMBER_OPTIONS,
    note: 'update 保留 number 型別',
  },
  {
    key: 'disabled-option',
    label: 'Disabled option',
    value: 'quick',
    options: RECIPE_OPTIONS,
    note: 'popup 內由 native option disabled 呈現',
  },
];

const STATE_COLUMNS = [
  ['surface', 'Surface'],
  ['border', 'Border／focus'],
  ['value', 'Value lane'],
  ['indicator', 'Indicator'],
  ['native', 'Native semantics'],
];

const STATES = [
  {
    key: 'default',
    label: 'Default',
    value: '',
    placeholder: '選擇配方',
    candidate: [
      ['base', 'Base'],
      ['base', 'Base'],
      ['complete', 'Placeholder · muted'],
      ['complete', 'ChevronDown'],
      ['base', 'Empty'],
    ],
    current: [
      ['base', 'Base'],
      ['base', 'Base'],
      ['pending', 'Option · value fg'],
      ['complete', 'Native'],
      ['complete', 'Empty'],
    ],
  },
  {
    key: 'filled',
    label: 'Filled',
    value: 'general',
    candidate: [
      ['base', 'Base'],
      ['base', 'Base'],
      ['complete', 'Selected'],
      ['complete', 'ChevronDown'],
      ['complete', 'Value'],
    ],
    current: [
      ['base', 'Base'],
      ['base', 'Base'],
      ['complete', 'Selected'],
      ['complete', 'Native'],
      ['complete', 'Value'],
    ],
  },
  {
    key: 'hover',
    label: 'Hover',
    value: 'general',
    candidate: [
      ['complete', 'Hover'],
      ['complete', 'Strong'],
      ['complete', 'Selected'],
      ['complete', 'ChevronDown'],
      ['complete', 'Pointer'],
    ],
    current: [
      ['complete', 'Hover'],
      ['complete', 'Strong'],
      ['complete', 'Selected'],
      ['complete', 'Native'],
      ['complete', 'Pointer'],
    ],
  },
  {
    key: 'focus',
    label: 'Focus-visible',
    value: 'general',
    candidate: [
      ['base', 'Base'],
      ['complete', 'Indigo ring'],
      ['complete', 'Selected'],
      ['complete', 'ChevronDown'],
      ['complete', 'Keyboard'],
    ],
    current: [
      ['base', 'Base'],
      ['complete', 'Coral ring'],
      ['complete', 'Selected'],
      ['complete', 'Native'],
      ['complete', 'Keyboard'],
    ],
  },
  {
    key: 'invalid',
    label: 'Invalid',
    value: '',
    placeholder: '選擇配方',
    invalid: true,
    candidate: [
      ['base', 'Base'],
      ['complete', 'Danger'],
      ['complete', 'Placeholder · muted'],
      ['complete', 'ChevronDown'],
      ['complete', 'aria-invalid'],
    ],
    current: [
      ['base', 'Base'],
      ['complete', 'Danger'],
      ['pending', 'Option · value fg'],
      ['complete', 'Native'],
      ['complete', 'aria-invalid'],
    ],
  },
  {
    key: 'required',
    label: 'Required',
    value: '',
    placeholder: '必填選項',
    required: true,
    candidate: [
      ['base', 'Base'],
      ['base', 'Base'],
      ['complete', 'Placeholder · muted'],
      ['complete', 'ChevronDown'],
      ['complete', 'required'],
    ],
    current: [
      ['base', 'Base'],
      ['base', 'Base'],
      ['pending', 'Option · value fg'],
      ['complete', 'Native'],
      ['complete', 'required'],
    ],
  },
  {
    key: 'disabled',
    label: 'Disabled',
    value: 'general',
    disabled: true,
    candidate: [
      ['complete', '50%'],
      ['base', 'Base'],
      ['complete', 'Selected'],
      ['complete', 'Disabled icon'],
      ['complete', 'disabled'],
    ],
    current: [
      ['complete', '50%'],
      ['base', 'Base'],
      ['complete', 'Selected'],
      ['complete', 'Native'],
      ['complete', 'disabled'],
    ],
  },
];

const LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 候選 Select',
    note: '自有 closed indicator、ellipsis 與 overflow tooltip；popup 寬度仍由 Chromium／Windows 決定。',
    component: DemoCandidateSelect,
    sizes: [
      ['standard', 'Standard · 36 CSS px', 'Windows Chromium rendered · 36'],
      ['compact', 'Compact · 32 CSS px', 'Windows Chromium rendered · 32'],
    ],
  },
  {
    key: 'current',
    title: '現行 UiSelect',
    note: '以 active token 與 native color-scheme 快照呈現，避免被 F8 候選值污染。',
    component: UiSelect,
    sizes: [
      [
        'active',
        'Active token floor · 30 CSS px',
        'Windows Chromium rendered · 31（native intrinsic floor）',
      ],
    ],
  },
];

const values = reactive(
  Object.fromEntries(
    LAYERS.map((layer) => [
      layer.key,
      {
        sizes: Object.fromEntries(layer.sizes.map(([key]) => [key, 'general'])),
        widths: Object.fromEntries(
          WIDTH_CASES.map(([key]) => [key, 'general']),
        ),
        anatomy: 'general',
        anatomyError: '',
        content: Object.fromEntries(
          CONTENT_CASES.map((content) => [content.key, content.value]),
        ),
        states: Object.fromEntries(
          STATES.map((state) => [state.key, state.value]),
        ),
        validationHint: 'general',
        validationError: '',
      },
    ]),
  ),
);

function coverageFor(layer, state) {
  return state[layer.key];
}
</script>

<template>
  <div class="demo-select-appearance">
    <p class="demo-select-appearance__intro">
      <strong>Select 使用 Field family 的外框與驗證語法。</strong>
      Candidate 接管 closed indicator 與文字層級；Current 保留 Windows Chromium
      native indicator。兩者的 popup 都維持原生且不承諾與 control 同寬；Select
      沒有 native readonly。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-select-layer"
      :class="`demo-select-layer--${layer.key}`"
      :data-select-source="layer.key"
      :data-demo-review-layer="layer.key"
    >
      <header class="demo-select-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <section class="demo-select-foundation">
        <header class="demo-select-subsection__header">
          <h5>基礎尺寸與寬度</h5>
          <p>Control 高度來自 Field；寬度及任何上限都由 parent layout 擁有。</p>
        </header>

        <div class="demo-select-contracts" aria-label="Select 尺寸責任">
          <span>Width · 100% parent／min 0／max none</span>
          <span>Height · Field token／no size prop</span>
          <span>{{
            layer.key === 'candidate'
              ? 'Value · single line／ellipsis／overflow tooltip'
              : 'Value · single line／native clipping'
          }}</span>
        </div>

        <div class="demo-select-size-list">
          <article
            v-for="size in layer.sizes"
            :key="size[0]"
            class="demo-select-size"
            :class="`demo-select-size--${size[0]}`"
            :data-select-size="size[0]"
          >
            <h6>{{ size[1] }}</h6>
            <component
              :is="layer.component"
              :id="`demo-select-${layer.key}-size-${size[0]}`"
              v-model="values[layer.key].sizes[size[0]]"
              :label="`${size[1]} 高度檢查`"
              :options="RECIPE_OPTIONS"
              label-hidden
            />
            <p>{{ size[2] }}</p>
          </article>
        </div>

        <section class="demo-select-width-block">
          <h6>Parent width fixtures · not component tokens</h6>
          <div class="demo-select-width-list">
            <article
              v-for="width in WIDTH_CASES"
              :key="width[0]"
              class="demo-select-width"
              :class="`demo-select-width--${width[0]}`"
              :data-select-width="width[0]"
            >
              <component
                :is="layer.component"
                :id="`demo-select-${layer.key}-width-${width[0]}`"
                v-model="values[layer.key].widths[width[0]]"
                :label="`${width[1]} 寬度檢查`"
                :options="RECIPE_OPTIONS"
                label-hidden
              />
              <span>{{ width[1] }}</span>
            </article>
          </div>
        </section>
      </section>

      <section class="demo-select-anatomy-block">
        <header class="demo-select-subsection__header">
          <h5>Owned anatomy</h5>
          <p>
            Field 擁有 label／support；Select 擁有 closed control。Candidate
            接管 indicator，popup 與語意仍維持 native。
          </p>
        </header>

        <div class="demo-select-anatomy">
          <div class="demo-select-anatomy__specimens">
            <component
              :is="layer.component"
              :id="`demo-select-${layer.key}-anatomy-hint`"
              v-model="values[layer.key].anatomy"
              label="分離配方"
              :options="RECIPE_OPTIONS"
              hint="Hint · 選項可個別停用。"
            />
            <component
              :is="layer.component"
              :id="`demo-select-${layer.key}-anatomy-error`"
              v-model="values[layer.key].anatomyError"
              label="輸出裝置"
              :options="RECIPE_OPTIONS"
              placeholder="請選擇裝置"
              error="Error · 請選擇可用裝置。"
              required
            />
          </div>
          <ol class="demo-select-anatomy__map" aria-label="Select anatomy map">
            <li data-select-anatomy="label">
              <b>1</b><span>Label／required marker</span>
            </li>
            <li data-select-anatomy="selected-value">
              <b>2</b
              ><span>{{
                layer.key === 'candidate'
                  ? 'Selected-value lane · ellipsis／hover-focus full value'
                  : 'Selected-value lane · single line／native clipping'
              }}</span>
            </li>
            <li data-select-anatomy="indicator">
              <b>3</b
              ><span>{{
                layer.key === 'candidate'
                  ? 'Candidate closed indicator · project-owned'
                  : 'Current Chromium／Windows native indicator'
              }}</span>
            </li>
            <li data-select-anatomy="hint">
              <b>4</b><span>Hint · UiField support region</span>
            </li>
            <li data-select-anatomy="error">
              <b>5</b><span>Error replaces Hint · alert</span>
            </li>
          </ol>
        </div>

        <dl class="demo-select-reference">
          <div>
            <dt>Closed control</dt>
            <dd>Field surface／border／padding · UiSelect styled</dd>
          </div>
          <div>
            <dt>Trailing affordance</dt>
            <dd>
              {{
                layer.key === 'candidate'
                  ? 'Project-owned ChevronDown · 12px end inset'
                  : 'Chromium／Windows native indicator'
              }}
            </dd>
          </div>
          <div>
            <dt>Open menu</dt>
            <dd>Native popup · UA-owned width／may fit longest option</dd>
          </div>
          <div>
            <dt>Decision gate</dt>
            <dd>
              {{
                layer.key === 'candidate'
                  ? 'Closed truncate／tooltip 可控；popup／semantics 維持 native'
                  : 'Current 快照不套用 Candidate indicator／option 樣式'
              }}
            </dd>
          </div>
        </dl>
      </section>

      <section class="demo-select-content-review">
        <header class="demo-select-subsection__header">
          <h5>內容行為</h5>
          <p>使用真實 option 與受控值；說明文字留在 control 外。</p>
        </header>
        <div class="demo-select-content-list">
          <article
            v-for="content in CONTENT_CASES"
            :key="content.key"
            class="demo-select-content"
            :data-select-content="content.key"
          >
            <h6>{{ content.label }}</h6>
            <component
              :is="layer.component"
              :id="`demo-select-${layer.key}-content-${content.key}`"
              v-model="values[layer.key].content[content.key]"
              :label="`${content.label} 內容檢查`"
              :options="content.options"
              :placeholder="content.placeholder"
              label-hidden
            />
            <p>{{ content[`${layer.key}Note`] ?? content.note }}</p>
          </article>
        </div>
      </section>

      <section class="demo-select-state-review">
        <header class="demo-select-subsection__header">
          <h5>狀態外觀與覆蓋</h5>
          <p>Required pristine 不自動報錯；Hover／Focus 為靜態比較標本。</p>
        </header>
        <div class="demo-select-state-list">
          <article
            v-for="state in STATES"
            :key="state.key"
            class="demo-select-state"
            :data-select-state="state.key"
          >
            <h6>{{ state.label }}</h6>
            <component
              :is="layer.component"
              :id="`demo-select-${layer.key}-state-${state.key}`"
              v-model="values[layer.key].states[state.key]"
              :label="`${state.label} 狀態檢查`"
              :options="RECIPE_OPTIONS"
              :placeholder="state.placeholder"
              :invalid="state.invalid"
              :required="state.required"
              :disabled="state.disabled"
              label-hidden
            />
          </article>
        </div>

        <div
          class="demo-select-coverage"
          data-select-coverage-matrix
          tabindex="0"
          aria-label="Select 狀態樣式覆蓋矩陣"
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
                  :data-select-coverage="`${layer.key}-${state.key}-${STATE_COLUMNS[index][0]}`"
                  :data-coverage-status="coverage[0]"
                >
                  {{ coverage[1] }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="demo-select-validation">
        <header class="demo-select-subsection__header">
          <h5>Hint → Error 與 ARIA</h5>
          <p>Auto 為預設；Error 取代 Hint，Reserved 仍是 layout-owned 候選。</p>
        </header>
        <div class="demo-select-validation__replacement">
          <article>
            <span>Hint／valid</span>
            <component
              :is="layer.component"
              :id="`demo-select-${layer.key}-validation-hint`"
              v-model="values[layer.key].validationHint"
              label="配方"
              :options="RECIPE_OPTIONS"
              hint="可稍後再調整。"
              aria-describedby="select-external-note"
              :name="`demo-select-${layer.key}-recipe`"
              autocomplete="off"
              data-contract="native-forwarding"
            />
          </article>
          <b aria-hidden="true">→</b>
          <article>
            <span>Error／invalid</span>
            <component
              :is="layer.component"
              :id="`demo-select-${layer.key}-validation-error`"
              v-model="values[layer.key].validationError"
              label="配方"
              :options="RECIPE_OPTIONS"
              placeholder="選擇配方"
              hint="可稍後再調整。"
              error="請選擇可用配方。"
              aria-describedby="select-external-note"
              required
            />
          </article>
        </div>
        <p class="demo-select-validation__note">
          External id 先保留，Field 再附加 active Hint 或 Error id；不新增
          UiField reserved API。
        </p>
      </section>

      <section class="demo-select-api">
        <h5>Public contract</h5>
        <dl>
          <div>
            <dt>Value</dt>
            <dd>String／Number modelValue → typed update:modelValue</dd>
          </div>
          <div>
            <dt>Options</dt>
            <dd>options · placeholder · disabled option</dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>required · disabled · invalid</dd>
          </div>
          <div>
            <dt>Browser</dt>
            <dd>name · autocomplete · native attrs</dd>
          </div>
          <div>
            <dt>Field</dt>
            <dd>label · hint · error · aria-describedby</dd>
          </div>
          <div>
            <dt>Imperative</dt>
            <dd>focus() · bounded native-control access</dd>
          </div>
        </dl>
        <p>
          {{
            layer.key === 'candidate'
              ? 'Custom closed indicator／overflow tooltip · No marquee · No readonly prop · No size prop · No custom popup'
              : 'No readonly prop · No size prop · No custom popup'
          }}
        </p>
      </section>
    </section>
  </div>
</template>

<style scoped>
.demo-select-appearance {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-select-appearance__intro,
.demo-select-layer__header h4,
.demo-select-layer__header p,
.demo-select-subsection__header h5,
.demo-select-subsection__header p,
.demo-select-size h6,
.demo-select-width-block h6,
.demo-select-content h6,
.demo-select-content p,
.demo-select-size p,
.demo-select-state h6,
.demo-select-validation__note,
.demo-select-api h5,
.demo-select-api p {
  margin: 0;
}

.demo-select-appearance__intro,
.demo-select-layer__header p,
.demo-select-subsection__header p,
.demo-select-content p,
.demo-select-size p,
.demo-select-validation__note,
.demo-select-api p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-select-appearance__intro {
  max-width: 76ch;
}

.demo-select-appearance__intro strong,
.demo-select-layer__header h4,
.demo-select-subsection__header h5,
.demo-select-size h6,
.demo-select-width-block h6,
.demo-select-content h6,
.demo-select-state h6,
.demo-select-api h5 {
  color: var(--ui-color-text);
}

.demo-select-layer {
  min-width: 0;
}

.demo-select-layer__header,
.demo-select-subsection__header {
  display: grid;
  grid-template-columns: minmax(12rem, 16rem) minmax(0, 1fr);
  gap: var(--ui-space-4);
}

.demo-select-layer__header {
  align-items: end;
  padding-block: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border-strong);
}

.demo-select-layer__header h4 {
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-heading);
}

.demo-select-foundation,
.demo-select-anatomy-block,
.demo-select-content-review,
.demo-select-state-review,
.demo-select-validation,
.demo-select-api {
  margin-top: var(--ui-space-4);
}

.demo-select-subsection__header {
  align-items: baseline;
  margin-bottom: var(--ui-space-3);
}

.demo-select-subsection__header h5,
.demo-select-size h6,
.demo-select-width-block h6,
.demo-select-content h6,
.demo-select-state h6,
.demo-select-api h5 {
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-select-contracts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--ui-space-2);
}

.demo-select-contracts span {
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-select-size-list,
.demo-select-content-list,
.demo-select-state-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
  gap: var(--ui-space-4);
}

.demo-select-size-list {
  align-items: start;
  margin-top: var(--ui-space-4);
}

.demo-select-size,
.demo-select-content,
.demo-select-state {
  min-width: 0;
}

.demo-select-size h6,
.demo-select-content h6,
.demo-select-state h6 {
  margin-bottom: var(--ui-space-2);
}

.demo-select-content p {
  margin-top: var(--ui-space-1);
}

.demo-select-size p {
  margin-top: var(--ui-space-1);
}

.demo-select-size--standard {
  --ui-field-height: 2.25rem;
}

.demo-select-size--compact {
  --ui-field-height: 2rem;
}

.demo-select-size--active {
  --ui-field-height: 1.875rem;
}

.demo-select-width-block,
.demo-select-anatomy-block,
.demo-select-content-review,
.demo-select-state-review,
.demo-select-validation,
.demo-select-api {
  padding-top: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-select-width-list {
  display: grid;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-3);
}

.demo-select-width {
  min-width: 0;
  padding: var(--ui-space-2);
  border: var(--ui-border-width) dashed var(--ui-color-border-strong);
}

.demo-select-width > span {
  display: block;
  margin-top: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-select-width--narrow {
  width: min(12rem, 100%);
}

.demo-select-width--reference {
  width: min(20rem, 100%);
}

.demo-select-width--fluid {
  width: 100%;
}

.demo-select-anatomy {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(14rem, 0.7fr);
  gap: var(--ui-space-4);
}

.demo-select-anatomy__specimens,
.demo-select-anatomy__map {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-3);
}

.demo-select-anatomy__map {
  margin: 0;
  padding: 0;
  list-style: none;
}

.demo-select-anatomy__map li {
  min-width: 0;
  display: grid;
  grid-template-columns: var(--ui-space-5) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-select-anatomy__map b {
  color: var(--ui-color-accent);
  font-variant-numeric: tabular-nums;
}

.demo-select-reference,
.demo-select-api dl {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr));
  gap: var(--ui-space-2);
  margin: var(--ui-space-3) 0 0;
}

.demo-select-reference dt,
.demo-select-api dt {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-select-reference dd,
.demo-select-api dd {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-select-coverage {
  min-width: 0;
  margin-top: var(--ui-space-4);
  overflow-x: auto;
  outline: none;
}

.demo-select-coverage:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-select-coverage table {
  width: 100%;
  min-width: 44rem;
  border-collapse: collapse;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-select-coverage th,
.demo-select-coverage td {
  padding: var(--ui-space-2);
  border-block: var(--ui-border-width) solid var(--ui-color-border);
  text-align: start;
}

.demo-select-coverage th {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-select-coverage td[data-coverage-status='complete'] {
  color: var(--ui-color-success);
}

.demo-select-coverage td[data-coverage-status='review'] {
  color: var(--ui-color-warning);
}

.demo-select-coverage td[data-coverage-status='pending'] {
  color: var(--ui-color-danger);
}

.demo-select-validation__replacement {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-3);
}

.demo-select-validation__replacement article {
  min-width: 0;
}

.demo-select-validation__replacement article > span {
  display: block;
  margin-bottom: var(--ui-space-2);
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-select-validation__replacement > b {
  color: var(--ui-color-accent);
}

.demo-select-validation__note,
.demo-select-api p {
  margin-top: var(--ui-space-3);
}

.demo-select-layer--candidate :deep(.ui-field__label) {
  -webkit-user-select: none;
  user-select: none;
}

.demo-select-layer--candidate
  .demo-select-state[data-select-state='disabled']
  :deep(.demo-candidate-select__native) {
  -webkit-user-select: none;
  user-select: none;
}

.demo-select-layer--candidate
  .demo-select-state[data-select-state='hover']
  :deep(.demo-candidate-select__native),
.demo-select-layer--current
  .demo-select-state[data-select-state='hover']
  :deep(.ui-select) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-bg-hover);
}

.demo-select-layer--candidate
  .demo-select-state[data-select-state='focus']
  :deep(.demo-candidate-select__native),
.demo-select-layer--current
  .demo-select-state[data-select-state='focus']
  :deep(.ui-select) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-select-layer--candidate
  .demo-select-state[data-select-state='invalid']
  :deep(.demo-candidate-select__native),
.demo-select-layer--current
  .demo-select-state[data-select-state='invalid']
  :deep(.ui-select) {
  border-color: var(--ui-field-border-invalid);
}

.demo-select-layer--current {
  color-scheme: dark;
  --ui-font-family-base:
    'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui,
    -apple-system, sans-serif;
  --ui-field-height: 1.875rem;
  --ui-field-padding-block: 0.25rem;
  --ui-field-padding-inline: 0.5rem;
  --ui-field-radius: 0.375rem;
  --ui-field-bg: #344046;
  --ui-field-bg-hover: #3a464c;
  --ui-field-fg: #f7f1e7;
  --ui-field-placeholder: #aeb8b6;
  --ui-field-border: #3c4749;
  --ui-field-border-hover: #586568;
  --ui-field-border-invalid: #dd7078;
  --ui-color-focus: #dd7a64;
  --ui-color-danger: #dd7078;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-motion-easing-standard: ease-out;
}

:global(:root[data-ui-theme='light'] .demo-select-layer--current) {
  color-scheme: light;
  --ui-field-bg: #edf2ef;
  --ui-field-bg-hover: #e4ece8;
  --ui-field-fg: #1f2328;
  --ui-field-placeholder: #69747a;
  --ui-field-border: #d8ded9;
  --ui-field-border-hover: #b9c4c0;
  --ui-field-border-invalid: #bd5961;
  --ui-color-focus: #d26a45;
  --ui-color-danger: #bd5961;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
}

@container (max-width: 48rem) {
  .demo-select-layer__header,
  .demo-select-subsection__header,
  .demo-select-anatomy {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-select-layer__header,
  .demo-select-subsection__header {
    gap: var(--ui-space-1);
  }
}

@container (max-width: 32rem) {
  .demo-select-validation__replacement {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-select-validation__replacement > b {
    justify-self: start;
    transform: rotate(90deg);
  }
}
</style>
