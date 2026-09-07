<script setup>
import { reactive } from 'vue';
import { ICON_SIZE, Search, X } from '../../icons/index.js';
import UiSearchBox from '../ui/UiSearchBox.vue';

const SEARCH_WIDTH_TESTS = [
  {
    key: 'narrow',
    label: '12rem 檢查槽 · 非元件 token',
    value: '雨愛',
  },
  {
    key: 'reference',
    label: '20rem 檢查槽 · 非元件 token',
    value: '搜尋曲目或演出者',
  },
  {
    key: 'fluid',
    label: '可用寬度檢查槽',
    value: '跟隨父層延展',
  },
];

const SEARCH_COVERAGE_COLUMNS = [
  ['surface', 'Surface'],
  ['boundary', 'Boundary'],
  ['query', 'Query'],
  ['clear', 'Clear'],
  ['semantics', 'Semantics'],
];

const SEARCH_STATES = [
  {
    key: 'default',
    label: 'Default／空白',
    placeholder: '搜尋曲目',
    coverage: {
      candidate: [
        ['complete', 'Base'],
        ['complete', 'Base border'],
        ['complete', 'Placeholder'],
        ['complete', 'Hidden'],
        ['complete', 'Editable'],
      ],
      current: [
        ['complete', 'Base'],
        ['complete', 'Base border'],
        ['complete', 'Placeholder'],
        ['complete', 'Hidden'],
        ['complete', 'Editable'],
      ],
    },
  },
  {
    key: 'filled',
    label: 'Filled／可清除',
    modelValue: '雨愛',
    coverage: {
      candidate: [
        ['complete', 'Base'],
        ['complete', 'Base border'],
        ['complete', 'Value'],
        ['complete', 'Available'],
        ['complete', 'Button label'],
      ],
      current: [
        ['complete', 'Base'],
        ['complete', 'Base border'],
        ['complete', 'Value'],
        ['partial', '16-unit only'],
        ['complete', 'Button label'],
      ],
    },
  },
  {
    key: 'field-hover',
    label: 'Field Hover',
    modelValue: 'Fly Machine',
    coverage: {
      candidate: [
        ['complete', 'Hover surface'],
        ['complete', 'Strong border'],
        ['complete', 'Value'],
        ['complete', 'Available'],
        ['complete', ':hover'],
      ],
      current: [
        ['pending', 'No hover surface'],
        ['pending', 'No hover border'],
        ['complete', 'Value'],
        ['partial', '16-unit only'],
        ['complete', ':hover'],
      ],
    },
  },
  {
    key: 'input-focus',
    label: 'Input Focus-visible',
    modelValue: '鍵盤焦點',
    coverage: {
      candidate: [
        ['complete', 'Base'],
        ['complete', '2px＋2px outer ring'],
        ['complete', 'Caret／value'],
        ['complete', 'Available'],
        ['complete', 'Input focus'],
      ],
      current: [
        ['complete', 'Base'],
        ['complete', '2px＋2px outer ring'],
        ['complete', 'Caret／value'],
        ['partial', '16-unit only'],
        ['complete', 'Input focus'],
      ],
    },
  },
  {
    key: 'clear-hover',
    label: 'Clear Hover',
    modelValue: 'Hover Clear',
    coverage: {
      candidate: [
        ['complete', 'Base'],
        ['complete', 'Base border'],
        ['complete', 'Value'],
        ['complete', 'Hover surface＋fg'],
        ['complete', 'Button :hover'],
      ],
      current: [
        ['complete', 'Base'],
        ['complete', 'Base border'],
        ['complete', 'Value'],
        ['partial', 'Foreground only'],
        ['complete', 'Button :hover'],
      ],
    },
  },
  {
    key: 'clear-pressed',
    label: 'Clear Pressed',
    modelValue: 'Pressed Clear',
    coverage: {
      candidate: [
        ['complete', 'Base'],
        ['complete', 'Base border'],
        ['complete', 'Value'],
        ['complete', 'Active surface＋fg'],
        ['complete', 'Button :active'],
      ],
      current: [
        ['complete', 'Base'],
        ['complete', 'Base border'],
        ['complete', 'Value'],
        ['pending', 'No pressed style'],
        ['complete', 'Button :active'],
      ],
    },
  },
  {
    key: 'clear-focus',
    label: 'Clear Focus-visible',
    modelValue: 'Focus Clear',
    coverage: {
      candidate: [
        ['complete', 'Base'],
        ['complete', '2px inset target ring'],
        ['complete', 'Value'],
        ['complete', 'Target identified'],
        ['complete', 'Button focus'],
      ],
      current: [
        ['complete', 'Base'],
        ['partial', 'Outer ring only'],
        ['complete', 'Value'],
        ['pending', 'Target not identified'],
        ['complete', 'Button focus'],
      ],
    },
  },
  {
    key: 'disabled',
    label: 'Disabled',
    modelValue: '由系統管理',
    disabled: true,
    coverage: {
      candidate: [
        ['complete', 'Whole control · 50%'],
        ['complete', 'Base border'],
        ['complete', 'Value'],
        ['complete', 'Disabled'],
        ['complete', 'Not-allowed／select none'],
      ],
      current: [
        ['partial', 'Children only'],
        ['complete', 'Base border'],
        ['partial', 'Input · 50%'],
        ['partial', 'Clear · 50%'],
        ['complete', 'Disabled'],
      ],
    },
  },
];

