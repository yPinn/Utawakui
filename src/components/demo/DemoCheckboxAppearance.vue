<script setup>
import { reactive } from 'vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import DemoCandidateCheckbox from './DemoCandidateCheckbox.vue';

const CONTENT_CASES = [
  {
    key: 'short',
    label: 'Short label',
    value: true,
    text: '包含導唱聲道',
    note: 'Single line · full row remains clickable',
  },
  {
    key: 'long-cjk',
    label: 'Long CJK',
    value: false,
    text: '演出開始後自動切換到下一首並保留目前播放狀態與導唱設定',
    note: 'Label wraps · indicator stays 16px／top aligned',
  },
  {
    key: 'long-latin',
    label: 'Long Latin',
    value: true,
    text: 'Automatically advance to the next performance item while preserving the current guide-vocal setting',
    note: 'Natural wrapping · no ellipsis for consent text',
  },
  {
    key: 'multilingual',
    label: 'Multilingual',
    value: false,
    text: '顯示繁體中文／日本語／한국어／English 的歌詞來源資訊',
    note: 'Windows system fallback stack',
  },
];

const STATES = [
  {
    key: 'unchecked',
    label: 'Unchecked',
    value: false,
    candidate: [
      ['complete', '36px row'],
      ['complete', 'Empty box'],
      ['complete', 'Clickable'],
      ['base', '—'],
      ['complete', 'false'],
    ],
    current: [
      ['pending', 'Intrinsic'],
      ['complete', 'Native empty'],
      ['complete', 'Label'],
      ['base', '—'],
      ['complete', 'false'],
    ],
  },
  {
    key: 'checked',
    label: 'Checked',
    value: true,
    candidate: [
      ['complete', '36px row'],
      ['complete', 'Check'],
      ['complete', 'Clickable'],
      ['base', '—'],
      ['complete', 'true'],
    ],
    current: [
      ['pending', 'Intrinsic'],
      ['complete', 'Native check'],
      ['complete', 'Label'],
      ['base', '—'],
      ['complete', 'true'],
    ],
  },
  {
    key: 'indeterminate',
    label: 'Indeterminate',
    value: false,
    indeterminate: true,
    candidate: [
      ['complete', '36px row'],
      ['complete', 'Minus'],
      ['complete', 'Clickable'],
      ['base', '—'],
      ['complete', 'mixed'],
    ],
    current: [
      ['pending', 'Intrinsic'],
      ['pending', 'No public state'],
      ['complete', 'Label'],
      ['base', '—'],
      ['pending', 'Caller DOM'],
    ],
  },
  {
    key: 'hover',
    label: 'Hover',
    value: false,
    candidate: [
      ['complete', '36px row'],
      ['complete', 'Accent border'],
      ['complete', 'Full row'],
      ['base', '—'],
      ['complete', ':hover'],
    ],
    current: [
      ['pending', 'Intrinsic'],
      ['pending', 'Native only'],
      ['complete', 'Label'],
      ['base', '—'],
      ['complete', ':hover'],
    ],
  },
  {
    key: 'focus',
    label: 'Focus-visible',
    value: true,
    candidate: [
      ['complete', '36px row'],
      ['complete', 'Indigo ring'],
      ['complete', 'Full row'],
      ['base', '—'],
      ['complete', 'Keyboard'],
    ],
    current: [
      ['pending', 'Intrinsic'],
      ['complete', 'Coral ring'],
      ['complete', 'Label'],
      ['base', '—'],
      ['complete', 'Keyboard'],
    ],
  },
  {
    key: 'invalid',
    label: 'Invalid',
    value: false,
    error: '啟用公開輸出前需要確認。',
    invalid: true,
    candidate: [
      ['complete', '36px row'],
      ['complete', 'Danger border'],
      ['complete', 'Required label'],
      ['complete', 'Error'],
      ['complete', 'aria-invalid'],
    ],
    current: [
      ['pending', 'Intrinsic'],
      ['pending', 'No border style'],
      ['complete', 'Required label'],
      ['complete', 'Error'],
      ['complete', 'aria-invalid'],
    ],
  },
  {
    key: 'required',
    label: 'Required pristine',
    value: false,
    required: true,
    candidate: [
      ['complete', '36px row'],
      ['base', 'Empty box'],
      ['complete', 'Marker'],
      ['base', 'Pristine'],
      ['complete', 'required'],
    ],
    current: [
      ['pending', 'Intrinsic'],
      ['complete', 'Native empty'],
      ['complete', 'Marker'],
      ['base', 'Pristine'],
      ['complete', 'required'],
    ],
  },
  {
    key: 'disabled',
    label: 'Disabled',
    value: true,
    disabled: true,
    candidate: [
      ['complete', '36px row'],
      ['complete', '50% row'],
      ['complete', 'Not allowed'],
      ['base', '—'],
      ['complete', 'disabled'],
    ],
    current: [
      ['pending', 'Intrinsic'],
      ['complete', '50% input'],
      ['pending', 'Label full tone'],
      ['base', '—'],
      ['complete', 'disabled'],
    ],
  },
];

