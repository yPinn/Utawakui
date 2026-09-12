<script setup>
import { reactive } from 'vue';
import UiRange from '../ui/UiRange.vue';
import DemoCandidateRange from './DemoCandidateRange.vue';

function formatPercent(value) {
  return `${value}%`;
}

function formatSignedDecibels(value) {
  const sign = value < 0 ? '−' : value > 0 ? '+' : '';
  return `${sign}${Math.abs(value)} dB`;
}

const WIDTH_CASES = [
  ['narrow', 'Narrow parent · 12rem', 32],
  ['reference', 'Reference parent · 20rem', 64],
  ['fluid', 'Fluid parent · 100%', 72],
];

const CONTENT_CASES = [
  {
    key: 'minimum',
    label: 'Minimum',
    value: 0,
    min: 0,
    max: 100,
    step: 1,
    formatValue: formatPercent,
    note: 'Fill starts at the first thumb center',
  },
  {
    key: 'maximum',
    label: 'Maximum',
    value: 100,
    min: 0,
    max: 100,
    step: 1,
    formatValue: formatPercent,
    note: 'Fill ends at the last thumb center',
  },
  {
    key: 'negative',
    label: 'Negative range',
    value: -12,
    min: -24,
    max: 12,
    step: 1,
    formatValue: formatSignedDecibels,
    note: 'Signed domain · formatted visible value',
  },
  {
    key: 'fractional',
    label: 'Fractional step',
    value: 0.65,
    min: 0.5,
    max: 1.5,
    step: 0.05,
    formatValue: (value) => `${Number(value).toFixed(2)}×`,
    note: 'Number remains numeric through v-model',
  },
  {
    key: 'long-value-text',
    label: 'Long valueText',
    value: 100,
    min: 50,
    max: 150,
    step: 0.1,
    formatValue: (value) =>
      `${value === 100 ? '標準速度' : '速度'}／${Number(value).toFixed(1)} percent`,
    note: 'Narrow Candidate stacks output below the track',
  },
  {
    key: 'native-value',
    label: 'Native value',
    value: 48,
    min: 0,
    max: 100,
    step: 1,
    formatValue: () => '',
    note: 'No valueText · native numeric announcement',
  },
];

const STOP_VALUES = [0, 25, 50, 75, 100];