const SEARCH_LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 候選基礎',
    note: '沿用已核定的 Field 外框與 Search anatomy；本輪核對狀態外觀與覆蓋責任。',
    sizes: [
      ['standard', 'Standard', 'Standard 36 CSS px'],
      ['compact', 'Compact', 'Compact 32 CSS px'],
    ],
    leadingLabel: '32 CSS px inline slot · 16-unit glyph centered',
    clearLabel: '32 CSS px inline slot · full control height',
    labelSelection: 'Select none／仍可點擊聚焦',
    nativeCancel: ['hidden', '只保留自訂 Clear'],
    decision:
      '左右各保留 32 CSS px icon slot；16-unit glyph 居中，文字區兩側各留 4 CSS px。',
    gapItems: [],
    values: [
      [
        'Outer shell',
        'Standard 36 CSS px',
        'Compact 32 CSS px · inherit Field',
      ],
      [
        'Leading icon slot',
        '32 CSS px inline slot',
        '16-unit glyph centered／aria-hidden',
      ],
      ['Input', 'Fluid · min 0', 'type=search／native attrs → input'],
      [
        'Clear action',
        '32 CSS px inline slot',
        'Standard 32×36 · Compact 32×32',
      ],
      ['Inline rhythm', '32 + 4', '4 + 32 · mirrored slots'],
      ['Native cancel', 'Hidden', 'Custom Clear owns action'],
      [
        'Public API',
        'id／label／modelValue／placeholder／disabled',
        'update:modelValue',
      ],
      ['Structure', 'Fixed anatomy · no slots', 'Label 保持點擊聚焦'],
    ],
  },
  {
    key: 'current',
    title: '現行 Search Box 基礎',
    note: '以 active token 與現有 UiSearchBox 結構如實呈現。',
    sizes: [['active', 'Active', 'Active 30 CSS px']],
    leadingLabel: '現行只有 16-unit glyph，未擁有固定 slot',
    clearLabel: '現行只有 16-unit glyph，未擁有命中區 token',
    labelSelection: '可選取（待補）／仍可點擊聚焦',
    nativeCancel: ['unowned', '原生 × 與自訂 Clear 可能同時出現'],
    decision: 'Active 30 CSS px 只容納 16-unit glyph，命中區尚未制定',
    gapItems: [
      'Hover surface 尚未制定',
      'Disabled 整體外觀尚未制定',
      '原生 search cancel ownership 未落地',
    ],
    values: [
      ['Outer shell', 'Active 30 CSS px', 'Field active token'],
      ['Leading glyph', '16 unit', 'Decorative／aria-hidden'],
      ['Input', 'Fluid · min 0', 'type=search／native attrs → input'],
      ['Clear action', '16-unit glyph only', '無獨立尺寸／命中區 token'],
      ['Inline rhythm', '8 + 16 + 4', '4 + 16 + 8'],
      ['Native cancel', 'Browser default', '與 custom Clear 可能重複'],
      [
        'Public API',
        'id／label／modelValue／placeholder／disabled',
        'update:modelValue',
      ],
      ['Structure', 'Fixed anatomy · no slots', 'Clear 僅在有值時出現'],
    ],
  },
];