const STATE_COLUMNS = [
  ['target', 'Target'],
  ['indicator', 'Indicator'],
  ['label', 'Label'],
  ['feedback', 'Feedback'],
  ['native', 'Native'],
];

const LAYERS = [
  {
    key: 'candidate',
    className: 'demo-checkbox-layer--candidate',
    title: 'Token v2 候選 Checkbox',
    note: 'Native input 擁有互動；project-owned indicator 與 full-row target 只處理可見契約。',
    geometryNote:
      'Visual indicator 固定 16px；Candidate target 隨離散 density 映射。',
    contracts: [
      'Visual indicator · 16 CSS px',
      'Target · full label row',
      'Width · content／parent-owned',
    ],
    component: DemoCandidateCheckbox,
    sizes: [
      ['standard', 'Standard target · 36 CSS px'],
      ['compact', 'Compact target · 32 CSS px'],
    ],
  },
  {
    key: 'current',
    className: 'demo-checkbox-layer--current',
    title: '現行 UiCheckbox',
    note: '16px Windows native checkbox；列高由文字 intrinsic size 決定，沒有 component target floor。',
    geometryNote:
      'Native input／indicator 皆為 16px；label 可點，但間隙與整列沒有 target floor。',
    contracts: [
      'Native input／indicator · 16 CSS px',
      'Target · input＋associated label',
      'Width · intrinsic content',
    ],
    component: UiCheckbox,
    sizes: [['active', 'Current · intrinsic inline row']],
  },
];

const values = reactive(
  Object.fromEntries(
    LAYERS.map((layer) => [
      layer.key,
      {
        sizes: Object.fromEntries(layer.sizes.map(([key]) => [key, false])),
        anatomy: true,
        content: Object.fromEntries(
          CONTENT_CASES.map((content) => [content.key, content.value]),
        ),
        states: Object.fromEntries(
          STATES.map((state) => [state.key, state.value]),
        ),
        mixed: layer.key === 'candidate',
        validationHint: false,
        validationError: false,
      },
    ]),
  ),
);

function coverageFor(layer, state) {
  return state[layer.key];
}
</script>