const STATES = [
  {
    key: 'default',
    label: 'Default',
    value: 50,
    formatValue: formatPercent,
    candidate: [
      ['complete', '36px'],
      ['complete', 'Accent fill'],
      ['complete', '16px'],
      ['complete', '50%'],
      ['complete', 'Numeric'],
    ],
    current: [
      ['pending', '4px input'],
      ['pending', 'Native accent'],
      ['complete', '16px'],
      ['complete', '50%'],
      ['complete', 'Numeric'],
    ],
  },
  {
    key: 'minimum',
    label: 'Minimum',
    value: 0,
    formatValue: formatPercent,
    candidate: [
      ['complete', '36px'],
      ['complete', 'Start bound'],
      ['complete', 'First center'],
      ['complete', '0%'],
      ['complete', 'Home'],
    ],
    current: [
      ['pending', '4px input'],
      ['complete', 'Native bound'],
      ['complete', 'Native thumb'],
      ['complete', '0%'],
      ['complete', 'Home'],
    ],
  },
  {
    key: 'maximum',
    label: 'Maximum',
    value: 100,
    formatValue: formatPercent,
    candidate: [
      ['complete', '36px'],
      ['complete', 'End bound'],
      ['complete', 'Last center'],
      ['complete', '100%'],
      ['complete', 'End'],
    ],
    current: [
      ['pending', '4px input'],
      ['complete', 'Native bound'],
      ['complete', 'Native thumb'],
      ['complete', '100%'],
      ['complete', 'End'],
    ],
  },
  {
    key: 'hover',
    label: 'Hover',
    value: 60,
    formatValue: formatPercent,
    candidate: [
      ['complete', '36px'],
      ['base', 'Stable'],
      ['complete', 'Soft halo'],
      ['complete', '60%'],
      ['complete', ':hover'],
    ],
    current: [
      ['pending', '4px input'],
      ['base', 'Native'],
      ['pending', 'Native only'],
      ['complete', '60%'],
      ['complete', ':hover'],
    ],
  },
  {
    key: 'focus',
    label: 'Focus-visible',
    value: 45,
    formatValue: formatPercent,
    candidate: [
      ['complete', '36px'],
      ['base', 'Stable'],
      ['complete', 'Indigo ring'],
      ['complete', '45%'],
      ['complete', 'Keyboard'],
    ],
    current: [
      ['pending', '4px input'],
      ['complete', 'Coral outline'],
      ['complete', 'Native thumb'],
      ['complete', '45%'],
      ['complete', 'Keyboard'],
    ],
  },
  {
    key: 'invalid',
    label: 'Invalid',
    value: 140,
    min: 50,
    max: 150,
    formatValue: (value) => `超過建議值：${value}%`,
    error: '速度超過這個處理流程的建議值。',
    invalid: true,
    candidate: [
      ['complete', '36px'],
      ['complete', 'Danger fill'],
      ['complete', 'Danger thumb'],
      ['complete', '140%'],
      ['complete', 'aria-invalid'],
    ],
    current: [
      ['pending', '4px input'],
      ['pending', 'No error style'],
      ['pending', 'No error style'],
      ['complete', '140%'],
      ['complete', 'aria-invalid'],
    ],
  },
  {
    key: 'disabled',
    label: 'Disabled',
    value: 0,
    min: -12,
    max: 12,
    formatValue: (value) => `${value} semitone`,
    disabled: true,
    candidate: [
      ['complete', '36px'],
      ['complete', '50% group'],
      ['complete', 'Not allowed'],
      ['complete', 'Visible'],
      ['complete', 'disabled'],
    ],
    current: [
      ['pending', '4px input'],
      ['complete', '50% input'],
      ['complete', 'Not allowed'],
      ['pending', 'Full tone'],
      ['complete', 'disabled'],
    ],
  },
];

const STATE_COLUMNS = [
  ['target', 'Target'],
  ['track', 'Track／fill'],
  ['thumb', 'Thumb'],
  ['value', 'Value'],
  ['native', 'Native'],
];

const LAYERS = [
  {
    key: 'candidate',
    className: 'demo-range-layer--candidate',
    title: 'Token v2 候選 Range',
    note: 'Native input 擁有數值與互動；project-owned track／fill／thumb 只處理可見契約。',
    geometryNote:
      '完整軌道 target 隨離散 density 映射；6px track 與 16px thumb 保持固定。',
    contracts: [
      'Track · 6 CSS px',
      'Thumb · 16 CSS px',
      'Width · 100% parent／min 0／max none',
    ],
    component: DemoCandidateRange,
    sizes: [
      ['standard', 'Standard target · 36 CSS px'],
      ['compact', 'Compact target · 32 CSS px'],
    ],
  },
  {
    key: 'current',
    className: 'demo-range-layer--current',
    title: '現行 UiRange',
    note: 'Windows Chromium native track／thumb；input box 只有 track 高度，Field row 仍保留現行 30px。',
    geometryNote:
      'Current 保留 4px input box、16px native thumb 與 30px Field row，不套用 Candidate target。',
    contracts: [
      'Track／input box · 4 CSS px',
      'Native thumb · 16 CSS px',
      'Width · 100% parent／min 0／max none',
    ],
    component: UiRange,
    sizes: [['active', 'Current field row · 30 CSS px']],
  },
];

const values = reactive(
  Object.fromEntries(
    LAYERS.map((layer) => [
      layer.key,
      {
        sizes: Object.fromEntries(layer.sizes.map(([key]) => [key, 50])),
        widths: Object.fromEntries(
          WIDTH_CASES.map(([key, , value]) => [key, value]),
        ),
        anatomy: 72,
        stops: 50,
        content: Object.fromEntries(
          CONTENT_CASES.map((content) => [content.key, content.value]),
        ),
        states: Object.fromEntries(
          STATES.map((state) => [state.key, state.value]),
        ),
        validationHint: 72,
        validationError: 140,
      },
    ]),
  ),
);