const specimenValues = reactive(
  Object.fromEntries(
    SEARCH_LAYERS.map((layer) => [
      layer.key,
      {
        sizes: Object.fromEntries(
          layer.sizes.map((size) => [size[0], size[2]]),
        ),
        widths: Object.fromEntries(
          SEARCH_WIDTH_TESTS.map((width) => [width.key, width.value]),
        ),
        states: Object.fromEntries(
          SEARCH_STATES.map((state) => [state.key, state.modelValue ?? '']),
        ),
      },
    ]),
  ),
);

function coverageFor(layer, state, index) {
  return state.coverage[layer.key][index];
}
</script>

<template>
  <div class="demo-search-appearance">
    <p class="demo-search-appearance__intro">
      <strong>Search Box 基礎已完成。</strong>
      本輪依互動順序檢查輸入區與 Clear action
      的狀態；非元件責任的搜尋結果回饋保持分離。
    </p>

    <section
      v-for="layer in SEARCH_LAYERS"
      :key="layer.key"
      class="demo-search-layer"
      :class="`demo-search-layer--${layer.key}`"
      :data-search-source="layer.key"
      :data-demo-review-layer="layer.key"
      :aria-labelledby="`demo-search-${layer.key}-title`"
    >
      <header class="demo-search-layer__header">
        <h4 :id="`demo-search-${layer.key}-title`">{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <div class="demo-search-foundation" data-search-foundation="true">
        <section class="demo-search-foundation__block">
          <h5>Outer shell</h5>
          <div class="demo-search-size-list">
            <article
              v-for="size in layer.sizes"
              :key="size[0]"
              class="demo-search-size"
              :class="`demo-search-size--${size[0]}`"
              :data-search-size="size[0]"
            >
              <span>{{ size[1] }}</span>
              <UiSearchBox
                :id="`demo-search-${layer.key}-size-${size[0]}`"
                v-model="specimenValues[layer.key].sizes[size[0]]"
                :label="`${size[1]} 搜尋高度檢查`"
              />
            </article>
          </div>
        </section>

        <section class="demo-search-foundation__block">
          <h5>Width responsibility</h5>
          <p class="demo-search-width-contract">
            <span>Default 100% parent</span>
            <span>Min 0 · layout floor</span>
            <span>Max none · parent owns</span>
          </p>
          <div class="demo-search-width-tests">
            <article
              v-for="width in SEARCH_WIDTH_TESTS"
              :key="width.key"
              class="demo-search-width-test"
              :class="`demo-search-width-test--${width.key}`"
              :data-search-width-test="width.key"
            >
              <span>{{ width.label }}</span>
              <UiSearchBox
                :id="`demo-search-${layer.key}-width-${width.key}`"
                v-model="specimenValues[layer.key].widths[width.key]"
                :label="`${width.label} 搜尋寬度檢查`"
              />
            </article>
          </div>
        </section>

        <section
          class="demo-search-foundation__block demo-search-foundation__block--anatomy"
        >
          <h5>Fixed anatomy · no slots</h5>
          <div class="demo-search-anatomy-visual" aria-hidden="true">
            <span
              class="demo-search-anatomy-visual__label"
              data-search-anatomy="label"
            ></span>
            <div class="demo-search-anatomy-visual__control">
              <span
                class="demo-search-anatomy-visual__leading"
                data-search-anatomy="leading"
                :data-search-alignment="
                  layer.key === 'candidate' ? 'leading-center' : undefined
                "
              >
                <Search :size="ICON_SIZE" />
              </span>
              <span
                class="demo-search-anatomy-visual__gap"
                :data-search-alignment="
                  layer.key === 'candidate' ? 'leading-gap' : undefined
                "
              ></span>
              <span
                class="demo-search-anatomy-visual__input"
                data-search-anatomy="input"
              ></span>
              <span
                class="demo-search-anatomy-visual__gap"
                :data-search-alignment="
                  layer.key === 'candidate' ? 'trailing-gap' : undefined
                "
              ></span>
              <span
                class="demo-search-anatomy-visual__clear"
                data-search-anatomy="clear"
                :data-search-alignment="
                  layer.key === 'candidate' ? 'trailing-center' : undefined
                "
              >
                <X :size="ICON_SIZE" />
              </span>
            </div>
            <div
              v-if="layer.key === 'candidate'"
              class="demo-search-alignment-readout"
            >
              <span>32 CSS px icon slot</span>
              <span>4 CSS px gap</span>
              <span>4 CSS px gap</span>
              <span>32 CSS px icon slot</span>
            </div>
          </div>
          <dl class="demo-search-anatomy-legend">
            <div>
              <dt>Hidden label</dt>
              <dd :data-search-label-selection="layer.key">
                {{ layer.labelSelection }}
              </dd>
            </div>
            <div>
              <dt>Search glyph · 16 unit</dt>
              <dd>{{ layer.leadingLabel }}</dd>
            </div>
            <div>
              <dt>Input · fluid／min 0</dt>
              <dd>單行查詢內容</dd>
            </div>
            <div>
              <dt>Clear action · conditional</dt>
              <dd>{{ layer.clearLabel }}</dd>
            </div>
            <div>
              <dt>Native cancel ownership</dt>
              <dd :data-search-native-cancel="layer.nativeCancel[0]">
                {{ layer.nativeCancel[1] }}
              </dd>
            </div>
          </dl>
          <p class="demo-search-anatomy__decision">
            {{ layer.decision }}
          </p>
        </section>
      </div>

      <section class="demo-search-state-review" data-search-state-review="true">
        <header class="demo-search-state-review__header">
          <h5>狀態外觀與覆蓋</h5>
          <p>
            先看實際狀態，再確認 Surface、Boundary、Query、Clear 與 Semantics。
          </p>
        </header>

        <div class="demo-search-state-list">
          <article
            v-for="state in SEARCH_STATES"
            :key="state.key"
            class="demo-search-state"
            :data-search-state="state.key"
          >
            <h6>{{ state.label }}</h6>
            <UiSearchBox
              :id="`demo-search-${layer.key}-state-${state.key}`"
              v-model="specimenValues[layer.key].states[state.key]"
              :label="`${state.label} 搜尋狀態`"
              :placeholder="state.placeholder"
              :disabled="state.disabled"
            />
          </article>
        </div>

        <div
          class="demo-search-coverage"
          data-search-coverage-matrix="true"
          tabindex="0"
          aria-label="Search Box 狀態樣式覆蓋矩陣"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">State</th>
                <th
                  v-for="column in SEARCH_COVERAGE_COLUMNS"
                  :key="column[0]"
                  scope="col"
                >
                  {{ column[1] }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="state in SEARCH_STATES" :key="state.key">
                <th scope="row">{{ state.label }}</th>
                <td
                  v-for="(coverage, index) in state.coverage[layer.key]"
                  :key="SEARCH_COVERAGE_COLUMNS[index][0]"
                  :data-search-coverage="`${layer.key}-${state.key}-${SEARCH_COVERAGE_COLUMNS[index][0]}`"
                  :data-search-coverage-status="
                    coverageFor(layer, state, index)[0]
                  "
                >
                  {{ coverageFor(layer, state, index)[1] }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="demo-search-state-review__boundary">
          Loading、結果、無結果與搜尋錯誤由使用 Search Box 的 consumer 呈現。
        </p>
      </section>

      <section
        v-if="layer.gapItems.length"
        class="demo-search-gaps"
        aria-label="待補基礎契約"
      >
        <h5>仍待落地的現行缺口</h5>
        <div>
          <span v-for="item in layer.gapItems" :key="item">{{ item }}</span>
        </div>
      </section>

      <dl class="demo-search-layer__reference">
        <div v-for="value in layer.values" :key="value[0]">
          <dt>{{ value[0] }}</dt>
          <dd>{{ value[1] }}</dd>
          <dd>{{ value[2] }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.demo-search-appearance {
  min-width: 0;
  container-type: inline-size;
}

.demo-search-appearance__intro,
.demo-search-layer__header h4,
.demo-search-layer__header p,
.demo-search-foundation__block h5,
.demo-search-width-contract,
.demo-search-anatomy__decision,
.demo-search-gaps h5,
.demo-search-state-review__header h5,
.demo-search-state-review__header p,
.demo-search-state h6,
.demo-search-state-review__boundary {
  margin: 0;
}

.demo-search-appearance__intro {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-body);
}

.demo-search-appearance__intro strong {
  color: var(--ui-color-text);
}

.demo-search-layer {
  min-width: 0;
  margin-top: var(--ui-space-5);
  padding-top: var(--ui-space-4);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-search-layer__header {
  display: grid;
  grid-template-columns: minmax(10rem, 0.35fr) minmax(16rem, 1fr);
  align-items: end;
  gap: var(--ui-space-3);
}

.demo-search-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-title);
}

.demo-search-layer__header p,
.demo-search-width-test > span,
.demo-search-size > span,
.demo-search-anatomy-legend dd,
.demo-search-gaps span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-search-foundation {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-5);
  margin-top: var(--ui-space-4);
}

.demo-search-foundation__block {
  min-width: 0;
}

.demo-search-foundation__block--anatomy {
  grid-column: 1 / -1;
}

.demo-search-foundation__block h5,
.demo-search-gaps h5,
.demo-search-state-review__header h5,
.demo-search-state h6 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-search-size-list,
.demo-search-width-tests {
  display: grid;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-3);
}