<template>
  <div class="demo-checkbox-appearance">
    <p class="demo-checkbox-appearance__intro">
      <strong>Checkbox 支援 Boolean／mixed，且沒有 readonly。</strong>
      Candidate 保留 native input，並擴大整列命中區。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-checkbox-layer"
      :class="layer.className"
      :data-checkbox-source="layer.key"
      :data-demo-review-layer="layer.key"
    >
      <header class="demo-checkbox-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <section class="demo-checkbox-geometry">
        <header class="demo-checkbox-subsection__header">
          <h5>尺寸與 target geometry</h5>
          <p>{{ layer.geometryNote }}</p>
        </header>
        <div class="demo-checkbox-contracts" aria-label="Checkbox 尺寸責任">
          <span v-for="contract in layer.contracts" :key="contract">
            {{ contract }}
          </span>
        </div>
        <div class="demo-checkbox-size-list">
          <article
            v-for="size in layer.sizes"
            :key="size[0]"
            class="demo-checkbox-size"
            :class="`demo-checkbox-size--${size[0]}`"
            :data-checkbox-size="size[0]"
          >
            <h6>{{ size[1] }}</h6>
            <component
              :is="layer.component"
              :id="`demo-checkbox-${layer.key}-size-${size[0]}`"
              v-model="values[layer.key].sizes[size[0]]"
              :label="`${size[1]} 切換`"
            />
          </article>
        </div>
      </section>

      <section class="demo-checkbox-anatomy-block">
        <header class="demo-checkbox-subsection__header">
          <h5>Owned anatomy</h5>
          <p>
            UiField 擁有 label／support；Checkbox 擁有 input、indicator 與 row
            hit target。
          </p>
        </header>
        <div class="demo-checkbox-anatomy">
          <component
            :is="layer.component"
            :id="`demo-checkbox-${layer.key}-anatomy`"
            v-model="values[layer.key].anatomy"
            label="包含導唱聲道"
            hint="變更後套用至新加入的曲目。"
          />
          <ol
            class="demo-checkbox-anatomy__map"
            aria-label="Checkbox anatomy map"
          >
            <li data-checkbox-anatomy="input">
              <b>1</b
              ><span>{{
                layer.key === 'candidate'
                  ? 'Native input · full label-row hit target'
                  : 'Native input · 16px hit target'
              }}</span>
            </li>
            <li data-checkbox-anatomy="indicator">
              <b>2</b
              ><span>{{
                layer.key === 'candidate'
                  ? 'Project-owned 16px Check／Minus'
                  : 'Current Windows native checkbox'
              }}</span>
            </li>
            <li data-checkbox-anatomy="label">
              <b>3</b><span>Label／required marker · wraps</span>
            </li>
            <li data-checkbox-anatomy="support">
              <b>4</b><span>Hint or Error · UiField support region</span>
            </li>
          </ol>
        </div>
      </section>

      <section class="demo-checkbox-content-review">
        <header class="demo-checkbox-subsection__header">
          <h5>內容與換行</h5>
          <p>
            Consent／setting labels 保留完整文字並自然換行，不截斷行動語意。
          </p>
        </header>
        <div class="demo-checkbox-content-list">
          <article
            v-for="content in CONTENT_CASES"
            :key="content.key"
            class="demo-checkbox-content"
            :data-checkbox-content="content.key"
          >
            <h6>{{ content.label }}</h6>
            <component
              :is="layer.component"
              :id="`demo-checkbox-${layer.key}-content-${content.key}`"
              v-model="values[layer.key].content[content.key]"
              :label="content.text"
            />
            <p>{{ content.note }}</p>
          </article>
        </div>
      </section>

      <section class="demo-checkbox-state-review">
        <header class="demo-checkbox-subsection__header">
          <h5>狀態外觀與覆蓋</h5>
          <p>
            Indeterminate 是集合摘要投影；Required pristine 不自動顯示 Error。
          </p>
        </header>
        <div class="demo-checkbox-state-list">
          <article
            v-for="state in STATES"
            :key="state.key"
            class="demo-checkbox-state"
            :data-checkbox-state="state.key"
          >
            <h6>{{ state.label }}</h6>
            <component
              :is="layer.component"
              :id="`demo-checkbox-${layer.key}-state-${state.key}`"
              v-model="values[layer.key].states[state.key]"
              :label="state.label"
              :indeterminate="
                layer.key === 'candidate' &&
                state.indeterminate &&
                values[layer.key].mixed
              "
              :invalid="state.invalid"
              :error="state.error"
              :required="state.required || state.invalid"
              :disabled="state.disabled"
              @update:model-value="
                state.indeterminate && (values[layer.key].mixed = false)
              "
            />
          </article>
        </div>

        <div
          class="demo-checkbox-coverage"
          data-checkbox-coverage-matrix
          tabindex="0"
          aria-label="Checkbox 狀態樣式覆蓋矩陣"
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
                  :data-checkbox-coverage="`${layer.key}-${state.key}-${STATE_COLUMNS[index][0]}`"
                  :data-coverage-status="coverage[0]"
                >
                  {{ coverage[1] }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="demo-checkbox-validation">
        <header class="demo-checkbox-subsection__header">
          <h5>Hint → Error 與 ARIA</h5>
          <p>Auto 為預設；Error 取代 Hint，並合併 caller 提供的描述 id。</p>
        </header>
        <div class="demo-checkbox-validation__replacement">
          <article>
            <span>Hint／valid</span>
            <component
              :is="layer.component"
              :id="`demo-checkbox-${layer.key}-validation-hint`"
              v-model="values[layer.key].validationHint"
              label="允許公開顯示曲目資訊"
              hint="只顯示曲名與演出狀態。"
              aria-describedby="checkbox-external-note"
              :name="`demo-checkbox-${layer.key}-consent`"
              value="accepted"
              data-contract="native-forwarding"
            />
          </article>
          <b aria-hidden="true">→</b>
          <article>
            <span>Error／invalid</span>
            <component
              :is="layer.component"
              :id="`demo-checkbox-${layer.key}-validation-error`"
              v-model="values[layer.key].validationError"
              label="確認本次輸出權利"
              hint="啟用公開輸出前確認。"
              error="請先確認本次輸出權利。"
              aria-describedby="checkbox-external-note"
              required
            />
          </article>
        </div>
      </section>

      <section class="demo-checkbox-api">
        <h5>Public contract</h5>
        <dl>
          <div>
            <dt>Value</dt>
            <dd>Boolean modelValue → update:modelValue</dd>
          </div>
          <div>
            <dt>Mixed</dt>
            <dd>
              {{
                layer.key === 'candidate'
                  ? 'indeterminate · caller-owned visual／ARIA projection · clear on selection'
                  : 'No declared indeterminate prop'
              }}
            </dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>required · disabled · invalid</dd>
          </div>
          <div>
            <dt>Browser</dt>
            <dd>name · value · native attrs</dd>
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
              ? 'Custom visual indicator · Native input · No readonly prop · No size prop'
              : 'Native visual indicator · No readonly prop · No size prop'
          }}
        </p>
      </section>
    </section>
  </div>