function coverageFor(layer, state) {
  return state[layer.key];
}

function contentValueText(layer, content) {
  return content.formatValue(values[layer.key].content[content.key]);
}

function stateValueText(layer, state) {
  return state.formatValue(values[layer.key].states[state.key]);
}
</script>

<template>
  <div class="demo-range-appearance">
    <p class="demo-range-appearance__intro">
      <strong>Range 是具 numeric value 的連續／離散調整。</strong>
      沒有 empty、required 或 readonly state。
    </p>

    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-range-layer"
      :class="layer.className"
      :data-range-source="layer.key"
      :data-demo-review-layer="layer.key"
    >
      <header class="demo-range-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <section class="demo-range-geometry">
        <header class="demo-range-subsection__header">
          <h5>尺寸與寬度責任</h5>
          <p>{{ layer.geometryNote }}</p>
        </header>
        <div class="demo-range-contracts" aria-label="Range 尺寸責任">
          <span v-for="contract in layer.contracts" :key="contract">
            {{ contract }}
          </span>
        </div>
        <div class="demo-range-size-list">
          <article
            v-for="size in layer.sizes"
            :key="size[0]"
            class="demo-range-size"
            :class="`demo-range-size--${size[0]}`"
            :data-range-size="size[0]"
          >
            <h6>{{ size[1] }}</h6>
            <component
              :is="layer.component"
              :id="`demo-range-${layer.key}-size-${size[0]}`"
              v-model="values[layer.key].sizes[size[0]]"
              :label="`${size[1]} 音量`"
              :value-text="`${values[layer.key].sizes[size[0]]}%`"
            />
          </article>
        </div>
        <div class="demo-range-width-list">
          <article
            v-for="width in WIDTH_CASES"
            :key="width[0]"
            class="demo-range-width"
            :class="`demo-range-width--${width[0]}`"
            :data-range-width="width[0]"
          >
            <h6>{{ width[1] }}</h6>
            <component
              :is="layer.component"
              :id="`demo-range-${layer.key}-width-${width[0]}`"
              v-model="values[layer.key].widths[width[0]]"
              :label="`${width[1]} output level`"
              :value-text="`${values[layer.key].widths[width[0]]}%`"
            />
          </article>
        </div>
      </section>

      <section class="demo-range-anatomy-block">
        <header class="demo-range-subsection__header">
          <h5>Owned anatomy</h5>
          <p>
            UiField 擁有 label／support；Range 擁有 native
            input、track、fill、thumb 與 optional value output。
          </p>
        </header>
        <div class="demo-range-anatomy">
          <component
            :is="layer.component"
            :id="`demo-range-${layer.key}-anatomy`"
            v-model="values[layer.key].anatomy"
            label="輸出音量"
            :value-text="`${values[layer.key].anatomy}%`"
            hint="方向鍵依 step 微調；Home／End 到達邊界。"
          />
          <ol class="demo-range-anatomy__map" aria-label="Range anatomy map">
            <li data-range-anatomy="input">
              <b>1</b
              ><span>{{
                layer.key === 'candidate'
                  ? 'Native input · full 36／32px track target'
                  : 'Native input · 4px element box'
              }}</span>
            </li>
            <li data-range-anatomy="track">
              <b>2</b
              ><span>{{
                layer.key === 'candidate'
                  ? 'Project-owned 6px track／fill'
                  : 'Current Chromium native track／thumb'
              }}</span>
            </li>
            <li data-range-anatomy="fill">
              <b>3</b><span>Fill · min → current value</span>
            </li>
            <li data-range-anatomy="thumb">
              <b>4</b
              ><span>{{
                layer.key === 'candidate'
                  ? 'Project-owned 16px thumb'
                  : 'Chromium native 16px thumb'
              }}</span>
            </li>
            <li data-range-anatomy="value">
              <b>5</b><span>Optional output · formatted valueText</span>
            </li>
            <li data-range-anatomy="support">
              <b>6</b><span>Hint or Error · UiField support region</span>
            </li>
          </ol>
        </div>
      </section>

      <section class="demo-range-content-review">
        <header class="demo-range-subsection__header">
          <h5>數值與格式內容</h5>
          <p>
            modelValue 保持 Number；valueText 只負責可見格式與
            aria-valuetext，不改變數值域。
          </p>
        </header>
        <div class="demo-range-content-list">
          <article
            v-for="content in CONTENT_CASES"
            :key="content.key"
            class="demo-range-content"
            :data-range-content="content.key"
          >
            <h6>{{ content.label }}</h6>
            <component
              :is="layer.component"
              :id="`demo-range-${layer.key}-content-${content.key}`"
              v-model="values[layer.key].content[content.key]"
              :label="content.label"
              :min="content.min"
              :max="content.max"
              :step="content.step"
              :value-text="contentValueText(layer, content)"
            />
            <p>{{ content.note }}</p>
          </article>
        </div>
      </section>

      <section class="demo-range-stops" data-range-stops>
        <header class="demo-range-subsection__header">
          <h5>離散 stops</h5>
          <p>
            0／25／50／75／100 · native step 25。吸附仍由 input 數值域負責；少量
            ticks 只在需要表達離散選擇時出現。
          </p>
        </header>
        <div class="demo-range-stops__specimen">
          <component
            :is="layer.component"
            :id="`demo-range-${layer.key}-stops-equal`"
            v-model="values[layer.key].stops"
            label="輸出段位"
            :min="0"
            :max="100"
            :step="25"
            :value-text="`${values[layer.key].stops}%`"
            v-bind="layer.key === 'candidate' ? { marks: STOP_VALUES } : {}"
          />
          <p>
            {{
              layer.key === 'candidate'
                ? 'Candidate：5 個軌道內 ticks，不增加垂直預留'
                : 'Current：native step 吸附，沒有自訂 tick layer'
            }}
          </p>
        </div>
      </section>

      <section class="demo-range-state-review">
        <header class="demo-range-subsection__header">
          <h5>狀態外觀與覆蓋</h5>
          <p>
            Range 沒有 empty／filled 二分；min、mid、max
            都是有效值，鍵盤焦點落在 thumb。
          </p>
        </header>
        <div class="demo-range-state-list">
          <article
            v-for="state in STATES"
            :key="state.key"
            class="demo-range-state"
            :data-range-state="state.key"
          >
            <h6>{{ state.label }}</h6>
            <component
              :is="layer.component"
              :id="`demo-range-${layer.key}-state-${state.key}`"
              v-model="values[layer.key].states[state.key]"
              :label="state.label"
              :min="state.min ?? 0"
              :max="state.max ?? 100"
              :value-text="stateValueText(layer, state)"
              :invalid="state.invalid"
              :error="state.error"
              :disabled="state.disabled"
            />
          </article>
        </div>

        <div
          class="demo-range-coverage"
          data-range-coverage-matrix
          tabindex="0"
          aria-label="Range 狀態樣式覆蓋矩陣"
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
                  :data-range-coverage="`${layer.key}-${state.key}-${STATE_COLUMNS[index][0]}`"
                  :data-coverage-status="coverage[0]"
                >
                  {{ coverage[1] }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="demo-range-validation">
        <header class="demo-range-subsection__header">
          <h5>Hint → Error 與 ARIA</h5>
          <p>
            Auto 為預設；Error 取代 Hint，aria-valuetext 與 caller description
            同時保留。
          </p>
        </header>
        <div class="demo-range-validation__replacement">
          <article>
            <span>Hint／valid</span>
            <component
              :is="layer.component"
              :id="`demo-range-${layer.key}-validation-hint`"
              v-model="values[layer.key].validationHint"
              label="導唱音量"
              :value-text="`${values[layer.key].validationHint}%`"
              hint="建議演出前以耳機確認。"
              aria-describedby="range-external-note"
              :name="`demo-range-${layer.key}-level`"
              data-contract="native-forwarding"
            />
          </article>
          <b aria-hidden="true">→</b>
          <article>
            <span>Error／invalid</span>
            <component
              :is="layer.component"
              :id="`demo-range-${layer.key}-validation-error`"
              v-model="values[layer.key].validationError"
              label="處理速度"
              :min="50"
              :max="150"
              :value-text="`超過建議值：${values[layer.key].validationError}%`"
              hint="建議維持在 50% 至 120%。"
              error="速度超過這個處理流程的建議值。"
              aria-describedby="range-external-note"
            />
          </article>
        </div>
      </section>

      <section class="demo-range-api">
        <h5>Public contract</h5>
        <dl>
          <div>
            <dt>Value</dt>
            <dd>Number modelValue → update:modelValue</dd>
          </div>
          <div>
            <dt>Domain</dt>
            <dd>min · max · step · disabled · invalid</dd>
          </div>
          <div>
            <dt>Display</dt>
            <dd>valueText → output／aria-valuetext</dd>
          </div>
          <div>
            <dt>Browser</dt>
            <dd>name · native attrs／listeners</dd>
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
              ? 'Candidate visual track／thumb／optional in-track ticks · Native range input · No production marks／required／readonly／size prop'
              : 'Native visual track／thumb · No required／readonly／size prop'
          }}
        </p>
      </section>
    </section>
  </div>