.demo-search-size-list {
  grid-template-columns: repeat(auto-fit, minmax(min(10rem, 100%), 1fr));
}

.demo-search-size,
.demo-search-width-test {
  display: grid;
  min-width: 0;
  gap: var(--ui-space-1);
}

.demo-search-size--standard {
  --ui-field-height: 2.25rem;
}

.demo-search-size--compact {
  --ui-field-height: 2rem;
}

.demo-search-size--active {
  --ui-field-height: 1.875rem;
}

.demo-search-width-contract {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(7rem, 100%), 1fr));
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-3);
}

.demo-search-width-contract span {
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-search-width-test {
  padding: var(--ui-space-2);
  border: var(--ui-border-width) dashed var(--ui-color-border);
}

.demo-search-width-test--narrow {
  width: min(12rem, 100%);
}

.demo-search-width-test--reference {
  width: min(20rem, 100%);
}

.demo-search-width-test--fluid {
  width: 100%;
}

.demo-search-anatomy-visual {
  max-width: 36rem;
  margin-top: var(--ui-space-3);
}

.demo-search-anatomy-visual__label {
  display: block;
  width: 5rem;
  height: 2px;
  margin: 0 0 var(--ui-space-1) var(--ui-space-2);
  border-top: 2px dashed var(--ui-color-border-strong);
}

.demo-search-anatomy-visual__control {
  display: grid;
  grid-template-columns:
    1rem var(--ui-space-1) minmax(0, 1fr) var(--ui-space-1)
    auto;
  align-items: center;
  height: 2.25rem;
  overflow: hidden;
  padding-inline: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-field-border);
  border-radius: var(--ui-field-radius);
  background: var(--ui-field-bg);
}