</template>

<style scoped>
.demo-checkbox-appearance {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-checkbox-appearance__intro,
.demo-checkbox-layer__header h4,
.demo-checkbox-layer__header p,
.demo-checkbox-subsection__header h5,
.demo-checkbox-subsection__header p,
.demo-checkbox-size h6,
.demo-checkbox-content h6,
.demo-checkbox-content p,
.demo-checkbox-state h6,
.demo-checkbox-api h5,
.demo-checkbox-api p {
  margin: 0;
}

.demo-checkbox-appearance__intro {
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.demo-checkbox-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-checkbox-layer {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-5);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-checkbox-layer__header,
.demo-checkbox-subsection__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: baseline;
}

.demo-checkbox-layer__header h4,
.demo-checkbox-subsection__header h5,
.demo-checkbox-size h6,
.demo-checkbox-content h6,
.demo-checkbox-state h6,
.demo-checkbox-api h5 {
  color: var(--ui-color-text);
}

.demo-checkbox-layer__header p,
.demo-checkbox-subsection__header p,
.demo-checkbox-content p,
.demo-checkbox-api p {
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-caption);
}

.demo-checkbox-geometry,
.demo-checkbox-anatomy-block,
.demo-checkbox-content-review,
.demo-checkbox-state-review,
.demo-checkbox-validation,
.demo-checkbox-api {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
}

.demo-checkbox-contracts,
.demo-checkbox-size-list,
.demo-checkbox-content-list,
.demo-checkbox-state-list {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--ui-space-3);
}