</template>

<style scoped>
.demo-range-appearance {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-range-appearance__intro,
.demo-range-layer__header h4,
.demo-range-layer__header p,
.demo-range-subsection__header h5,
.demo-range-subsection__header p,
.demo-range-size h6,
.demo-range-width h6,
.demo-range-content h6,
.demo-range-content p,
.demo-range-state h6,
.demo-range-api h5,
.demo-range-api p {
  margin: 0;
}

.demo-range-appearance__intro {
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.demo-range-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-range-layer {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-5);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-range-layer__header,
.demo-range-subsection__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: baseline;
}

.demo-range-layer__header h4,
.demo-range-subsection__header h5,
.demo-range-size h6,
.demo-range-width h6,
.demo-range-content h6,
.demo-range-state h6,
.demo-range-api h5 {
  color: var(--ui-color-text);
}

.demo-range-layer__header p,
.demo-range-subsection__header p,
.demo-range-content p,
.demo-range-api p {
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-caption);
}

.demo-range-layer__header h4,
.demo-range-layer__header p,
.demo-range-subsection__header h5,
.demo-range-subsection__header p,
.demo-range-contracts span,
.demo-range-size h6,
.demo-range-width h6,
.demo-range-content h6,
.demo-range-content p,
.demo-range-state h6,
.demo-range-anatomy__map span,
.demo-range-api dd,
.demo-range-api p {
  overflow-wrap: anywhere;
}