.demo-search-layer--candidate .demo-search-anatomy-visual__control {
  grid-template-columns:
    2rem var(--ui-space-1) minmax(0, 1fr) var(--ui-space-1)
    2rem;
  padding-inline: 0;
}

.demo-search-anatomy-visual__leading,
.demo-search-anatomy-visual__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-color-text-muted);
}

.demo-search-anatomy-visual__input {
  min-width: 0;
  width: min(12rem, 75%);
  height: var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-border-strong);
}

.demo-search-anatomy-visual__gap {
  width: 100%;
  height: 1rem;
  border-inline: var(--ui-border-width) dotted var(--ui-color-warning);
  opacity: var(--ui-opacity-muted);
}

.demo-search-anatomy-visual__clear {
  border: var(--ui-border-width) dashed var(--ui-color-warning);
}

.demo-search-layer--candidate .demo-search-anatomy-visual__leading {
  width: 2rem;
  align-self: stretch;
}

.demo-search-layer--candidate .demo-search-anatomy-visual__clear {
  width: 2rem;
  align-self: stretch;
}

.demo-search-layer--current .demo-search-anatomy-visual__control {
  height: 1.875rem;
}

.demo-search-layer--current .demo-search-anatomy-visual__clear {
  width: 1rem;
  height: 1rem;
  border: 0;
}