.demo-checkbox-contracts span,
.demo-checkbox-size,
.demo-checkbox-content,
.demo-checkbox-state {
  min-width: 0;
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
}

.demo-checkbox-size,
.demo-checkbox-content,
.demo-checkbox-state {
  display: grid;
  align-content: start;
  gap: var(--ui-space-2);
}

.demo-checkbox-size--standard {
  --demo-checkbox-target-size: 2.25rem;
}

.demo-checkbox-size--compact {
  --demo-checkbox-target-size: 2rem;
}

.demo-checkbox-anatomy {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(14rem, 0.7fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}

.demo-checkbox-anatomy__map {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding: 0;
  margin: 0;
  list-style: none;
}

.demo-checkbox-anatomy__map li {
  min-width: 0;
  display: grid;
  grid-template-columns: 1.5rem minmax(0, 1fr);
  gap: var(--ui-space-2);
  align-items: center;
}

.demo-checkbox-anatomy__map b {
  display: grid;
  width: 1.5rem;
  height: 1.5rem;
  place-items: center;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-text);
}

.demo-checkbox-state[data-checkbox-state='hover']
  :deep(.demo-candidate-checkbox__indicator) {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-surface-hover);
}

.demo-checkbox-state[data-checkbox-state='focus']
  :deep(.demo-candidate-checkbox__indicator),
.demo-checkbox-layer--current
  .demo-checkbox-state[data-checkbox-state='focus']
  :deep(.ui-checkbox) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-checkbox-coverage {
  min-width: 0;
  overflow-x: auto;
  border: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-checkbox-coverage table {
  width: 100%;
  min-width: 42rem;
  border-collapse: collapse;
}

.demo-checkbox-coverage th,
.demo-checkbox-coverage td {
  padding: var(--ui-space-2);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  text-align: start;
}

.demo-checkbox-coverage thead th,
.demo-checkbox-coverage tbody th {
  color: var(--ui-color-text);
}

.demo-checkbox-coverage td {
  color: var(--ui-color-text-muted);
}

.demo-checkbox-coverage [data-coverage-status='complete'] {
  color: var(--ui-color-success);
}

.demo-checkbox-coverage [data-coverage-status='pending'] {
  color: var(--ui-color-warning);
}

.demo-checkbox-validation__replacement {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: var(--ui-space-3);
  align-items: start;
}

.demo-checkbox-validation__replacement article {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.demo-checkbox-validation__replacement > b {
  align-self: center;
  color: var(--ui-color-text-muted);
}

.demo-checkbox-api dl {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--ui-space-2) var(--ui-space-4);
  margin: 0;
}

.demo-checkbox-api dl > div {
  min-width: 0;
}

.demo-checkbox-api dt {
  color: var(--ui-color-text-muted);
}

.demo-checkbox-api dd {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text);
}

.demo-checkbox-layer--current {
  color-scheme: dark;
  --ui-font-family-base:
    'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui,
    -apple-system, sans-serif;
  --ui-checkbox-size: 1rem;
  --ui-color-accent: #55a2a7;
  --ui-color-focus: #dd7a64;
  --ui-color-danger: #dd7078;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-opacity-disabled: 0.5;
}

:global(:root[data-ui-theme='light'] .demo-checkbox-layer--current) {
  color-scheme: light;
  --ui-color-accent: #2f777c;
  --ui-color-focus: #d26a45;
  --ui-color-danger: #bd5961;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
}

@container (max-width: 48rem) {
  .demo-checkbox-layer__header,
  .demo-checkbox-subsection__header,
  .demo-checkbox-anatomy {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-checkbox-layer__header,
  .demo-checkbox-subsection__header {
    gap: var(--ui-space-1);
  }
}

@container (max-width: 32rem) {
  .demo-checkbox-validation__replacement {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-checkbox-validation__replacement > b {
    justify-self: start;
    transform: rotate(90deg);
  }
}
</style>