.demo-range-geometry,
.demo-range-anatomy-block,
.demo-range-content-review,
.demo-range-stops,
.demo-range-state-review,
.demo-range-validation,
.demo-range-api {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
}

.demo-range-contracts,
.demo-range-size-list,
.demo-range-width-list,
.demo-range-content-list,
.demo-range-state-list {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--ui-space-3);
}

.demo-range-stops__specimen {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.demo-range-stops__specimen > p {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-xs);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-range-contracts span,
.demo-range-size,
.demo-range-width,
.demo-range-content,
.demo-range-state {
  min-width: 0;
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
}

.demo-range-size,
.demo-range-width,
.demo-range-content,
.demo-range-state {
  display: grid;
  align-content: start;
  gap: var(--ui-space-2);
}

.demo-range-size--standard {
  --demo-range-target-size: 2.25rem;
}

.demo-range-size--compact {
  --demo-range-target-size: 2rem;
}

.demo-range-size--active {
  --demo-range-target-size: 1.875rem;
}

.demo-range-width--narrow {
  width: min(12rem, 100%);
}

.demo-range-width--reference {
  width: min(20rem, 100%);
}

.demo-range-width--fluid {
  width: 100%;
}

.demo-range-anatomy {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(14rem, 0.7fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}

.demo-range-anatomy__map {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding: 0;
  margin: 0;
  list-style: none;
}

.demo-range-anatomy__map li {
  min-width: 0;
  display: grid;
  grid-template-columns: 1.5rem minmax(0, 1fr);
  gap: var(--ui-space-2);
  align-items: center;
}

.demo-range-anatomy__map b {
  display: grid;
  width: 1.5rem;
  height: 1.5rem;
  place-items: center;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-text);
}

.demo-range-state[data-range-state='hover']
  :deep(.demo-candidate-range__native::-webkit-slider-thumb) {
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--ui-color-canvas) 70%, transparent),
    0 0 0 var(--ui-space-1) var(--ui-color-accent-soft);
}