.demo-search-alignment-readout {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-1);
  margin-top: var(--ui-space-1);
}

.demo-search-alignment-readout span {
  min-width: 0;
  padding-block: 2px;
  border-top: var(--ui-border-width) solid var(--ui-color-warning);
  color: var(--ui-color-warning);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  text-align: center;
}

.demo-search-anatomy-legend,
.demo-search-layer__reference {
  display: grid;
  margin: var(--ui-space-3) 0 0;
}

.demo-search-anatomy-legend {
  grid-template-columns: repeat(auto-fit, minmax(min(10rem, 100%), 1fr));
  gap: var(--ui-space-2);
}

.demo-search-anatomy-legend div,
.demo-search-layer__reference > div {
  min-width: 0;
  padding-block: var(--ui-space-2);
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-search-anatomy-legend dt,
.demo-search-layer__reference dt,
.demo-search-layer__reference dd {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-search-anatomy-legend dd,
.demo-search-layer__reference dd {
  margin: var(--ui-space-1) 0 0;
  overflow-wrap: anywhere;
}

.demo-search-anatomy__decision {
  margin-top: var(--ui-space-3);
  color: var(--ui-color-warning);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-search-state-review {
  min-width: 0;
  margin-top: var(--ui-space-5);
  padding-top: var(--ui-space-4);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-search-state-review__header {
  display: grid;
  grid-template-columns: minmax(10rem, 0.35fr) minmax(16rem, 1fr);
  align-items: baseline;
  gap: var(--ui-space-3);
}

.demo-search-state-review__header p,
.demo-search-state-review__boundary {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-search-state-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--ui-space-4);
  margin-top: var(--ui-space-4);
}

.demo-search-state {
  min-width: 0;
  padding-top: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-search-state h6 {
  margin-bottom: var(--ui-space-2);
  color: var(--ui-color-text-muted);
}

.demo-search-coverage {
  max-width: 100%;
  margin-top: var(--ui-space-4);
  overflow-x: auto;
  outline-offset: var(--ui-focus-offset-inset);
}

.demo-search-coverage:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
}

.demo-search-coverage table {
  width: 100%;
  min-width: 50rem;
  border-collapse: collapse;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  text-align: left;
}

.demo-search-coverage th,
.demo-search-coverage td {
  padding: var(--ui-space-2);
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-search-coverage th {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-search-coverage td[data-search-coverage-status='complete'] {
  color: var(--ui-color-text);
}

.demo-search-coverage td[data-search-coverage-status='partial'],
.demo-search-coverage td[data-search-coverage-status='pending'] {
  color: var(--ui-color-warning);
}

.demo-search-state-review__boundary {
  margin-top: var(--ui-space-2);
}

.demo-search-layer--candidate
  .demo-search-state[data-search-state='field-hover']
  :deep(.ui-search-box__control) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-bg-hover);
}

.demo-search-layer--candidate
  .demo-search-state[data-search-state='input-focus']
  :deep(.ui-search-box__control) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-search-layer--current
  .demo-search-state[data-search-state='input-focus']
  :deep(.ui-search-box__control) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-search-layer--candidate
  .demo-search-state[data-search-state='clear-hover']
  :deep(.ui-search-box__clear) {
  color: var(--ui-color-text);
}

.demo-search-layer--candidate
  .demo-search-state[data-search-state='clear-hover']
  :deep(.ui-search-box__clear)::before {
  background: var(--ui-color-surface-hover);
}

.demo-search-layer--current
  .demo-search-state[data-search-state='clear-hover']
  :deep(.ui-search-box__clear) {
  color: var(--ui-color-text);
}

.demo-search-layer--candidate
  .demo-search-state[data-search-state='clear-pressed']
  :deep(.ui-search-box__clear) {
  color: var(--ui-color-text);
}

.demo-search-layer--candidate
  .demo-search-state[data-search-state='clear-pressed']
  :deep(.ui-search-box__clear)::before {
  background: var(--ui-color-surface-active);
}

.demo-search-layer--candidate
  .demo-search-state[data-search-state='clear-focus']
  :deep(.ui-search-box__clear) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
  color: var(--ui-color-text);
}

.demo-search-layer--candidate
  .demo-search-state[data-search-state='clear-focus']
  :deep(.ui-search-box__clear)::before {
  background: var(--ui-color-surface-hover);
}

.demo-search-layer--current
  .demo-search-state[data-search-state='clear-focus']
  :deep(.ui-search-box__control) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-search-layer--candidate
  .demo-search-state[data-search-state='disabled']
  :deep(.ui-search-box__control) {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}

.demo-search-layer--candidate
  .demo-search-state[data-search-state='disabled']
  :deep(.ui-search-box__input),
.demo-search-layer--candidate
  .demo-search-state[data-search-state='disabled']
  :deep(.ui-search-box__clear) {
  -webkit-user-select: none;
  user-select: none;
  opacity: 1;
}

.demo-search-gaps {
  margin-top: var(--ui-space-5);
}

.demo-search-gaps > div {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr));
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-2);
}

.demo-search-gaps span {
  padding: var(--ui-space-2);
  border: var(--ui-border-width) dashed var(--ui-color-warning);
  color: var(--ui-color-warning);
}

.demo-search-layer__reference > div {
  display: grid;
  grid-template-columns: minmax(7rem, 0.6fr) minmax(9rem, 1fr) minmax(
      10rem,
      1.2fr
    );
  gap: var(--ui-space-3);
}

.demo-search-layer--candidate :deep(.ui-search-box__label) {
  -webkit-user-select: none;
  user-select: none;
}

.demo-search-layer--candidate :deep(.ui-search-box__control) {
  position: relative;
  padding-inline: calc(2rem + var(--ui-space-1));
}

.demo-search-layer--candidate :deep(.ui-search-box__icon) {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: var(--ui-space-2);
  width: 1rem;
  height: 1rem;
  transform: translateY(-50%);
}

.demo-search-layer--candidate :deep(.ui-search-box__clear) {
  position: absolute;
  inset-block: calc(-1 * var(--ui-border-width));
  inset-inline-end: 0;
  width: 2rem;
  border-start-end-radius: var(--ui-field-radius);
  border-end-end-radius: var(--ui-field-radius);
}

.demo-search-layer--candidate :deep(.ui-search-box__clear)::before {
  content: '';
  position: absolute;
  z-index: 0;
  inset-block: var(--ui-border-width);
  inset-inline: 0 var(--ui-border-width);
  border-start-end-radius: calc(
    var(--ui-field-radius) - var(--ui-border-width)
  );
  border-end-end-radius: calc(var(--ui-field-radius) - var(--ui-border-width));
  background: transparent;
  pointer-events: none;
}