.demo-range-state[data-range-state='focus']
  :deep(.demo-candidate-range__native::-webkit-slider-thumb) {
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--ui-color-canvas) 70%, transparent),
    0 0 0 var(--ui-focus-offset) var(--ui-color-canvas),
    0 0 0 calc(var(--ui-focus-offset) + var(--ui-focus-width))
      var(--ui-color-focus);
}

.demo-range-layer--current
  .demo-range-state[data-range-state='focus']
  :deep(.ui-range__control) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-range-coverage {
  min-width: 0;
  overflow-x: auto;
  border: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-range-coverage table {
  width: 100%;
  min-width: 42rem;
  border-collapse: collapse;
}

.demo-range-coverage th,
.demo-range-coverage td {
  padding: var(--ui-space-2);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  text-align: start;
}

.demo-range-coverage thead th,
.demo-range-coverage tbody th {
  color: var(--ui-color-text);
}

.demo-range-coverage td {
  color: var(--ui-color-text-muted);
}

.demo-range-coverage [data-coverage-status='complete'] {
  color: var(--ui-color-success);
}

.demo-range-coverage [data-coverage-status='pending'] {
  color: var(--ui-color-warning);
}

.demo-range-validation__replacement {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: var(--ui-space-3);
  align-items: start;
}

.demo-range-validation__replacement article {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.demo-range-validation__replacement > b {
  align-self: center;
  color: var(--ui-color-text-muted);
}

.demo-range-api dl {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--ui-space-2) var(--ui-space-4);
  margin: 0;
}

.demo-range-api dl > div {
  min-width: 0;
}

.demo-range-api dt {
  color: var(--ui-color-text-muted);
}

.demo-range-api dd {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text);
}

.demo-range-layer--current {
  color-scheme: dark;
  --ui-font-family-base:
    'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui,
    -apple-system, sans-serif;
  --ui-field-height: 1.875rem;
  --ui-range-track-size: 0.25rem;
  --ui-range-thumb-size: 1rem;
  --ui-color-accent: #55a2a7;
  --ui-color-focus: #dd7a64;
  --ui-color-danger: #dd7078;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-opacity-disabled: 0.5;
}

:global(:root[data-ui-theme='light'] .demo-range-layer--current) {
  color-scheme: light;
  --ui-color-accent: #2f777c;
  --ui-color-focus: #d26a45;
  --ui-color-danger: #bd5961;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
}

@container (max-width: 48rem) {
  .demo-range-layer__header,
  .demo-range-subsection__header,
  .demo-range-anatomy {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-range-layer__header,
  .demo-range-subsection__header {
    gap: var(--ui-space-1);
  }
}

@container (max-width: 32rem) {
  .demo-range-validation__replacement {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-range-validation__replacement > b {
    justify-self: start;
    transform: rotate(90deg);
  }
}
</style>