.demo-search-layer--candidate :deep(.ui-search-box__clear > svg) {
  position: relative;
  z-index: 1;
}

.demo-search-layer--candidate
  :deep(
    .ui-search-box__control:hover:not(:has(.ui-search-box__input:disabled))
  ) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-bg-hover);
}

.demo-search-layer--candidate
  :deep(.ui-search-box__clear:hover:not(:disabled)) {
  color: var(--ui-color-text);
}

.demo-search-layer--candidate
  :deep(.ui-search-box__clear:hover:not(:disabled))::before {
  background: var(--ui-color-surface-hover);
}

.demo-search-layer--candidate
  :deep(.ui-search-box__clear:active:not(:disabled)) {
  color: var(--ui-color-text);
}

.demo-search-layer--candidate
  :deep(.ui-search-box__clear:active:not(:disabled))::before {
  background: var(--ui-color-surface-active);
}

.demo-search-layer--candidate :deep(.ui-search-box__clear:focus-visible) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.demo-search-layer--candidate
  :deep(.ui-search-box__control:has(.ui-search-box__clear:focus-visible)) {
  outline: 0;
}

.demo-search-layer--candidate
  :deep(.ui-search-box__control:has(.ui-search-box__input:disabled)) {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}

.demo-search-layer--candidate :deep(.ui-search-box__input:disabled),
.demo-search-layer--candidate :deep(.ui-search-box__clear:disabled) {
  -webkit-user-select: none;
  user-select: none;
  opacity: 1;
}

.demo-search-layer--candidate
  :deep(.ui-search-box__input::-webkit-search-cancel-button) {
  -webkit-appearance: none;
  appearance: none;
}

.demo-search-layer--current {
  --demo-current-field-height: 1.875rem;
  --demo-current-field-bg: #344046;
  --demo-current-field-bg-hover: #3a464c;
  --demo-current-field-fg: #f7f1e7;
  --demo-current-field-placeholder: #aeb8b6;
  --demo-current-field-border: #3c4749;
  --demo-current-field-border-hover: #586568;
  --demo-current-focus: #dd7a64;

  --ui-field-height: var(--demo-current-field-height);
  --ui-field-bg: var(--demo-current-field-bg);
  --ui-field-bg-hover: var(--demo-current-field-bg-hover);
  --ui-field-fg: var(--demo-current-field-fg);
  --ui-field-placeholder: var(--demo-current-field-placeholder);
  --ui-field-border: var(--demo-current-field-border);
  --ui-field-border-hover: var(--demo-current-field-border-hover);
  --ui-color-focus: var(--demo-current-focus);
  --ui-color-text: var(--demo-current-field-fg);
  --ui-color-text-muted: var(--demo-current-field-placeholder);
}

:global(:root[data-ui-theme='light'] .demo-search-layer--current) {
  --demo-current-field-bg: #edf2ef;
  --demo-current-field-bg-hover: #e4ece8;
  --demo-current-field-fg: #1f2328;
  --demo-current-field-placeholder: #69747a;
  --demo-current-field-border: #d8ded9;
  --demo-current-field-border-hover: #b9c4c0;
  --demo-current-focus: #d26a45;
}

@container (max-width: 48rem) {
  .demo-search-layer__header,
  .demo-search-state-review__header,
  .demo-search-foundation {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-search-layer__header {
    align-items: start;
    gap: var(--ui-space-1);
  }

  .demo-search-state-review__header {
    align-items: start;
    gap: var(--ui-space-1);
  }

  .demo-search-foundation__block--anatomy {
    grid-column: auto;
  }

  .demo-search-layer__reference > div {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>
